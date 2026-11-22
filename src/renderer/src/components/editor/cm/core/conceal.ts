/**
 * 装饰构建器：live-preview 引擎的产出漏斗。
 * 渲染器通过 NodeRenderContext 接口产装饰，这里统一收集并生成两个集合：
 * - decorations：实际渲染（mark/line/widget/replace）
 * - atomicRanges：所有隐藏（replace）范围的副本，交给 EditorView.atomicRanges，
 *   让光标/点击无法落入被隐藏的源码内部
 */
import { Decoration } from '@codemirror/view'
import type { EditorState } from '@codemirror/state'
import type { DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import type { NodeRenderContext } from './types'
import { revealEnabled } from './readonly'

type DecoRange = Decoration['range'] extends (...args: never[]) => infer R ? R : never

export class DecorationBuilder implements NodeRenderContext {
    private ranges: DecoRange[] = []
    private atomic: DecoRange[] = []

    constructor(
        public readonly state: EditorState,
        public readonly view: EditorView
    ) {}

    touches(from: number, to: number): boolean {
        // 预览模式：选区不触发源码露出，标记保持隐藏渲染
        if (!revealEnabled(this.state)) return false
        return this.state.selection.ranges.some((r) => r.from <= to && r.to >= from)
    }

    touchesInner(from: number, to: number): boolean {
        // 预览模式：选区不触发源码露出
        if (!revealEnabled(this.state)) return false
        return this.state.selection.ranges.some((r) =>
            r.empty ? r.from >= from && r.from < to : r.from < to && r.to > from
        )
    }

    conceal(from: number, to: number, widget?: WidgetType, options?: { force?: boolean }): void {
        if (to <= from) return
        // 安全网：选区落在隐藏范围内时露出源码（光标可进入编辑）；
        // force 跳过——适用于光标无法进入的原子前缀占位（见 types.ts 注释）
        if (!options?.force && this.touches(from, to)) return
        const deco = Decoration.replace({ widget })
        this.ranges.push(deco.range(from, to))
        this.atomic.push(deco.range(from, to))
    }

    /** 同 conceal，但安全网用 touchesInner：光标停在隐藏范围终点边界时不露出 */
    concealInner(from: number, to: number, widget?: WidgetType): void {
        if (to <= from) return
        if (this.touchesInner(from, to)) return
        const deco = Decoration.replace({ widget })
        this.ranges.push(deco.range(from, to))
        this.atomic.push(deco.range(from, to))
    }

    mark(from: number, to: number, className: string, style?: string): void {
        if (to <= from) return
        this.ranges.push(
            Decoration.mark({
                class: className,
                attributes: style ? { style } : undefined
            }).range(from, to)
        )
    }

    widget(pos: number, side: number, widget: WidgetType): void {
        this.ranges.push(Decoration.widget({ widget, side }).range(pos, pos))
    }

    line(pos: number, className: string, style?: string): void {
        const line = this.state.doc.lineAt(pos)
        this.ranges.push(
            Decoration.line({
                class: className,
                attributes: style ? { style } : undefined
            }).range(line.from)
        )
    }

    /** 渲染装饰集（RangeSetBuilder 要求有序，交给 Decoration.set 排序） */
    finish(): DecorationSet {
        if (this.ranges.length === 0) return Decoration.none
        return Decoration.set(this.ranges, true)
    }

    finishAtomic(): DecorationSet {
        if (this.atomic.length === 0) return Decoration.none
        return Decoration.set(this.atomic, true)
    }
}
