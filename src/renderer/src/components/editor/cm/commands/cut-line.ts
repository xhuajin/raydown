/**
 * 剪切行插件：Ctrl+X 无选区时扩选当前"逻辑块"再交给系统剪切。
 * - 代码块内：当前行
 * - 列表内：整个列表项（含嵌套子项）
 * - 其余：所在顶层块（段落/标题/引用等整块）
 * 有选区时不接管（返回 false 走 CM 默认剪切）。
 */
import { keymap } from '@codemirror/view'
import type { EditorView } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import type { MarkdownPlugin } from '../core/types'
import { settledTree } from '../core/syntax'
import { canEdit } from '../core/readonly'

/** 把节点范围扩成整行范围（含行尾换行符） */
function fullLineSpan(
    state: EditorView['state'],
    from: number,
    to: number
): { from: number; to: number } {
    const first = state.doc.lineAt(from)
    const last = state.doc.lineAt(to)
    const end = last.to < state.doc.length ? last.to + 1 : last.to // 尽量带上换行
    return { from: first.from, to: Math.min(end, state.doc.length) }
}

/** 从 pos 向上找 Document 的直接子块 */
function topLevelBlock(tree: ReturnType<typeof settledTree>, pos: number): SyntaxNode {
    let node: SyntaxNode | null = tree.resolveInner(pos, -1)
    while (node.parent && node.parent.name !== 'Document') node = node.parent
    return node
}

function cutBlock(view: EditorView): boolean {
    if (!canEdit(view)) return false // 预览模式不剪切
    const { state } = view
    const sel = state.selection.main
    if (!sel.empty) return false
    if (state.selection.ranges.length > 1) return false

    const head = sel.head
    const tree = settledTree(state, head)
    const node = tree.resolveInner(head, -1)

    // 代码块内剪行
    let inCode = false
    for (let n: SyntaxNode | null = node; n; n = n.parent) {
        if (n.name === 'FencedCode') {
            inCode = true
            break
        }
    }

    let span: { from: number; to: number }
    if (inCode) {
        const line = state.doc.lineAt(head)
        span = { from: line.from, to: Math.min(line.to + 1, state.doc.length) }
    } else {
        // 列表项整项（含子项），其余取顶层块
        for (let n: SyntaxNode | null = node; n; n = n.parent) {
            if (n.name === 'ListItem' || n.name === 'Task') {
                span = fullLineSpan(state, n.from, n.to)
                view.dispatch(state.update({ selection: { anchor: span.from, head: span.to } }))
                return false // 交给系统默认剪切（此时选区已是目标范围）
            }
        }
        const block = topLevelBlock(tree, head)
        if (block.name === 'Document') return false
        span = fullLineSpan(state, block.from, block.to)
    }

    view.dispatch(state.update({ selection: { anchor: span.from, head: span.to } }))
    return false // 改选区后放行：随后的系统剪切以新选区为准
}

export const cutLinePlugin: MarkdownPlugin = {
    id: 'cut-line',
    title: '剪切行',
    description: 'Ctrl+X 无选区时剪切当前块（代码行/列表项/顶层块）',
    category: 'command',
    defaultEnabled: true,
    extensions: [keymap.of([{ key: 'Mod-x', run: cutBlock }])]
}
