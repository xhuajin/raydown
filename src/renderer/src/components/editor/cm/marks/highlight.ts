/**
 * 高亮插件：`==文本==`。
 * GFM 不含高亮语法，这里以自定义 lezer inline parser（Delimiters 机制，参考
 * reference/src/editor/strikethrough.ts 的写法）产出 Highlight / HighlightMark 节点。
 * 关闭插件 → 无方言解析，`==文本==` 显示纯文本源码，Ctrl+H 失效。
 */
import { keymap } from '@codemirror/view'
import type { DelimiterType, MarkdownConfig } from '@lezer/markdown'
import type { MarkdownPlugin, NodeRenderer } from '../core/types'
import { toggleWrap } from './wrap'

const EQUAL = 61 // '='
const SPACE = /\s|^$/

const HighlightDelim: DelimiterType = { resolve: 'Highlight', mark: 'HighlightMark' }

/** `==…==`：开侧后随字符非空白、闭侧前驱字符非空白（与 Emphasis 的 flanking 规则一致） */
export const highlightParse: MarkdownConfig = {
    defineNodes: [{ name: 'Highlight' }, { name: 'HighlightMark' }],
    parseInline: [
        {
            name: 'Highlight',
            parse(cx, next, pos) {
                if (next !== EQUAL || cx.char(pos + 1) !== EQUAL) return -1
                const end = pos + 2
                const after = cx.slice(end, end + 1)
                const before = cx.slice(pos - 1, pos)
                // 开侧：== 后不能是空白；闭侧：== 前不能是空白
                return cx.addDelimiter(
                    HighlightDelim,
                    pos,
                    end,
                    !SPACE.test(after),
                    !SPACE.test(before)
                )
            },
            after: 'Emphasis'
        }
    ]
}

const highlightMarkRenderer: NodeRenderer = {
    nodeTypes: ['HighlightMark'],
    render(ctx, node) {
        const parent = node.parent
        if (!parent || parent.name !== 'Highlight') return
        if (ctx.touches(parent.from, parent.to)) return
        ctx.conceal(node.from, node.to)
    }
}

const highlightContentRenderer: NodeRenderer = {
    nodeTypes: ['Highlight'],
    render(ctx, node) {
        ctx.mark(node.from, node.to, 'cm-highlight')
    }
}

export const highlightPlugin: MarkdownPlugin = {
    id: 'highlight',
    title: '高亮',
    description: '==文本== 渲染为高亮底色，Ctrl+H 切换',
    category: 'mark',
    defaultEnabled: true,
    parse: highlightParse,
    extensions: [keymap.of([{ key: 'Mod-h', run: (view) => toggleWrap(view, '==') }])],
    renderers: [highlightContentRenderer, highlightMarkRenderer]
}
