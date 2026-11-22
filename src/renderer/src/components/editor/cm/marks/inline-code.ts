/**
 * 行内代码插件：`` `code` ``（Code 节点）。
 * 注意 CodeMark 也被围栏代码块用作 ``` 标记：这里按父节点分流，
 * 只有行内 Code 下的 CodeMark 才隐藏（围栏围栏符保持可见，见 nodes/code-block.ts）。
 */
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import type { MarkdownPlugin, NodeRenderer } from '../core/types'

const inlineCodeMarkRenderer: NodeRenderer = {
    nodeTypes: ['CodeMark'],
    render(ctx, node) {
        const parent = node.parent
        if (!parent || parent.name !== 'Code') return
        if (ctx.touches(parent.from, parent.to)) return
        ctx.conceal(node.from, node.to)
    }
}

export const inlineCodePlugin: MarkdownPlugin = {
    id: 'inline-code',
    title: '行内代码',
    description: '`代码` 以等宽字体渲染',
    category: 'mark',
    defaultEnabled: true,
    extensions: [
        syntaxHighlighting(HighlightStyle.define([{ tag: t.monospace, class: 'cm-inline-code' }]))
    ],
    renderers: [inlineCodeMarkRenderer]
}
