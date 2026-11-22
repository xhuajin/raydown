/**
 * 列表插件：无序/有序列表的渲染与悬挂缩进。
 *
 * 结构（同 Obsidian）：
 * [cm-indent 缩进占位][cm-marker-box marker 盒子][文本]
 * - marker 盒子：隐藏态（• / checkbox widget）与显示态（源码 `- ` 的 mark 盒）
 *   都是同宽 inline-flex 盒（宽度 = marker 前缀源码实测宽），光标移入移出零位移
 * - 行首缩进同样固宽（cm-indent），整体前缀全部由固定宽度元素构成
 * - 悬挂缩进：marker 行 `padding-left: W; text-indent: -W`，折行/续行
 *   `padding-left: W`，W = 缩进 + 盒子宽，全部实测（core/metrics.ts）
 */
import { keymap } from '@codemirror/view'
import type { EditorView } from '@codemirror/view'
import { Prec } from '@codemirror/state'
import type { SyntaxNode } from '@lezer/common'
import type { MarkdownPlugin, NodeRenderContext, NodeRenderer } from '../core/types'
import { IndentWidget, ListMarkerBoxWidget } from '../core/widgets'
import { measureTextWidth } from '../core/metrics'
import { canEdit, revealEnabled } from '../core/readonly'
import { settledTree } from '../core/syntax'

export interface ListMarkerInfo {
    /** 行首缩进空白的实测像素宽 */
    indentPx: number
    /** marker 前缀（`- ` / `- [ ] ` / `12. `）的实测像素宽 */
    boxPx: number
    /** marker 盒子范围（文档绝对位置）：dash 起 → marker 后一个空格止 */
    boxFrom: number
    boxTo: number
    isTask: boolean
    taskChecked?: boolean
}

/**
 * 计算列表项的 marker 前缀信息（缩进宽、盒子宽、盒子范围）。
 * 全部基于源码实测，与 marker 显隐状态无关。
 */
export function markerInfoOf(ctx: NodeRenderContext, item: SyntaxNode): ListMarkerInfo | null {
    const { state, view } = ctx
    const line = state.doc.lineAt(item.from)
    const text = line.text
    const indent = /^[\t ]*/.exec(text)![0]
    const task = item.getChild('Task')
    const taskMarker = task?.getChild('TaskMarker') ?? null
    const mark = item.getChild('ListMark')
    if (!mark) return null

    let boxEndOffset: number // 盒子终点（行内偏移），含 marker 后一个空格
    if (task && taskMarker) {
        boxEndOffset = Math.min(taskMarker.to - line.from + 1, text.length)
    } else {
        const afterMark = mark.to - line.from
        const spacesAfter = /^ */.exec(text.slice(afterMark))![0].length
        boxEndOffset = Math.min(afterMark + Math.max(1, spacesAfter), text.length)
    }

    return {
        indentPx: measureTextWidth(view, indent),
        boxPx: measureTextWidth(view, text.slice(mark.from - line.from, boxEndOffset)),
        boxFrom: mark.from,
        boxTo: line.from + boxEndOffset,
        isTask: !!(task && taskMarker),
        taskChecked: taskMarker
            ? state.sliceDoc(taskMarker.from + 1, taskMarker.from + 2).toLowerCase() === 'x'
            : undefined
    }
}

/** bullet 圆点与文本的额外间隙（px）：圆点字形窄，贴着文本视觉上太挤 */
const BULLET_TEXT_GAP = 3

/**
 * 列表项的渲染几何：缩进占位宽（= 父项文本列，同 Obsidian 的嵌套对齐）与
 * marker 盒子宽（源码前缀实测 + bullet 间隙）。
 * 嵌套项的缩进递归取父项文本列，使子 marker/复选框与父项文本对齐。
 */
export function renderedGeometry(ctx: NodeRenderContext, item: SyntaxNode): ListMarkerInfo | null {
    const info = markerInfoOf(ctx, item)
    if (!info) return null
    const list = item.parent
    const parentItem = list?.parent?.name === 'ListItem' ? list.parent : null
    const parentGeom = parentItem ? renderedGeometry(ctx, parentItem) : null
    const indentPx = parentGeom ? parentGeom.indentPx + parentGeom.boxPx : 0
    const isOrdered = list?.name === 'OrderedList'
    const boxPx = info.isTask || isOrdered ? info.boxPx : info.boxPx + BULLET_TEXT_GAP
    return { ...info, indentPx, boxPx }
}

/**
 * bullet 的源码露出判定：零宽光标落在 dash 字形范围内（[dashFrom, dashTo] 双边界
 * 均算触碰）时露出源码；选区按重叠判定。
 */
function bulletRevealed(ctx: NodeRenderContext, dashFrom: number, dashTo: number): boolean {
    if (!revealEnabled(ctx.state)) return false
    return ctx.state.selection.ranges.some((r) =>
        r.empty ? r.from >= dashFrom && r.from <= dashTo : r.from <= dashTo && r.to >= dashFrom
    )
}

