/**
 * 链接插件：`[文本](URL)` 渲染为可点击链接。
 * - 光标不在链接内：隐藏 LinkMark 与 URL/标题，仅保留标签文本并着色
 * - 引用式链接（[foo][bar]，无 URL 子节点）保持源码不动
 * - Ctrl/Cmd+点击：通过主进程 shell.openExternal 打开（仅 http/https 放行）
 */
import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import type { SyntaxNode } from '@lezer/common'
import type { MarkdownPlugin, NodeRenderer } from '../core/types'
import { currentTree } from '../core/syntax'

const linkRenderer: NodeRenderer = {
    nodeTypes: ['Link'],
    render(ctx, node) {
        const link = node
        // 仅内联形式（含 URL 子节点）可折叠渲染
        if (!link.getChild('URL')) return
        if (ctx.touches(node.from, node.to)) return
        // 找到标签闭括号 `](` 所在的 LinkMark：其后的 URL/标题才是链接目标。
        // 标签本身可能也是 URL 形态（如 [https://a.dev](https://a.dev)，GFM Autolink
        // 会把标签解析成 URL 节点），必须保留，否则整条链接会渲染成空白
        let targetStart = Number.MAX_SAFE_INTEGER
        for (const child of link.getChildren('LinkMark')) {
            if (ctx.state.sliceDoc(child.from, child.from + 1) === ']') {
                targetStart = child.from
                break
            }
        }
        for (const child of link.getChildren('LinkMark')) {
            ctx.conceal(child.from, child.to)
        }
        for (const child of [...link.getChildren('URL'), ...link.getChildren('LinkTitle')]) {
            if (child.from >= targetStart) ctx.conceal(child.from, child.to)
        }
        ctx.mark(node.from, node.to, 'cm-link')
    }
}

/** `<https://…>` 自动链接：只着色（尖括号保留，文本即 URL） */
const autolinkRenderer: NodeRenderer = {
    nodeTypes: ['Autolink'],
    render(ctx, node) {
        ctx.mark(node.from, node.to, 'cm-link')
    }
}

/** Ctrl/Cmd+点击跟随链接 */
function openLinkOnClick(): Extension {
    return EditorView.domEventHandlers({
        mousedown(event, view) {
            if (!(event.ctrlKey || event.metaKey)) return false
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
            if (pos == null) return false
            const tree = currentTree(view.state)
            let node: SyntaxNode | null = tree.resolveInner(pos, -1)
            while (
                node &&
                node.name !== 'Link' &&
                node.name !== 'Image' &&
                node.name !== 'Autolink'
            ) {
                node = node.parent
            }
            if (!node) return false
            const url = node.getChild('URL') ?? node.getChild('LinkLabel')
            if (!url) return false
            const href = view.state.sliceDoc(url.from, url.to).replace(/^<|>$/g, '')
            event.preventDefault()
            window.electronAPI.system.openExternal(href)
            return true
        }
    })
}

export const linkPlugin: MarkdownPlugin = {
    id: 'link',
    title: '链接',
    description: '[文本](URL) 渲染为链接，Ctrl+点击打开',
    category: 'node',
    defaultEnabled: true,
    extensions: [
        syntaxHighlighting(
            HighlightStyle.define([
                { tag: t.link, class: 'cm-link' },
                { tag: t.url, class: 'cm-url' }
            ])
        ),
        openLinkOnClick()
    ],
    renderers: [linkRenderer, autolinkRenderer]
}
