import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { marked } from 'marked'

/**
 * 剪贴板粘贴统一处理。按优先级接管：
 *
 * a) Shift+粘贴（Ctrl/Cmd+Shift+V）→ 返回 false 放行 ProseMirror 默认路径。
 *    PM 对 shiftKey 的粘贴已按纯文本解析（忽略 text/html，换行变硬换行），
 *    因此这里不能触发下方任何分支，实现「只有 Shift+粘贴才是纯文本」。
 *
 * b) 图片（clipboardData.files 里有 image/*）→ IPC 落盘到 userData/images，
 *    再插入 image 节点。保存是异步的，因此图片分支先 event.preventDefault() 接管事件，
 *    保存成功后才 replaceSelection，失败则交给默认（不插入脏内容）。
 *
 * c) 纯文本 Markdown 源码（text/plain 命中 looksLikeMarkdown 且 isRichHtml 不成立）→
 *    用 marked 渲染成 HTML，再交回 PM 的 view.pasteHTML 解析成 schema 节点，
 *    让「复制 markdown 源码」获得与富文本一致的富文本结构。
 *    markdown 判定优先于 text/html：从 VS Code 等代码编辑器复制 markdown 时剪贴板
 *    同时带有 text/html（只是 div/span + 内联样式的语法高亮，无语义标签），
 *    此时以 text/plain 的 markdown 判定为准；而含语义标签的真富文本（网页/Word/
 *    编辑器自身复制）由 isRichHtml 挡住，走分支 d 原样还原，字面的 #、** 不会被二次解析。
 *
 * d) 其余富文本 HTML（从网页/Word 复制）→ 返回 false 走 ProseMirror 默认，
 *    由其按 schema 保留可映射格式（加粗/列表/链接/标题等），不额外清洗。
 *
 * 纯文本无任何 Markdown 特征时返回 false，走默认纯文本插入（保留换行分段）。
 */

/** 图片文件扩展名白名单（防任意普通文件被当图落盘） */
const IMAGE_EXT_BY_MIME: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg'
}

/** clipData 里是否存在可处理的图片（非 `image/*` 一律跳过） */
function pickImageFile(clipboardData: DataTransfer): File | null {
    for (const item of Array.from(clipboardData.items)) {
        const type = item.type
        if (IMAGE_EXT_BY_MIME[type]) {
            const file = item.getAsFile()
            if (file) return file
        }
    }
    for (const file of Array.from(clipboardData.files)) {
        if (IMAGE_EXT_BY_MIME[file.type]) return file
    }
    return null
}

/**
 * 判断纯文本是否「看起来是 Markdown」。谨防误伤普通无格式句子（如 `2 * 3`）：
 * - 以常见块级标记开头（# - * + 数字. > ` ``` 表格行 分隔线）
 * - 或行内含 Markdown 结构特征（行内 ** / 链接 [](url) / $…$ / 代码块围栏）
 * - 或本身就是多行连续文本
 */
const BLOCK_START =
    /^(#{1,6}\s|\s*[-*+]\s|\s*\d+\.\s|\s*>\s|```|~~~|\s*`[^`\n]+\s*$|\s*\|.+\|\s*$|\s*(?:[-*_]\s*){3,}$)/

function looksLikeMarkdown(text: string): boolean {
    const lines = text.split(/\r?\n/)
    const trimmed = text.trim()

    // 多行内容：任意一行命中块级标记即视为 markdown
    if (lines.length > 1) {
        if (lines.filter((l) => BLOCK_START.test(l)).length > 0) return true
        // 空行分隔的多段落也倾向结构化（普通单段复制较少带连续空行）
        if (/\n\s*\n/.test(trimmed)) return true
    }

    // 单行/整体：行内特征
    return (
        /#{1,6}\s/.test(text) || // 标题
        /[*_]{2}[^*_]+[*_]{2}/.test(text) || // **加粗**
        /\[[^\]]+\]\([^)]+\)/.test(text) || // [text](url)
        /\$\S+?\$/.test(text) || // $…$ 行内公式
        /```/.test(text) || // 代码块围栏
        /^\s*[-*_]{3,}\s*$/.test(text) || // 分隔线
        /^\s*\|.+\|\s*$/.test(text) // 表格行
    )
}

/**
 * text/html 是否是「真富文本」（含语义标签：网页/Word/编辑器自身复制）。
 * VS Code 等代码编辑器复制时也带 text/html，但只是 div/span + 内联样式的语法高亮，
 * 不含语义标签，此时应以 text/plain 的 markdown 判定为准。
 */
const RICH_HTML_TAG = /<(p|h[1-6]|ul|ol|li|table|blockquote|pre|a|strong|b|em|i|img)[\s/>]/i

function isRichHtml(html: string): boolean {
    return RICH_HTML_TAG.test(html)
}

/**
 * 是否为「Shift+粘贴」（Ctrl/Cmd+Shift+V，粘贴纯文本）。
 * paste 事件本身不带修饰键，prosemirror-view 在 keydown 时把 shift 状态记录在
 * view.input.shiftKey（内部属性），其默认粘贴的纯文本判定也来源于此；
 * 这里镜像同一判定（Shift+Insert 例外，走普通粘贴），保证放行后 PM 恰好按纯文本解析。
 */
function isShiftPaste(view: EditorView): boolean {
    const input = (view as unknown as { input?: { shiftKey?: boolean; lastKeyCode?: number } })
        .input
    return !!input?.shiftKey && input.lastKeyCode !== 45
}

export const ClipboardPaste = Extension.create({
    name: 'clipboardPaste',

    addProseMirrorPlugins() {
        return [
            new Plugin({
                handlePaste(view: EditorView, event: ClipboardEvent) {
                    const clipboardData = event.clipboardData
                    if (!clipboardData) return false

                    // a) Shift+粘贴 → 只粘贴纯文本：放行 PM 默认（其已按纯文本解析，忽略 html）
                    if (isShiftPaste(view)) return false

                    // b) 图片优先：接管事件，保存成功后替换选区
                    const imageFile = pickImageFile(clipboardData)
                    if (imageFile) {
                        // 先阻止默认粘贴（默认会塞入 [Object] 文本之类），保存完成再插入
                        event.preventDefault()
                        event.stopPropagation()
                        void saveAndInsertImage(view, imageFile)
                        return true
                    }

                    // c) 纯文本 Markdown：解析为富文本（优先于 html；真富文本由 isRichHtml 挡住）
                    const text = clipboardData.getData('text/plain')
                    const html = clipboardData.getData('text/html')
                    if (text && looksLikeMarkdown(text) && !isRichHtml(html)) {
                        event.preventDefault()
                        event.stopPropagation()
                        view.pasteHTML(marked.parse(text, { async: false }) as string)
                        return true
                    }

                    // d) 其余富文本 HTML：交给默认映射（保留可映射格式）
                    if (html) return false

                    // 其余（无图、无 html、无 markdown 特征的纯文本）→ 默认插入
                    return false
                }
            })
        ]
    }
})

/** 把剪贴板图片经 IPC 落盘并插入 image 节点（插入位置取保存完成时的当前选区） */
async function saveAndInsertImage(view: EditorView, file: File): Promise<void> {
    try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const ext = IMAGE_EXT_BY_MIME[file.type] ?? 'png'
        const url = await window.electronAPI.images.save(bytes, ext)
        const image = view.state.schema.nodes.image?.create({ src: url, alt: '' })
        if (!image) return
        view.dispatch(view.state.tr.replaceSelectionWith(image))
    } catch (err) {
        console.error('[clipboardPaste] image save failed:', err)
    }
}
