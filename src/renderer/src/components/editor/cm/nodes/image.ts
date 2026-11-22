/**
 * 图片插件：`![alt](src)` 替换为真实 <img>。
 * 只渲染可安全展示的来源（ray-image:// 粘贴图 / http(s) / data: / 常见图片扩展名），
 * 其余保持源码。光标触碰时露出源码进入编辑。
 */
import type { EditorState } from '@codemirror/state'
import type { SyntaxNode } from '@lezer/common'
import type { MarkdownPlugin, NodeRenderer } from '../core/types'
import { ImageWidget } from '../core/widgets'

const RENDERABLE =
    /^(https?:\/\/|data:image\/|ray-image:\/\/)|\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i

function imageSrc(state: EditorState, image: SyntaxNode): string | null {
    const url = image.getChild('URL')
    if (!url) return null
    const src = state.sliceDoc(url.from, url.to)
    return RENDERABLE.test(src) ? src : null
}

function imageAlt(state: EditorState, image: SyntaxNode): string {
    // alt 文本位于第一个（![）与第二个（](）LinkMark 之间
    const marks = image.getChildren('LinkMark')
    if (marks.length >= 2) return state.sliceDoc(marks[0].to, marks[1].from)
    return ''
}

const imageRenderer: NodeRenderer = {
    nodeTypes: ['Image'],
    render(ctx, node) {
        const image = node.node
        const src = imageSrc(ctx.state, image)
        if (!src) return
        if (ctx.touches(node.from, node.to)) return
        ctx.conceal(node.from, node.to, new ImageWidget(src, imageAlt(ctx.state, image)))
        return false
    }
}

export const imagePlugin: MarkdownPlugin = {
    id: 'image',
    title: '图片',
    description: '![alt](src) 渲染为图片（光标进入时显示源码）',
    category: 'node',
    defaultEnabled: true,
    renderers: [imageRenderer]
}
