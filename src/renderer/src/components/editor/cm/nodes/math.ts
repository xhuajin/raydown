/**
 * 数学公式插件：`$…$` 行内、`$$…$$` 块级（KaTeX 渲染）。
 *
 * 解析：自定义 lezer 扩展产出 InlineMath / BlockMath 节点（定界符规则参考
 * reference/src/editor/math.ts 的 Pandoc tex_math_dollars 简化版）：
 * - 开 `$` 后不能是空白、闭 `$` 前不能是空白、闭 `$` 后不能是数字（`$20-$30` 是散文）
 * - `$$` 行内出现按行内公式处理；独占一行（或成对出现在同一行）按块公式处理
 * 渲染：
 * - 行内公式经 live-preview 渲染器替换为 KaTeX widget
 * - 块级公式必须出自 StateField（CM6 规定 block replace 装饰只能由 StateField 提供）
 * 点击公式 = 光标落到源码起点，从而露出源码进入编辑。
 */
import 'katex/dist/katex.min.css'
import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import type { EditorState } from '@codemirror/state'
import {
    Decoration,
    EditorView,
    ViewPlugin,
    type DecorationSet,
    type ViewUpdate
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import type { BlockContext, InlineContext, Line, MarkdownConfig } from '@lezer/markdown'
import type { MarkdownPlugin, NodeRenderer } from '../core/types'
import { treeChanged } from '../core/syntax'
import { revealEnabled } from '../core/readonly'
import { MathWidget } from '../core/widgets'

const DOLLAR = 36 // '$'
const BACKSLASH = 92 // '\'
const NEWLINE = 10

function isSpace(code: number): boolean {
    return code === 32 || code === 9 || code === 10 || code === 13
}

function isDigit(code: number): boolean {
    return code >= 48 && code <= 57
}

/** `$…$`：从开 $ 起扫描闭合位置，找不到返回 -1（规则见模块注释） */
function singleDollarEnd(cx: InlineContext, pos: number): number {
    const after = cx.char(pos + 1)
    if (after < 0 || isSpace(after)) return -1
    for (let p = pos + 1; p < cx.end; p++) {
        const c = cx.char(p)
        if (c === NEWLINE) return -1 // 行内公式不跨行
        if (c === BACKSLASH) {
            p++
            continue
        }
        if (c === DOLLAR) {
            if (isSpace(cx.char(p - 1))) return -1
            if (isDigit(cx.char(p + 1))) return -1
            return p + 1
        }
    }
    return -1
}

/** 同行 `$$…$$`：从开 $$ 起扫描闭合位置，找不到返回 -1 */
function doubleDollarEnd(cx: InlineContext, pos: number): number {
    let blank = true
    for (let p = pos + 2; p < cx.end; p++) {
        const c = cx.char(p)
        if (c === NEWLINE) return -1
        if (c === BACKSLASH) {
            p++
            blank = false
            continue
        }
        if (c === DOLLAR && cx.char(p + 1) === DOLLAR) return blank ? -1 : p + 2
        if (!isSpace(c)) blank = false
    }
    return -1
}

export const mathParse: MarkdownConfig = {
    defineNodes: [{ name: 'InlineMath' }, { name: 'BlockMath', block: true }],
    parseInline: [
        {
            name: 'InlineMath',
            parse(cx, next, pos) {
                if (next !== DOLLAR) return -1
                let run = 1
                while (cx.char(pos + run) === DOLLAR) run++
                const end =
                    run === 1 ? singleDollarEnd(cx, pos) : run === 2 ? doubleDollarEnd(cx, pos) : -1
                if (end > -1) return cx.addElement(cx.elt('InlineMath', pos, end))
                // 打不开的连续 $ 整串按普通文本消费，避免第二个 $ 被误当成开界符
                return run === 1 ? -1 : pos + run
            },
            // 反引号 code span 先解析：`` `$x$` `` 保持是代码
            before: 'Emphasis'
        }
    ],
    parseBlock: [
        {
            name: 'BlockMath',
            parse(cx: BlockContext, line: Line): boolean {
                if (line.next !== DOLLAR || line.text.charCodeAt(line.pos + 1) !== DOLLAR) {
                    return false
                }
                const from = cx.lineStart + line.pos
                const afterOpen = line.pos + 2

                // 同行闭合：`$$ E=mc^2 $$` 独占一行
                const closeIdx = line.text.indexOf('$$', afterOpen)
                if (closeIdx > -1) {
                    if (closeIdx <= afterOpen) return false // `$$$$` 空公式不当块处理
                    if (line.skipSpace(closeIdx + 2) !== line.text.length) return false
                    cx.addElement(cx.elt('BlockMath', from, cx.lineStart + line.text.length))
                    cx.nextLine()
                    return true
                }

                // 多行：向后扫描独占一行的闭合 $$（未闭合则吞到 EOF，同未闭合围栏）
                while (cx.nextLine()) {
                    const p = line.pos
                    if (
                        line.text.charCodeAt(p) === DOLLAR &&
                        line.text.charCodeAt(p + 1) === DOLLAR &&
                        line.skipSpace(p + 2) === line.text.length
                    ) {
                        cx.addElement(cx.elt('BlockMath', from, cx.lineStart + line.text.length))
                        cx.nextLine()
                        return true
                    }
                }
                cx.addElement(cx.elt('BlockMath', from, cx.prevLineEnd()))
                return true
            }
        }
    ]
}

/* ---------------- 行内公式渲染 ---------------- */

const inlineMathRenderer: NodeRenderer = {
    nodeTypes: ['InlineMath'],
    render(ctx, node) {
        if (ctx.touches(node.from, node.to)) {
            ctx.mark(node.from, node.to, 'cm-math-src')
            return false
        }
        const tex = texFromSource(ctx.state.sliceDoc(node.from, node.to))
        ctx.conceal(node.from, node.to, new MathWidget(tex, false, node.from))
        return false
    }
}

/** 从公式源码中剥掉首尾定界符 */
function texFromSource(source: string): string {
    if (source.startsWith('$$') && source.endsWith('$$') && source.length > 4) {
        return source.slice(2, -2).trim()
    }
    if (source.startsWith('$') && source.endsWith('$') && source.length > 2) {
        return source.slice(1, -1).trim()
    }
    return source.trim()
}

/* ---------------- 块级公式渲染（StateField） ---------------- */

/**
 * CM6 规定 block replace 装饰只能出自 StateField。
 * 树是增量解析的：字段在 doc/selection 变化时重建；语法树随后长大时由
 * 下面的 watcher 补一次重建，避免未解析区域的公式迟迟不出块。
 */
const setMathDeco = StateEffect.define<DecorationSet>()

function blockMathDecorations(state: EditorState): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>()
    const doc = state.doc
    syntaxTree(state).iterate({
        from: 0,
        to: doc.length,
        enter: (node) => {
            if (node.name !== 'BlockMath') return
            // 预览模式不露出源码
            const revealed =
                revealEnabled(state) &&
                state.selection.ranges.some((r) => r.from <= node.to && r.to >= node.from)
            if (revealed) return false // 光标在公式内：整块回源码
            const tex = texFromSource(doc.sliceString(node.from, node.to))
            builder.add(
                node.from,
                node.to,
                Decoration.replace({ block: true, widget: new MathWidget(tex, true, node.from) })
            )
            return false
        }
    })
    return builder.finish()
}

