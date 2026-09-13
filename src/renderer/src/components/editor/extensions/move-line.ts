import { Extension } from '@tiptap/core'
import { keymap } from '@tiptap/pm/keymap'
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

/**
 * Alt+↑/↓ 上下移动当前行（对齐 VS Code 的 Move Line Up/Down）：
 * 与相邻的上一行/下一行交换位置，光标保持行内列偏移；已在首/末行时不响应。
 *
 * 「行」的定义与 cut-line 一致：
 * - 代码块内 → 行级移动：按 "\n" 切行，整段 replace 交换两行文本（含行尾换行符）；
 * - 列表内（含任务列表）→ 移动最内层列表项（与同级相邻列表项交换）；
 * - 其余（段落/标题/引用等）→ 移动文档顶层块（引用块等整体移动）。
 *
 * 实现要点：交换用单条 replaceWith 事务完成，一次撤销即可还原；移动后按
 * 「新块起点 + 原偏移」恢复光标，列位置不丢。
 */
const LIST_ITEM_TYPES = new Set(['listItem', 'taskItem'])

/** 块级移动：当前块（列表项或顶层块）与相邻兄弟块交换位置 */
function moveBlock(state: EditorState, view: EditorView, $from: ResolvedPos, dir: -1 | 1): boolean {
    const { doc } = state

    // 剪切单元同款规则：自内向外找最内层列表项，否则取文档顶层块（depth 1）
    let cutDepth = 1
    for (let d = $from.depth; d >= 1; d--) {
        if (LIST_ITEM_TYPES.has($from.node(d).type.name)) {
            cutDepth = d
            break
        }
    }

    const cur = $from.node(cutDepth)
    const nodeFrom = $from.before(cutDepth)
    const nodeTo = nodeFrom + cur.nodeSize
    const offsetInNode = state.selection.head - nodeFrom

    let swapFrom: number
    let swapTo: number
    let other: PMNode
    if (dir === -1) {
        const prev = doc.resolve(nodeFrom).nodeBefore
        if (!prev) return false
        other = prev
        swapFrom = nodeFrom - prev.nodeSize
        swapTo = nodeTo
    } else {
        const next = doc.resolve(nodeTo).nodeAfter
        if (!next) return false
        other = next
        swapFrom = nodeFrom
        swapTo = nodeTo + next.nodeSize
    }
    const curFresh = doc.nodeAt(nodeFrom)
    if (!curFresh) return false

    const tr = state.tr
    tr.replaceWith(swapFrom, swapTo, dir === -1 ? [curFresh, other] : [other, curFresh])

    // 移动后的块起点：上移落到原前块位置；下移越过相邻块
    const newFrom = dir === -1 ? swapFrom : nodeFrom + other.nodeSize
    tr.setSelection(TextSelection.create(tr.doc, newFrom + offsetInNode))
    view.dispatch(tr.scrollIntoView())
    return true
}

/** 代码块内行级移动：当前文本行与上一行/下一行交换（含行尾换行符的 VS Code 语义） */
function moveCodeLine(
    state: EditorState,
    view: EditorView,
    $from: ResolvedPos,
    dir: -1 | 1
): boolean {
    const text = $from.parent.textContent
    const off = $from.parentOffset
    const contentStart = $from.start($from.depth)

    const lineStart = text.lastIndexOf('\n', off - 1) + 1
    const lineEnd = text.indexOf('\n', off)
    const curEnd = lineEnd === -1 ? text.length : lineEnd
    const curText = text.slice(lineStart, curEnd)
    const col = off - lineStart

    let from: number
    let to: number
    let newText: string
    let newCurStart: number
    if (dir === -1) {
        // 上一行 [prevStart, lineStart-1) 连同其行尾换行符与当前行交换
        if (lineStart === 0) return false
        const prevStart = text.lastIndexOf('\n', lineStart - 2) + 1
        const prevText = text.slice(prevStart, lineStart - 1)
        from = contentStart + prevStart
        to = contentStart + curEnd
        newText = curText + '\n' + prevText
        newCurStart = contentStart + prevStart
    } else {
        // 当前行连同其行尾换行符与下一行 [lineEnd+1, nextEnd) 交换
        if (lineEnd === -1) return false
        let nextEnd = text.indexOf('\n', lineEnd + 1)
        if (nextEnd === -1) nextEnd = text.length
        const nextText = text.slice(lineEnd + 1, nextEnd)
        from = contentStart + lineStart
        to = contentStart + nextEnd
        newText = nextText + '\n' + curText
        newCurStart = from + nextText.length + 1
    }

    const tr = state.tr
    if (newText) tr.replaceWith(from, to, state.schema.text(newText))
    else tr.delete(from, to)
    tr.setSelection(TextSelection.create(tr.doc, newCurStart + col))
    view.dispatch(tr.scrollIntoView())
    return true
}

export const MoveLine = Extension.create({
    name: 'moveLine',

    addProseMirrorPlugins() {
        return [
            keymap({
                'Alt-ArrowUp': (state: EditorState, _dispatch, view?: EditorView) => {
                    if (!view || !view.editable) return false
                    const { selection } = state
                    if (!selection.empty) return false
                    const { $from } = selection
                    if ($from.depth < 1) return false
                    if ($from.parent.type.name === 'codeBlock') {
                        return moveCodeLine(state, view, $from, -1)
                    }
                    return moveBlock(state, view, $from, -1)
                },
                'Alt-ArrowDown': (state: EditorState, _dispatch, view?: EditorView) => {
                    if (!view || !view.editable) return false
                    const { selection } = state
                    if (!selection.empty) return false
                    const { $from } = selection
                    if ($from.depth < 1) return false
                    if ($from.parent.type.name === 'codeBlock') {
                        return moveCodeLine(state, view, $from, 1)
                    }
                    return moveBlock(state, view, $from, 1)
                }
            })
        ]
    }
})
