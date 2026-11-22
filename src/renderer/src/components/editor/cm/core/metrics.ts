/**
 * 字体度量：用隐藏 DOM 探针按内容区当前字体测量文本的像素宽度。
 * 列表悬挂缩进需要"前缀源码的实际渲染宽度"——空格宽度 ≠ 字符宽度，
 * 用 ch/em 单位估算误差太大。DOM 探针与实际渲染走同一套布局引擎，
 * 比 canvas measureText 更精确（canvas 与 DOM 对空格的推进宽度有可感知差异）。
 * 结果按 (字体, 文本) 缓存；webfont 加载完成后清缓存重测。
 */
import type { EditorView } from '@codemirror/view'

interface FontInfo {
    /** 可直接赋给元素样式的字体简写 */
    css: string
    fontSizePx: number
}

const fontCache = new WeakMap<EditorView, FontInfo>()
const widthCache = new Map<string, number>()
let probe: HTMLElement | null = null

/** 内容区的字体信息（每个 view 只算一次） */
export function fontInfoOf(view: EditorView): FontInfo {
    const hit = fontCache.get(view)
    if (hit) return hit
    const style = getComputedStyle(view.contentDOM)
    const info: FontInfo = {
        css: `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
        fontSizePx: parseFloat(style.fontSize) || 14
    }
    fontCache.set(view, info)
    return info
}

/** 按内容区当前字体测量文本像素宽度（DOM 探针，white-space: pre 保留空格） */
export function measureTextWidth(view: EditorView, text: string): number {
    if (!text) return 0
    const font = fontInfoOf(view)
    const key = `${font.css}\u0000${text}`
    const hit = widthCache.get(key)
    if (hit !== undefined) return hit
    if (!probe) {
        probe = document.createElement('span')
        probe.style.cssText =
            'position:absolute;top:-9999px;left:-9999px;white-space:pre;visibility:hidden;'
        document.body.appendChild(probe)
    }
    probe.style.font = font.css
    probe.textContent = text
    const width = probe.getBoundingClientRect().width
    widthCache.set(key, width)
    return width
}

// webfont 异步加载完成后清空缓存，避免用回退字体测得的宽度被长期缓存；
// 下一次装饰重建即用正确字体重新测量
if (typeof document !== 'undefined' && document.fonts) {
    void document.fonts.ready.then(() => widthCache.clear())
}
