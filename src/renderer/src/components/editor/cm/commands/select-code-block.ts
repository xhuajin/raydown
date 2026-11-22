/**
 * 选中代码块插件：Ctrl+A 在围栏代码块内只选块内容（两围栏之间），
 * 其余位置放行 CM 默认全选。
 */
import { keymap } from '@codemirror/view'
import type { EditorView } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import type { MarkdownPlugin } from '../core/types'
import { settledTree } from '../core/syntax'

function selectCodeBlock(view: EditorView): boolean {
    const { state } = view
    if (state.selection.ranges.length > 1) return false
    const head = state.selection.main.head
    const tree = settledTree(state, head)
    let node: SyntaxNode | null = tree.resolveInner(head, -1)
    let code: SyntaxNode | null = null
    while (node) {
        if (node.name === 'FencedCode') {
            code = node
            break
        }
        node = node.parent
    }
    if (!code) return false

    const first = state.doc.lineAt(code.from)
    const last = state.doc.lineAt(code.to)
    // 单行围栏（```x```）：选整块；多行：选两围栏行之间的内容
    const content =
        first.number === last.number
            ? { from: code.from, to: code.to }
            : { from: first.to + 1, to: last.from }
    view.dispatch(state.update({ selection: { anchor: content.from, head: content.to } }), {
        scrollIntoView: true,
        userEvent: 'select'
    })
    return true
}

export const selectCodeBlockPlugin: MarkdownPlugin = {
    id: 'select-code-block',
    title: '选中代码块',
    description: 'Ctrl+A 在代码块内只选块内容',
    category: 'command',
    defaultEnabled: true,
    extensions: [keymap.of([{ key: 'Mod-a', run: selectCodeBlock }])]
}
