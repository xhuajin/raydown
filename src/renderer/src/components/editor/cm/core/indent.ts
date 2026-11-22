/**
 * 核心缩进键：Tab / Shift-Tab。
 * 统一行为：在选中各行的**行首**加/删一个缩进单位（4 空格，走 indentUnit），
 * 支持多行选区——与 Obsidian 一致，而不是插在光标处。
 * 列表行同样走这里（缩进 4 空格即嵌套一级，CommonMark 语义正确）。
 * 预览模式不接管。
 */
import { indentLess, indentMore } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import { canEdit } from './readonly'

export function tabIndent(view: EditorView): boolean {
    if (!canEdit(view)) return false // 预览模式保持浏览器默认（移动焦点）
    return indentMore(view)
}

export function shiftTabIndent(view: EditorView): boolean {
    if (!canEdit(view)) return false
    return indentLess(view)
}
