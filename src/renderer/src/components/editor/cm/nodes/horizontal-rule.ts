/**
 * 分割线插件：`---` / `***` 整行替换为水平线 widget。
 * 单行内替换（不含换行符），ViewPlugin 提供合法；光标触碰时露出源码。
 */
import type { MarkdownPlugin, NodeRenderer } from '../core/types'
import { HorizontalRuleWidget } from '../core/widgets'

const hrRenderer: NodeRenderer = {
    nodeTypes: ['HorizontalRule'],
    render(ctx, node) {
        if (ctx.touches(node.from, node.to)) {
            ctx.mark(node.from, node.to, 'cm-syntax-mark')
            return
        }
        ctx.conceal(node.from, node.to, new HorizontalRuleWidget())
        return false
    }
}

export const horizontalRulePlugin: MarkdownPlugin = {
    id: 'horizontal-rule',
    title: '分割线',
    description: '--- 渲染为水平分割线',
    category: 'node',
    defaultEnabled: true,
    renderers: [hrRenderer]
}