const mathBlockField = StateField.define<DecorationSet>({
    create(state) {
        return blockMathDecorations(state)
    },
    update(value, tr) {
        if (tr.docChanged || tr.selection) return blockMathDecorations(tr.state)
        for (const effect of tr.effects) {
            if (effect.is(setMathDeco)) return effect.value
        }
        return value
    },
    provide: (field) => EditorView.decorations.from(field)
})

/** 语法树增量解析推进时补建块公式装饰（doc/selection 变化时字段已自行重建） */
const mathTreeWatcher = ViewPlugin.fromClass(
    class {
        private destroyed = false

        destroy(): void {
            this.destroyed = true
        }

        update(update: ViewUpdate): void {
            if (update.docChanged || update.selectionSet) return
            if (!treeChanged(update)) return
            // update 周期内禁止 dispatch：推迟到下一轮事件循环
            const view = update.view
            setTimeout(() => {
                if (this.destroyed) return
                view.dispatch({
                    effects: setMathDeco.of(blockMathDecorations(view.state))
                })
            }, 0)
        }
    }
)

export const mathPlugin: MarkdownPlugin = {
    id: 'math',
    title: '数学公式',
    description: '$行内$ 与 $$块级$$ 公式，KaTeX 渲染（点击回源码编辑）',
    category: 'node',
    defaultEnabled: true,
    parse: mathParse,
    extensions: [mathBlockField, mathTreeWatcher],
    renderers: [inlineMathRenderer]
}
