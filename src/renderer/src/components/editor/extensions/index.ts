import { getSchema, type Extensions } from '@tiptap/core'
import type { Schema } from 'prosemirror-model'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extension-placeholder'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { MathBlock, MathInline } from './math'
import { SelectCodeBlock } from './select-code-block'
import { ImageNode } from './image'
import { ClipboardPaste } from './clipboard'

/**
 * 编辑器扩展的单一来源。应用与 schema（见 getEditorSchema）共用同一份扩展数组，
 * 保证「解析用 schema」与「编辑器实际 schema」完全一致。
 *
 * 覆盖范围（用户决策）：基础排版（H1-H3、粗/斜/删除线/行内代码、无序/有序/任务列表、
 * 引用、代码块、链接、undo/redo）全部由 Tiptap 官方扩展实现；数学公式由
 * prosemirror-math 包一层（extensions/math.ts）。
 */
export function buildExtensions(placeholder?: string): Extensions {
    return [
        StarterKit.configure({
            heading: { levels: [1, 2, 3] },
            link: {
                openOnClick: false,
                HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' }
            }
        }),
        // 任务列表（nested 允许 Tab 缩进多级子任务）
        TaskList,
        TaskItem.configure({ nested: true }),
        // 空文档占位提示（CSS 由 editor.css 提供）；只在可编辑时显示（只读预览不显示）
        Placeholder.configure({
            placeholder: placeholder ?? '输入内容…',
            showOnlyWhenEditable: true
        }),
        MathInline,
        MathBlock,
        // 块级图片节点：截图/图片粘贴经 clipboard 落盘后插入
        ImageNode,
        // Ctrl+A 在代码块内只选代码块内容而非全文
        SelectCodeBlock,
        // 粘贴：图片落盘 + 富文本保留可映射格式 + markdown 源码转富文本
        ClipboardPaste
    ]
}

export const getEditorSchema = (): Schema => getSchema(buildExtensions())
