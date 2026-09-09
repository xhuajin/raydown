import { Extension } from '@tiptap/core'
import { keymap } from '@tiptap/pm/keymap'
import { TextSelection } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

/**
 * Ctrl+A 特化：光标位于代码块内时，全选只选中当前代码块的全部内容，
 * 而不是整个文档。
 *
 * 通过 addProseMirrorPlugins 注入 PM keymap 处理 Mod-a。ProseMirror 中
 * 后加入的 keymap 拥有更高优先级，这里返回的 plugin 追加在官方扩展之后，
 * 因此会先于内置 selectAll 生效；非代码块场景返回 false 把按键交回默认的
 * 全选行为（选择整个文档）。
 */
export const SelectCodeBlock = Extension.create({
    name: 'selectCodeBlock',

    addProseMirrorPlugins() {
        return [
            keymap({
                'Mod-a': (state: EditorState, _dispatch, view?: EditorView) => {
                    if (!view) return false

                    // 光标/选区是否位于代码块内
                    const { selection } = state
                    const $anchor = selection.$anchor
                    const codeBlock = $anchor.node($anchor.depth)
                    if (!codeBlock || codeBlock.type.name !== 'codeBlock') return false

                    // 选中整段代码块内容（`from`/`to`= 块内首尾，不含外层的包裹位置）
                    const from = $anchor.start($anchor.depth)
                    const to = $anchor.end($anchor.depth)
                    const tr = state.tr.setSelection(TextSelection.create(state.doc, from, to))

                    view.dispatch(tr)
                    return true
                }
            })
        ]
    }
})
