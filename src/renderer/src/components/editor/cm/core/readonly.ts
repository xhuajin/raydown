/**
 * 只读/预览模式的门控工具。
 * CM 的 keymap 在非可编辑视图上仍会触发（keydown 不受 editable 门控），
 * 因此所有改写类命令、widget 交互与粘贴处理都必须显式检查。
 */
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

/** 视图是否可编辑：预览（readonly）模式下所有改写命令一律不接管 */
export function canEdit(view: EditorView): boolean {
    return view.state.facet(EditorView.editable)
}

/**
 * 选区是否允许触发源码露出：预览模式下固定为否，
 * 语法符（#/-/[ ]/…）保持隐藏渲染，点击不出现标记。
 */
export function revealEnabled(state: EditorState): boolean {
    return !state.facet(EditorState.readOnly)
}
