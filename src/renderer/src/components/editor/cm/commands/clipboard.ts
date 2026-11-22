/**
 * 粘贴插件：
 * 1. 图片 → 经 IPC 落盘（ray-image://），以 markdown 图片语法插入
 * 2. 富文本 HTML → turndown 转 markdown 后插入
 * 3. 纯文本 → 放行 CM 默认行为（原样插入）
 */
import TurndownService from 'turndown'
import { EditorView } from '@codemirror/view'
import type { MarkdownPlugin } from '../core/types'
import { canEdit } from '../core/readonly'

const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*'
})

async function saveImageAndInsert(view: EditorView, file: File): Promise<void> {
    const extSource = file.type.split('/')[1] ?? 'png'
    const ext = extSource.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'png'
    const bytes = new Uint8Array(await file.arrayBuffer())
    const url = await window.electronAPI.images.save(bytes, ext)
    const { state } = view
    const pos = state.selection.main.head
    view.dispatch(
        state.update({
            changes: { from: pos, insert: `![图片](${url})` },
            selection: { anchor: pos + `![图片](${url})`.length }
        }),
        { scrollIntoView: true, userEvent: 'input.paste' }
    )
}

const pasteHandler = EditorView.domEventHandlers({
    paste(event, view) {
        if (!canEdit(view)) return false // 预览模式不处理粘贴
        const data = event.clipboardData
        if (!data) return false

        // 图片优先：截图/复制图片直接落盘
        const imageItem = Array.from(data.items).find(
            (item) => item.kind === 'file' && item.type.startsWith('image/')
        )
        if (imageItem) {
            event.preventDefault()
            const file = imageItem.getAsFile()
            if (file) void saveImageAndInsert(view, file)
            return true
        }

        // 富文本 HTML → markdown
        const html = data.getData('text/html')
        if (html) {
            event.preventDefault()
            let markdown: string
            try {
                markdown = turndown.turndown(html)
            } catch {
                markdown = data.getData('text/plain')
            }
            view.dispatch(view.state.replaceSelection(markdown), {
                scrollIntoView: true,
                userEvent: 'input.paste'
            })
            return true
        }

        return false // 纯文本走默认
    }
})

export const clipboardPlugin: MarkdownPlugin = {
    id: 'clipboard',
    title: '粘贴处理',
    description: '图片落盘插入、富文本转 markdown 粘贴',
    category: 'command',
    defaultEnabled: true,
    extensions: [pasteHandler]
}
