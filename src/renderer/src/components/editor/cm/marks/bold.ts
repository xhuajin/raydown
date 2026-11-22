/**
 * 加粗插件：`**text**`。
 * - 内容样式走 HighlightStyle（t.strong 标签覆盖整个 StrongEmphasis 节点）
 * - `**` 语法符光标离开父元素范围时隐藏（判定单位是父元素完整范围，非单个标记）
 */
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { keymap } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import type { MarkdownPlugin, NodeRenderer } from '../core/types'
import { toggleWrap } from './wrap'

/** EmphasisMark 同时出现在 Emphasis（斜体）与 StrongEmphasis（加粗）下，按父节点分流 */
const boldMarkRenderer: NodeRenderer = {
    nodeTypes: ['EmphasisMark'],
    render(ctx, node) {
        const parent = node.parent
        if (!parent || parent.name !== 'StrongEmphasis') return
        if (ctx.touches(parent.from, parent.to)) return
        ctx.conceal(node.from, node.to)
    }
}

export const boldPlugin: MarkdownPlugin = {
    id: 'bold',
    title: '加粗',
    description: '**文本** 渲染为加粗，Ctrl+B 切换',
    category: 'mark',
    defaultEnabled: true,
    extensions: [
        syntaxHighlighting(HighlightStyle.define([{ tag: t.strong, class: 'cm-strong' }])),
        keymap.of([{ key: 'Mod-b', run: (view) => toggleWrap(view, '**') }])
    ],
    renderers: [boldMarkRenderer]
}
