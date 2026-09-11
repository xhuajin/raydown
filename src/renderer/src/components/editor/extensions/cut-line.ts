import { Extension } from '@tiptap/core'
import { keymap } from '@tiptap/pm/keymap'
import type { ResolvedPos } from '@tiptap/pm/model'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

/**
 * Ctrl/Cmd+X 特化：无选区时剪切当前块（对应 VS Code 的「剪切当前行」）。
 *
 * 实现走「改选区 + 交回默认」：把 PM 选区替换为覆盖当前块的 NodeSelection 后返回 false，
 * keydown 的默认行为照常触发 cut 事件，prosemirror-view 会按新选区序列化剪贴板
 * （text/html + text/plain，粘贴回编辑器可还原格式）并用 replaceSelection 删除。
 * 因此剪贴板内容与手动选中后剪切完全一致，撤销/光标落点也由 PM 原生处理。
 *
 * 剪切单元：
 * - 代码块内 → 光标所在的文本行（行级剪切，VS Code 行为）；
 * - 列表内（含任务列表）→ 最内层列表项（列表的「行」），光标落在嵌套项时剪嵌套项；
 * - 其余（段落/标题/引用等）→ 文档顶层块，整块连节点一起剪切；
 * - 文档只剩一个顶层块时，删掉它会让文档为空（schema 不允许 block+ 为空），
 *   退化为只剪切块内容、保留空块，与 VS Code 剪最后一行留空编辑器的行为一致。
 */
const LIST_ITEM_TYPES = new Set(['listItem', 'taskItem'])

/**
 * 代码块内的行级剪切选区（from/to）。代码块内容是纯文本（换行为 "\n" 文本），
 * 按 VS Code 语义取行边界：非末行剪到行尾换行符之后，末行带上前导换行符，
 * 唯一行只剪行内容。光标行不存在可剪内容时返回 null。
 */
function codeBlockLineRange($from: ResolvedPos): { from: number; to: number } | null {
    const text = $from.parent.textContent
    const off = $from.parentOffset
    const contentStart = $from.start($from.depth)

    const lineStart = text.lastIndexOf('\n', off - 1) + 1
    let lineEnd = text.indexOf('\n', off)
    if (lineEnd !== -1) {
        // 非末行：连同行尾换行符一起剪，剪切后下一行顶到本行行首
        return { from: contentStart + lineStart, to: contentStart + lineEnd + 1 }
    }
    lineEnd = text.length
    if (lineStart > 0) {
        // 末行：带上前导换行符一起剪，光标落到上一行行尾
        return { from: contentStart + lineStart - 1, to: contentStart + lineEnd }
    }
    // 唯一行：只剪行内容，保留空代码块
    if (lineStart === lineEnd) return null
    return { from: contentStart + lineStart, to: contentStart + lineEnd }
}

export const CutLine = Extension.create({
    name: 'cutLine',

    addProseMirrorPlugins() {
        return [
            keymap({
                'Mod-x': (state: EditorState, _dispatch, view?: EditorView) => {
                    if (!view || !view.editable) return false

                    const { selection, doc } = state
                    // 有选区 → 交回默认剪切，行为不变
                    if (!selection.empty) return false

                    const { $from } = selection
                    // GapCursor 等不在块内容内的场景不处理
                    if ($from.depth < 1) return false

                    // 代码块内：行级剪切，不剪整块
                    if ($from.parent.type.name === 'codeBlock') {
                        const range = codeBlockLineRange($from)
                        if (!range) return false
                        view.dispatch(
                            state.tr.setSelection(TextSelection.create(doc, range.from, range.to))
                        )
                        return false
                    }

                    // 自内向外找最内层列表项作为剪切单元，否则取文档顶层块（depth 1）
                    let cutDepth = 1
                    for (let d = $from.depth; d >= 1; d--) {
                        if (LIST_ITEM_TYPES.has($from.node(d).type.name)) {
                            cutDepth = d
                            break
                        }
                    }

                    // 仅剩一个顶层块：剪切单元删除后文档会为空，改为选中块内容交回默认剪切，
                    // 留下空块保证文档合法（空块无可剪时直接不处理）
                    if (doc.childCount === 1) {
                        const from = $from.start(cutDepth)
                        const to = $from.end(cutDepth)
                        if (from === to) return false
                        view.dispatch(state.tr.setSelection(TextSelection.create(doc, from, to)))
                        return false
                    }

                    const nodeFrom = $from.before(cutDepth)
                    view.dispatch(state.tr.setSelection(NodeSelection.create(doc, nodeFrom)))
                    return false
                }
            })
        ]
    }
})
