/**
 * 标题插件：`# 标题`。
 * - 渲染 = HighlightStyle 给整个标题节点按层级设置字号字重（非 widget 替换）
 * - HeaderMark（# 号）光标不在标题行（或选区未覆盖）时隐藏；进入标题行时显示 `# `
 * 注意：lezer 语法树中标题节点名为 ATXHeading1..6 / SetextHeading1..2，
 * 没有统一的 'Heading' 节点，父节点判断须用 includes('Heading')。
 */
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import type { MarkdownPlugin, NodeRenderer } from '../core/types'

const headerMarkRenderer: NodeRenderer = {
    nodeTypes: ['HeaderMark'],
    render(ctx, node) {
        const parent = node.parent
        if (!parent || !parent.name.includes('Heading')) return
        // setext 标题的标记在第二行，隐藏会让整行变成空行
        if (ctx.state.doc.lineAt(node.from).number !== ctx.state.doc.lineAt(parent.from).number) {
            return
        }
        if (ctx.touches(parent.from, parent.to)) return // 光标在本行/选区覆盖：显示源码
        // 隐藏 `#` 及其后随一个空格；`### ` 后没有标题文本时保持显示（否则整行空白）
        let to = node.to
        if (ctx.state.sliceDoc(to, to + 1) === ' ') to += 1
        if (to >= parent.to) return
        ctx.conceal(node.from, to)
    }
}

export const headingPlugin: MarkdownPlugin = {
    id: 'heading',
    title: '标题',
    description: '# 到 ###### 渲染为各级标题字号',
    category: 'node',
    defaultEnabled: true,
    extensions: [
        syntaxHighlighting(
            HighlightStyle.define([
                { tag: t.heading1, class: 'cm-h1' },
                { tag: t.heading2, class: 'cm-h2' },
                { tag: t.heading3, class: 'cm-h3' },
                { tag: t.heading4, class: 'cm-h4' },
                { tag: t.heading5, class: 'cm-h5' },
                { tag: t.heading6, class: 'cm-h6' }
            ])
        )
    ],
    renderers: [headerMarkRenderer]
}
