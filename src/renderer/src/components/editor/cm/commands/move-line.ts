/**
 * 移动行插件：Alt+↑/↓。
 * - 列表内：按整个列表项（含子项）与相邻块交换
 * - 其余（含代码块内）：按行移动（@codemirror/commands 的 moveLineUp/Down）
 */
import { moveLineDown as builtinDown, moveLineUp as builtinUp } from '@codemirror/commands'
import { keymap } from '@codemirror/view'
import type { EditorView } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import type { MarkdownPlugin } from '../core/types'
import { settledTree } from '../core/syntax'
import { canEdit } from '../core/readonly'

/** 光标所在列表项（含 Task）的整行范围；不在列表内返回 null */
function listItemSpan(view: EditorView): { from: number; to: number } | null {
    const { state } = view
    const head = state.selection.main.head
    const tree = settledTree(state, head)
    let node: SyntaxNode | null = tree.resolveInner(head, -1)
    let item: SyntaxNode | null = null
    while (node) {
        if (node.name === 'ListItem' || node.name === 'Task') {
            item = node
            break
        }
        if (node.name === 'FencedCode') return null // 代码块内交给内置行移动
        node = node.parent
    }
    if (!item) return null
    const first = state.doc.lineAt(item.from)
    const last = state.doc.lineAt(item.to)
    return { from: first.from, to: last.to }
}

/** 与紧邻的上方块（列表项或行）交换 */
function moveItemUp(view: EditorView): boolean {
    if (!canEdit(view)) return false // 预览模式不移动
    const { state } = view
    if (state.selection.ranges.length > 1) return builtinUp(view)
    const item = listItemSpan(view)
    if (!item) return builtinUp(view)
    if (item.from === 0) return false
    const aboveLine = state.doc.lineAt(item.from - 1)
    const aboveSpan = listItemSpanAt(view, aboveLine.from) ?? {
        from: aboveLine.from,
        to: aboveLine.to
    }
    if (aboveSpan.to >= item.from) return builtinUp(view) // 区间重叠异常：退化为行移动
    const textA = state.sliceDoc(aboveSpan.from, aboveSpan.to)
    const textB = state.sliceDoc(item.from, item.to)
    const head = state.selection.main.head
    const headOffset = head - item.from
    view.dispatch(
        state.update({
            changes: [
                { from: aboveSpan.from, to: aboveSpan.to, insert: textB },
                { from: item.from, to: item.to, insert: textA }
            ],
            selection: { anchor: aboveSpan.from + headOffset }
        }),
        { scrollIntoView: true, userEvent: 'move' }
    )
    return true
}

function moveItemDown(view: EditorView): boolean {
    if (!canEdit(view)) return false // 预览模式不移动
    const { state } = view
    if (state.selection.ranges.length > 1) return builtinDown(view)
    const item = listItemSpan(view)
    if (!item) return builtinDown(view)
    const lastLine = state.doc.lineAt(item.to)
    if (lastLine.to >= state.doc.length) return false
    const nextLine = state.doc.line(lastLine.number + 1)
    const belowSpan = listItemSpanAt(view, nextLine.from) ?? {
        from: nextLine.from,
        to: nextLine.to
    }
    if (belowSpan.from <= item.to) return builtinDown(view)
    const textA = state.sliceDoc(item.from, item.to)
    const textB = state.sliceDoc(belowSpan.from, belowSpan.to)
    const head = state.selection.main.head
    const headOffset = head - item.from
    view.dispatch(
        state.update({
            changes: [
                { from: item.from, to: item.to, insert: textB },
                { from: belowSpan.from, to: belowSpan.to, insert: textA }
            ],
            selection: { anchor: belowSpan.from + headOffset }
        }),
        { scrollIntoView: true, userEvent: 'move' }
    )
    return true
}

/** 指定位置若在列表项内，返回该项整行范围 */
function listItemSpanAt(view: EditorView, pos: number): { from: number; to: number } | null {
    const { state } = view
    const tree = settledTree(state, pos)
    let node: SyntaxNode | null = tree.resolveInner(pos, -1)
    let item: SyntaxNode | null = null
    while (node) {
        if (node.name === 'ListItem' || node.name === 'Task') {
            item = node
            break
        }
        node = node.parent
    }
    if (!item) return null
    const first = state.doc.lineAt(item.from)
    const last = state.doc.lineAt(item.to)
    return { from: first.from, to: last.to }
}

export const moveLinePlugin: MarkdownPlugin = {
    id: 'move-line',
    title: '移动行',
    description: 'Alt+↑/↓ 移动当前行（列表内为整个列表项）',
    category: 'command',
    defaultEnabled: true,
    extensions: [
        keymap.of([
            { key: 'Alt-ArrowUp', run: moveItemUp },
            { key: 'Alt-ArrowDown', run: moveItemDown }
        ])
    ]
}