/** 列表项悬挂缩进：marker 行加负首行缩进（行内软折行对齐文本列）；行首缩进固宽占位 */
const listItemRenderer: NodeRenderer = {
    nodeTypes: ['ListItem'],
    render(ctx, node) {
        const item = node
        const state = ctx.state
        const firstLine = state.doc.lineAt(item.from)
        const geom = renderedGeometry(ctx, item)
        if (!geom) return true

        // 行首缩进 → cm-indent 固宽占位（覆盖到 marker 盒子之前），宽度 = 父项文本列，
        // 内部渲染隐藏的源码缩进文本撑行高（相邻光标高度与正文一致）。
        // force：缩进是原子范围，光标无法进入其中；若不加 force，光标停在
        // 缩进末尾（marker 左侧）时边界触碰会让占位消失、源码空格回退渲染，
        // 其宽度与实测占位有 ~1px 差异，文本会产生左右跳变
        if (geom.boxFrom > firstLine.from && geom.indentPx > 0) {
            const indentText = state.sliceDoc(firstLine.from, geom.boxFrom)
            ctx.conceal(firstLine.from, geom.boxFrom, new IndentWidget(geom.indentPx, indentText), {
                force: true
            })
        }

        const w = Math.round((geom.indentPx + geom.boxPx) * 100) / 100
        if (!Number.isFinite(w) || w <= 0) return true
        const px = `${w}px`

        // 悬挂缩进只装饰 marker 行：行内软折行经 text-indent 对齐文本列；
        // 独立续行（懒延续）是普通段落语义，不缩进
        ctx.line(firstLine.from, 'cm-list-line', `padding-left: ${px}; text-indent: -${px}`)
        return true // 继续深入：嵌套子列表项各自装饰
    }
}

const listMarkRenderer: NodeRenderer = {
    nodeTypes: ['ListMark'],
    render(ctx, node) {
        const item = node.parent
        if (!item) return
        const list = item.parent

        // 有序列表：数字永不隐藏（不重编号），仅着色
        if (list && list.name === 'OrderedList') {
            ctx.mark(node.from, node.to, 'cm-list-mark')
            return
        }

        // 任务项的盒子（覆盖整个 `- [ ] ` 前缀）由 task-list 插件渲染；
        // 行首缩进占位由 ListItem 渲染器统一处理
        if (item.getChild('Task')) return true

        const geom = renderedGeometry(ctx, item)
        if (!geom) return true

        // 隐藏/露出粒度 = dash 字形本身（同 Obsidian）：光标落在 dash 上
        // （(dashFrom, dashTo]，含右边界）时显示源码 `-`；dash 左侧与
        // 文本前的光标保持圆点。dash 后的空格是普通文本，光标可自然停驻。
        const dashW =
            measureTextWidth(ctx.view, ctx.state.sliceDoc(node.from, node.to)) + BULLET_TEXT_GAP
        const w = `${Math.round(dashW * 100) / 100}px`
        if (bulletRevealed(ctx, node.from, node.to)) {
            ctx.mark(node.from, node.to, 'cm-list-mark cm-marker-box', `width: ${w}`)
        } else {
            ctx.conceal(node.from, node.to, new ListMarkerBoxWidget(dashW, 'bullet'), {
                force: true
            })
        }
        return true
    }
}

/**
 * Enter：空列表项减少一层缩进（嵌套项回到父级 marker；顶层项退出列表）；
 * 非空列表项返回 false 交给官方命令延续新行。
 * 官方 insertNewlineContinueMarkup 对"嵌套空项"会走"下移一行"分支而不是减缩进，
 * 因此这里在它之前接管空项场景（同 Obsidian 行为）。
 * 空项时光标在行内任意位置（含 marker 原子区的两侧边界）都执行减缩进——
 * 方向键会把光标停在原子盒子边缘，此时 Enter 也应减缩进而不是拆行。
 */
export function listEnter(view: EditorView): boolean {
    if (!canEdit(view)) return false
    const { state } = view
    const sel = state.selection.main
    if (!sel.empty || state.selection.ranges.length > 1) return false
    const head = sel.head
    const line = state.doc.lineAt(head)
    const tree = settledTree(state, head)
    let item: SyntaxNode | null = tree.resolveInner(head, -1)
    while (item && item.name !== 'ListItem') item = item.parent
    if (!item) return false
    const mark = item.getChild('ListMark')
    if (!mark) return false

    // 空项判定：marker（或任务 [ ]）之后无可见内容
    const task = item.getChild('Task')
    const taskMarker = task?.getChild('TaskMarker') ?? null
    const contentFrom = taskMarker ? taskMarker.to : mark.to
    const isEmpty = !/\S/.test(state.sliceDoc(contentFrom, item.to))
    if (!isEmpty) return false // 非空：官方延续
    // 空项：光标必须在行内（marker 原子区边缘的光标也算在项上）
    if (head < line.from || head > line.to) return false

    // 减少一层缩进：回到父级列表的缩进与 marker（父级是任务项则保留 [ ] ）；顶层退出列表
    const list = item.parent
    const parentItem = list?.parent?.name === 'ListItem' ? list.parent : null
    const parentMark = parentItem?.getChild('ListMark') ?? null
    let insert = ''
    if (parentItem && parentMark) {
        const parentLine = state.doc.lineAt(parentMark.from)
        const parentIndent = state.sliceDoc(parentLine.from, parentMark.from)
        const parentMarker = state.sliceDoc(parentMark.from, parentMark.to)
        insert = `${parentIndent}${parentMarker} ${taskMarker ? '[ ] ' : ''}`
    }
    view.dispatch(
        state.update(
            {
                changes: { from: line.from, to: line.to, insert },
                selection: { anchor: line.from + insert.length }
            },
            { scrollIntoView: true, userEvent: 'input' }
        )
    )
    return true
}

export const listPlugin: MarkdownPlugin = {
    id: 'list',
    title: '列表',
    description: '无序/有序列表渲染与悬挂缩进（Tab 缩进为统一行首缩进）',
    category: 'node',
    defaultEnabled: true,
    extensions: [
        // Prec.highest：Enter 的空项减缩进必须先于官方 markdown 延续命令被咨询
        Prec.highest(keymap.of([{ key: 'Enter', run: listEnter }]))
    ],
    renderers: [listItemRenderer, listMarkRenderer]
}
