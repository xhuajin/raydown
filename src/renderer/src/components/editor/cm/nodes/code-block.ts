/**
 * 围栏代码块插件：```` ```lang ```` 。
 * - 围栏行（``` 与 ```）光标不在该行时隐藏（内容零宽隐藏 + 行高折叠），
 *   光标移到围栏行时源码出现，可编辑语言标注
 * - 内容行行装饰（代码字体 + 背景块 + 首尾圆角），块内不折行、过长时整编辑器横向滚动
 * - 块内语法高亮走 @codemirror/language-data 的嵌套解析（按 fence info 惰性加载）
 * - Enter 在未闭合围栏上自动补闭合围栏
 */
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { keymap } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { languages } from '@codemirror/language-data'
import type { MarkdownPlugin, NodeRenderer } from '../core/types'
import { canEdit } from '../core/readonly'
import { FenceLabelWidget } from '../core/widgets'

const codeBlockRenderer: NodeRenderer = {
    nodeTypes: ['FencedCode'],
    render(ctx, node) {
        const state = ctx.state
        const first = state.doc.lineAt(node.from)
        const last = state.doc.lineAt(node.to)
        const cursorLine = state.doc.lineAt(state.selection.main.head).number
        const multi = last.number > first.number
        // 末行是否为闭合围栏（未闭合围栏的末行是内容行，不能隐藏）
        const closed = multi && /^\s*`{3,}\s*$/.test(last.text)
        // 围栏语言（CodeInfo 文本），隐藏态显示在行右侧
        const codeInfo = node.getChild('CodeInfo')
        const lang = codeInfo ? state.sliceDoc(codeInfo.from, codeInfo.to).trim() : ''

        // 围栏行可见性：光标在代码块内部（任意行）时内容显示，块外时隐藏
        const cursorInBlock = cursorLine >= first.number && cursorLine <= last.number
        const openHidden = multi && !cursorInBlock
        const closeHidden = closed && !cursorInBlock

        // 圆角固定在块的首尾行（即围栏行）：显隐切换时圆角不迁移，背景块连续。
        // 内容行永不带圆角。
        const lineCls = (n: number): string => {
            const classes = ['cm-code-line']
            if (n === first.number) classes.push('cm-code-first')
            if (n === last.number) classes.push('cm-code-last')
            return classes.join(' ')
        }

        // 围栏行：光标在该行时显示源码，否则内容 visibility 隐藏
        //（行与背景保留；visibility 对子元素强制生效，不受语法高亮颜色类干扰）；
        // 开栏行隐藏时在行右侧显示语言标注
        const fence = (
            line: { from: number; to: number; number: number },
            hidden: boolean,
            kind: 'open' | 'close'
        ): void => {
            if (hidden) {
                ctx.line(line.from, `${lineCls(line.number)} cm-fence-hidden`)
                ctx.mark(line.from, line.to, 'cm-fence-content-hidden')
                if (kind === 'open' && lang) {
                    ctx.widget(line.to, 1, new FenceLabelWidget(lang, node.from, node.to))
                }
            } else {
                ctx.line(line.from, lineCls(line.number))
            }
        }
        fence(first, openHidden, 'open')
        if (closed) fence(last, closeHidden, 'close')

        // 内容行（无圆角；圆角固定在块首尾的围栏行上）
        for (let n = first.number + 1; n <= last.number - 1; n++) {
            ctx.line(state.doc.line(n).from, 'cm-code-line')
        }
        return false // 整块接管：CodeMark/CodeInfo/CodeText 不再单独处理
    }
}

/** Enter：空行上敲 ```（或带语言）时自动补闭合围栏，光标落在中间空行 */
function closeFenceOnEnter(view: import('@codemirror/view').EditorView): boolean {
    if (!canEdit(view)) return false // 预览模式不改写
    const { state } = view
    const sel = state.selection.main
    if (!sel.empty) return false
    const line = state.doc.lineAt(sel.head)
    const m = /^(\s*)(`{3,})(\s*[^\s`][^`]*)?$/.exec(line.text)
    if (!m || sel.head !== line.to) return false
    // 下方已存在同长度以上的闭合围栏则不补
    for (let n = line.number + 1; n <= state.doc.lines; n++) {
        const text = state.doc.line(n).text
        if (/^\s*`{3,}\s*$/.test(text)) return false
        if (!text.trim()) continue
        break
    }
    const insert = `${state.lineBreak}${state.lineBreak}${m[1]}${m[2]}`
    view.dispatch(
        state.update(
            {
                changes: { from: line.to, insert },
                selection: { anchor: line.to + 1 }
            },
            { scrollIntoView: true, userEvent: 'input.completeFence' }
        )
    )
    return true
}

export const codeBlockPlugin: MarkdownPlugin = {
    id: 'code-block',
    title: '代码块',
    description: '``` 围栏代码块：背景块样式 + 语言语法高亮 + 自动补闭合',
    category: 'node',
    defaultEnabled: true,
    codeLanguages: languages,
    extensions: [
        syntaxHighlighting(
            HighlightStyle.define([
                { tag: t.keyword, class: 'cm-tok-keyword' },
                { tag: [t.string, t.special(t.string)], class: 'cm-tok-string' },
                { tag: [t.comment, t.lineComment, t.blockComment], class: 'cm-tok-comment' },
                { tag: [t.number, t.integer, t.float], class: 'cm-tok-number' },
                { tag: t.definition(t.variableName), class: 'cm-tok-def' },
                { tag: t.variableName, class: 'cm-tok-variableName' },
                { tag: [t.typeName, t.className], class: 'cm-tok-typeName' },
                { tag: [t.atom, t.bool, t.null], class: 'cm-tok-atom' },
                { tag: t.meta, class: 'cm-tok-meta' },
                { tag: t.heading, class: 'cm-tok-heading' },
                { tag: t.link, class: 'cm-tok-link' }
            ])
        ),
        keymap.of([{ key: 'Enter', run: closeFenceOnEnter }])
    ],
    renderers: [codeBlockRenderer]
}
