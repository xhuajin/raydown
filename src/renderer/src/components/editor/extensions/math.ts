import { Node } from '@tiptap/core'
import type { DOMOutputSpec } from 'prosemirror-model'
import { inputRules } from 'prosemirror-inputrules'
import {
    createCursorInsidePlugin,
    createMathBlockView,
    createMathInlineInputRule,
    createMathInlineView,
    mathBlockEnterRule,
    mathBlockSpec,
    mathInlineSpec
} from 'prosemirror-math'
import { createEnterRulePlugin } from 'prosemirror-enter-rules'
import katex from 'katex'
import 'katex/dist/katex.min.css'

/**
 * 数学公式支持：把 prosemirror-math 包成 Tiptap Node 扩展，行为与改动前保持一致。
 *
 * 关键约定：节点名必须保持 mathInline / mathBlock（mathBlockEnterRule 与
 * createMathInlineInputRule 都按这两个名字查找）；节点 schema 沿用原样 mathInlineSpec /
 * mathBlockSpec（"math" group、text* 内容与 toDOM/parseDOM），保证 JSON 落库与 textOf
 * 抽取行为与迁移前一致。
 *
 * - NodeView：use `createMathInlineView`/`createMathBlockView`，光标进入/离开节点时
 *   在「源码编辑区」与「KaTeX 渲染结果」间切换。
 * - `$$` + Enter → 数学块（mathBlockEnterRule）。
 * - `$…$` → 行内公式（createMathInlineInputRule）。
 * - createCursorInsidePlugin：光标进入数学节点时加 `prosemirror-math-head-inside` 类。
 *
 * 注意：createMathInlineInputRule 返回的是原生 prosemirror-inputrules 的 InputRule，
 * 不直接兼容 Tiptap 的 addInputRules；因此行内公式用它经 prosemirror-inputrules 的
 * inputRules 包成 PM Plugin，再放到 addProseMirrorPlugins 里，行为与迁移前完全一致。
 */

const renderMathInline = (text: string, element: HTMLElement): void => {
    katex.render(text, element, { throwOnError: false, displayMode: false })
}
const renderMathBlock = (text: string, element: HTMLElement): void => {
    katex.render(text, element, { throwOnError: false, displayMode: true })
}

export const MathInline = Node.create({
    name: 'mathInline',
    content: mathInlineSpec.content,
    group: mathInlineSpec.group,
    inline: mathInlineSpec.inline,
    atom: mathInlineSpec.atom,
    selectable: mathInlineSpec.selectable,
    code: mathInlineSpec.code,
    parseHTML: () => mathInlineSpec.parseDOM,
    renderHTML: () =>
        (mathInlineSpec.toDOM as unknown as () => DOMOutputSpec | null)?.() ?? ['span', 0],
    addNodeView() {
        return ({ node, decorations }) => createMathInlineView(renderMathInline, node, decorations)
    },
    addProseMirrorPlugins() {
        // `$…$` → 行内公式（原生 InputRule，经 inputRules 包成 PM 插件）
        return [inputRules({ rules: [createMathInlineInputRule('mathInline')] })]
    }
})

export const MathBlock = Node.create({
    name: 'mathBlock',
    content: mathBlockSpec.content,
    group: mathBlockSpec.group,
    atom: mathBlockSpec.atom,
    code: mathBlockSpec.code,
    parseHTML: () => mathBlockSpec.parseDOM,
    renderHTML: () =>
        (mathBlockSpec.toDOM as unknown as () => DOMOutputSpec | null)?.() ?? ['div', 0],
    addNodeView() {
        return ({ node, decorations }) => createMathBlockView(renderMathBlock, node, decorations)
    },
    addProseMirrorPlugins() {
        // 光标进入数学块时切源码视图 + `$$`+Enter 生成数学块
        return [createCursorInsidePlugin(), createEnterRulePlugin({ rules: [mathBlockEnterRule] })]
    }
})
