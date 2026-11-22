/**
 * 删除线插件：`~~text~~`（GFM Strikethrough，基础方言已含解析）。
 */
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import type { MarkdownPlugin, NodeRenderer } from '../core/types'

const strikeMarkRenderer: NodeRenderer = {
    nodeTypes: ['StrikethroughMark'],
    render(ctx, node) {
        const parent = node.parent
        if (!parent || parent.name !== 'Strikethrough') return
        if (ctx.touches(parent.from, parent.to)) return
        ctx.conceal(node.from, node.to)
    }
}

export const strikethroughPlugin: MarkdownPlugin = {
    id: 'strikethrough',
    title: '删除线',
    description: '~~文本~~ 渲染为删除线',
    category: 'mark',
    defaultEnabled: true,
    extensions: [
        syntaxHighlighting(HighlightStyle.define([{ tag: t.strikethrough, class: 'cm-strike' }]))
    ],
    renderers: [strikeMarkRenderer]
}
