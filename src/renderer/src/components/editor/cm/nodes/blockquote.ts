/**
 * 引用块插件：`> 引用`。
 * - 每行加左条样式（行装饰），文字弱化
 * - QuoteMark（> 号）光标不在引用内时隐藏（多吞一个后随空格）
 */
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import type { MarkdownPlugin, NodeRenderer } from '../core/types'

const blockquoteLineRenderer: NodeRenderer = {
    nodeTypes: ['Blockquote'],
    render(ctx, node) {
        const first = ctx.state.doc.lineAt(node.from).number
        const last = ctx.state.doc.lineAt(node.to).number
        for (let n = first; n <= last; n++) {
            ctx.line(ctx.state.doc.line(n).from, 'cm-quote-line')
        }
        return true // 继续：QuoteMark 由下面的渲染器处理
    }
}

const quoteMarkRenderer: NodeRenderer = {
    nodeTypes: ['QuoteMark'],
    render(ctx, node) {
        const parent = node.parent
        if (!parent) return
        if (ctx.touches(parent.from, parent.to)) return
        let to = node.to
        if (ctx.state.sliceDoc(to, to + 1) === ' ') to += 1
        ctx.conceal(node.from, to)
    }
}

export const blockquotePlugin: MarkdownPlugin = {
    id: 'blockquote',
    title: '引用',
    description: '> 文本 渲染为引用块（左条 + 弱化文字）',
    category: 'node',
    defaultEnabled: true,
    extensions: [
        syntaxHighlighting(HighlightStyle.define([{ tag: t.quote, class: 'cm-quote-line' }]))
    ],
    renderers: [blockquoteLineRenderer, quoteMarkRenderer]
}
