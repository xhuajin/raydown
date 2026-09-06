import { setBlockType, toggleMark, wrapIn } from 'prosemirror-commands'
import { liftListItem, wrapInList, wrapRangeInList } from 'prosemirror-schema-list'
import type { Command, EditorState, Transaction } from 'prosemirror-state'
import type { Attrs, NodeType } from 'prosemirror-model'
import { pmSchema } from './schema'

export const strong = toggleMark(pmSchema.marks.strong) as Command
export const em = toggleMark(pmSchema.marks.em) as Command
export const strike = toggleMark(pmSchema.marks.strike) as Command
export const code = toggleMark(pmSchema.marks.code) as Command
export const linkHref = (href: string): Command => toggleMark(pmSchema.marks.link, { href })
export const blockquote = (): Command => wrapIn(pmSchema.nodes.blockquote)

const LIST_ITEM = pmSchema.nodes.list_item

/** 选区所在列表项的深度（不在列表内返回 -1） */
function listItemDepth(state: EditorState): number {
    const { $from } = state.selection
    for (let depth = $from.depth; depth > 0; depth--) {
        if ($from.node(depth).type === LIST_ITEM) return depth
    }
    return -1
}

/**
 * 设置文本块类型（标题/段落/代码块互相切换的统一入口）。
 * 选区在列表项里时，list_item 的内容约束（首块必须是 paragraph）会让
 * setBlockType 静默失败，因此先在同一事务里把列表项提升出列表再设置。
 */
function setBlockTypeLifting(type: NodeType, attrs: Attrs | null): Command {
    return (state, dispatch) => {
        if (listItemDepth(state) < 0) return setBlockType(type, attrs)(state, dispatch)
        let lifted: Transaction | undefined
        if (!liftListItem(LIST_ITEM)(state, (tr) => (lifted = tr)) || !lifted) return false
        const { from, to } = lifted.selection
        lifted.setBlockType(from, to, type, attrs)
        dispatch?.(lifted.scrollIntoView())
        return true
    }
}

export const setHeading = (level: number): Command =>
    setBlockTypeLifting(pmSchema.nodes.heading, { level })
export const setParagraph = (): Command => setBlockTypeLifting(pmSchema.nodes.paragraph, null)
export const codeBlock = (): Command => setBlockTypeLifting(pmSchema.nodes.code_block, null)

/**
 * 无序/有序列表的开/关切换，块级类型之间可互相转换：
 * - 已在目标类型列表内 → liftListItem 提升退出（关）；
 * - 在其他列表（含任务列表）里 → 直接把包含的列表节点替换为目标类型
 *   （两类 list 的内容都是 list_item+，节点属性原样保留，任务勾选状态不丢）；
 * - 不在列表里 → wrapInList 包成列表；当前块是标题/代码块时先转段落再包
 *   （list_item 首块必须是 paragraph，同一事务内完成）。
 */
export const toggleList =
    (listType: NodeType): Command =>
    (state, dispatch) => {
        const { $from, $to } = state.selection
        const depth = listItemDepth(state)
        if (depth >= 0) {
            const listNode = $from.node(depth - 1)
            if (listNode.type === listType) {
                // 任务列表上点同类型按钮 → 整表去勾选转普通列表；普通列表 → 提升退出（关）
                if ($from.node(depth).attrs.checked !== null) {
                    if (dispatch) {
                        const listPos = $from.before(depth - 1)
                        const tr = state.tr
                        state.doc.nodesBetween(
                            listPos,
                            listPos + listNode.nodeSize,
                            (child, pos) => {
                                if (child.type === LIST_ITEM && child.attrs.checked !== null)
                                    tr.setNodeMarkup(pos, null, { checked: null })
                            }
                        )
                        dispatch(tr.scrollIntoView())
                    }
                    return true
                }
                return liftListItem(LIST_ITEM)(state, dispatch)
            }
            if (dispatch) {
                dispatch(state.tr.setNodeMarkup($from.before(depth - 1), listType).scrollIntoView())
            }
            return true
        }
        if ($from.parent.type === pmSchema.nodes.paragraph || !dispatch) {
            return wrapInList(listType, null)(state, dispatch)
        }
        // 标题/代码块 → 段落 → 包列表（一个事务）
        const tr = state.tr
        tr.setBlockType($from.pos, $to.pos, pmSchema.nodes.paragraph)
        const range = tr.selection.$from.blockRange(tr.selection.$to)
        if (!range || !wrapRangeInList(tr, range, listType)) return false
        dispatch(tr.scrollIntoView())
        return true
    }

export const bulletList = (): Command => toggleList(pmSchema.nodes.bullet_list)
export const orderedList = (): Command => toggleList(pmSchema.nodes.ordered_list)

/**
 * 任务列表开关。
 * - 已在任务项内 → 提升退出（关）；
 * - 在普通列表项内（无序/有序均可）→ 把选区覆盖到的列表项转为任务项（checked=false）；
 * - 不在列表内 → 包成无序列表后再转为任务项（标题/代码块先转段落，同一事务）。
 */
export const taskList = (): Command => (state, dispatch) => {
    const { $from, $to } = state.selection
    const depth = listItemDepth(state)
    if (depth >= 0) {
        if ($from.node(depth).attrs.checked !== null)
            return liftListItem(LIST_ITEM)(state, dispatch)
        if (dispatch) {
            const tr = state.tr
            state.doc.nodesBetween($from.pos, $to.pos, (child, pos) => {
                if (child.type === LIST_ITEM && child.attrs.checked === null)
                    tr.setNodeMarkup(pos, null, { checked: false })
            })
            dispatch(tr.scrollIntoView())
        }
        return true
    }
    // 不在列表内：包成无序列表，再把包裹进来的列表项标为任务。
    // 标题/代码块先用同一事务转成段落（list_item 首块必须是 paragraph）。
    if (!dispatch) return true
    const tr = state.tr
    if ($from.parent.type !== pmSchema.nodes.paragraph)
        tr.setBlockType($from.pos, $to.pos, pmSchema.nodes.paragraph)
    const range = tr.selection.$from.blockRange(tr.selection.$to)
    if (!range || !wrapRangeInList(tr, range, pmSchema.nodes.bullet_list)) return false
    // 用映射后的选区范围圈定新列表项，避免误改因列表合并被卷进来的相邻已有项
    const mappedFrom = tr.mapping.map($from.pos)
    const mappedTo = tr.mapping.map($to.pos)
    tr.doc.nodesBetween(mappedFrom, mappedTo, (child, pos) => {
        if (child.type === LIST_ITEM && child.attrs.checked === null)
            tr.setNodeMarkup(pos, null, { checked: false })
    })
    dispatch(tr.scrollIntoView())
    return true
}
