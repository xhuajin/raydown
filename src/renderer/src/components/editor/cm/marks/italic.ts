/**
 * 斜体插件：`*text*`（Emphasis 节点）。
 */
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { keymap } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import type { MarkdownPlugin, NodeRenderer } from '../core/types'
import { toggleWrap } from './wrap'

const italicMarkRenderer: NodeRenderer = {
    nodeTypes: ['EmphasisMark'],
    render(ctx, node) {
        const parent = node.parent
        if (!parent || parent.name !== 'Emphasis') return
        if (ctx.touches(parent.from, parent.to)) return
        ctx.conceal(node.from, node.to)
    }
}

export const italicPlugin: MarkdownPlugin = {
    id: 'italic',
    title: '斜体',
    description: '*文本* 渲染为斜体，Ctrl+I 切换',
    category: 'mark',
    defaultEnabled: true,
    extensions: [
        syntaxHighlighting(HighlightStyle.define([{ tag: t.emphasis, class: 'cm-em' }])),
        keymap.of([{ key: 'Mod-i', run: (view) => toggleWrap(view, '*') }])
    ],
    renderers: [italicMarkRenderer]
}
