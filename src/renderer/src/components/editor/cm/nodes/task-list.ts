/**
 * 任务列表插件：`- [ ]` / `- [x]`。
 * - marker 盒子：整个 `- [ ] ` 前缀（dash + checkbox）渲染为固定宽度 inline-flex 盒
 *   （宽度 = 源码前缀实测宽，由 list.ts 的 renderedGeometry 提供），显隐两态宽度一致，
 *   光标移入移出零位移；光标不在标记处时替换为可点击 checkbox（点击只改写括号内一个字符）
 * - 勾选后本行内容加删除线
 * - Ctrl+L：非任务行加 `- [ ] `（空行也会加，缩进保留在行首）；任务项只在勾选/未勾选间切换，
 *   全部基于位置精准改写一个字符，绝不触碰行内其余内容
 * - Enter 在任务项上手动延续 `- [ ] `（官方 insertNewlineContinueMarkup 不补任务标记）
 */
import { keymap } from '@codemirror/view'
import type { EditorView } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import type { MarkdownPlugin, NodeRenderer } from '../core/types'
import { settledTree } from '../core/syntax'
import { canEdit } from '../core/readonly'
import { ListMarkerBoxWidget } from '../core/widgets'
import { renderedGeometry } from './list'

const taskMarkerRenderer: NodeRenderer = {
    nodeTypes: ['TaskMarker'],
    render(ctx, node) {
        const task = node.parent // Task 块
        const item = task?.parent // ListItem
        if (!task || !item) return
        const geom = renderedGeometry(ctx, item)
        if (!geom) return
        const checked = geom.taskChecked === true
        // 勾选态：标记之后的内容加删除线
        if (checked) ctx.mark(node.to, task.to, 'cm-task-done')
        // marker 盒子（- [ ] 整段前缀）：光标进入盒子内部时显示源码（同宽 inline-block 盒；
        // touchesInner 让光标停在紧随 checkbox 的文本前时不露出）
        const w = `${Math.round(geom.boxPx * 100) / 100}px`
        if (ctx.touchesInner(geom.boxFrom, geom.boxTo)) {
            ctx.mark(geom.boxFrom, geom.boxTo, 'cm-marker-box', `width: ${w}`)
        } else {
            ctx.concealInner(
                geom.boxFrom,
                geom.boxTo,
                new ListMarkerBoxWidget(geom.boxPx, 'task', checked, node.from)
            )
        }
        return false
    }
}

/** Ctrl+L：非任务行 → 加 `- [ ] ` 前缀；任务项 → 在勾选/未勾选间切换。支持选区多行 */
function toggleTask(view: EditorView): boolean {
    if (!canEdit(view)) return false // 预览模式不改写
    const { state } = view
    const sel = state.selection.main
    const startLine = state.doc.lineAt(sel.from).number
    const endLine = state.doc.lineAt(sel.to).number
    const changes: { from: number; to: number; insert: string }[] = []
    // 单光标且改动发生在光标处（空行等）时，把光标带到插入文本之后
    const singleCursor = state.selection.ranges.length === 1 && sel.empty
    const cursorLine = singleCursor ? startLine : -1
    let cursorAfter: number | null = null
    for (let n = startLine; n <= endLine; n++) {
        const line = state.doc.line(n)
        const text = line.text
        // 已是任务项：只翻转括号内那一个字符（位置计算自捕获组，不触碰行内其余内容）
        const taskMatch = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)\[([ xX])\]/.exec(text)
        if (taskMatch) {
            const checked = taskMatch[4].toLowerCase() === 'x'
            const bracketCharPos =
                line.from + taskMatch[1].length + taskMatch[2].length + taskMatch[3].length + 1
            changes.push({
                from: bracketCharPos,
                to: bracketCharPos + 1,
                insert: checked ? ' ' : 'x'
            })
            continue
        }
        // 列表项但非任务：在 marker 的空白之后插入 [ ]
        const bulletMatch = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)/.exec(text)
        if (bulletMatch) {
            const pos = line.from + bulletMatch[0].length
            changes.push({ from: pos, to: pos, insert: '[ ] ' })
            if (n === cursorLine && sel.head <= pos) cursorAfter = pos + '[ ] '.length
            continue
        }
        // 其余（含空行/纯空白行）：在行首缩进之后加 `- [ ] `
        const indent = /^[\t ]*/.exec(text)![0]
        const pos = line.from + indent.length
        changes.push({ from: pos, to: pos, insert: '- [ ] ' })
        if (n === cursorLine && sel.head <= pos) cursorAfter = pos + '- [ ] '.length
    }
    if (changes.length === 0) return false
    view.dispatch(
        state.update(
            {
                changes,
                ...(cursorAfter !== null ? { selection: { anchor: cursorAfter } } : {})
            },
            { scrollIntoView: true, userEvent: 'input.toggleTask' }
        )
    )
    return true
}

/** 光标所在处的 Task 节点范围（不在任务项内返回 null） */
function taskAt(view: EditorView, pos: number): { from: number; to: number } | null {
    const tree = settledTree(view.state, pos)
    let node: SyntaxNode | null = tree.resolveInner(pos, -1)
    while (node) {
        if (node.name === 'Task') return { from: node.from, to: node.to }
        node = node.parent
    }
    return null
}

/** Enter：任务项内手动延续 `- [ ] `；空任务项交给官方命令退出列表 */
function taskEnter(view: EditorView): boolean {
    if (!canEdit(view)) return false // 预览模式不改写
    const { state } = view
    const sel = state.selection.main
    if (!sel.empty || state.selection.ranges.length > 1) return false
    const head = sel.head
    const task = taskAt(view, head)
    if (!task) return false
    // TaskMarker 固定 3 字节（[x]/[ ]），其后是任务内容
    const content = state.sliceDoc(task.from + 3, task.to)
    if (!/\S/.test(content)) return false // 空任务项：官方命令负责退出列表

    // 延续行：与当前行同缩进 + 同 marker + [ ]
    const line = state.doc.lineAt(head)
    const tree = settledTree(state, head)
    let listItem: SyntaxNode | null = tree.resolveInner(head, -1)
    while (listItem && listItem.name !== 'ListItem') listItem = listItem.parent
    const listMark = listItem?.getChild('ListMark')
    if (!listItem || !listMark) return false
    const marker = state.sliceDoc(listMark.from, listMark.to)
    const indent = state.sliceDoc(line.from, listMark.from)
    const insert = `${state.lineBreak}${indent}${marker} [ ] `
    view.dispatch(
        state.update(
            { changes: { from: head, insert }, selection: { anchor: head + insert.length } },
            { scrollIntoView: true, userEvent: 'input' }
        )
    )
    return true
}

export const taskListPlugin: MarkdownPlugin = {
    id: 'task-list',
    title: '任务列表',
    description: '- [ ] 任务清单：可点击勾选，Ctrl+L 添加/切换',
    category: 'node',
    defaultEnabled: true,
    extensions: [
        keymap.of([
            { key: 'Mod-l', run: toggleTask },
            { key: 'Enter', run: taskEnter }
        ])
    ],
    renderers: [taskMarkerRenderer]
}
