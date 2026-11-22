/**
 * CodeMirror 主题桥接：布局主题走 EditorView.theme，颜色全部消费 Raydown 的
 * CSS 变量（var(--background) 等），dark/light 由 html.dark 上的变量自动切换，
 * 因此这里不做两套主题，只做一套变量引用。
 *
 * CM6 测量陷阱（reference/theme.ts 记录）：垂直 padding 必须放在 .cm-content 上
 * （会被算进 documentPadding），水平 padding 必须放在 .cm-scroller 上，不可互换。
 */
import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'

const layoutTheme = EditorView.theme({
    '&': {
        height: '100%',
        backgroundColor: 'transparent',
        color: 'var(--foreground)'
    },
    '.cm-scroller': {
        // 水平 padding 放 scroller；垂直留白放 content（见上方陷阱注释）
        // 垂直滚动条常驻（overflow-y-scroll），避免长文本出现/消失时正文宽度跳变；
        // 水平滚动供不折行的代码块行使用（cm-code-line white-space: pre）
        padding: '0 2rem',
        overflowY: 'scroll',
        overflowX: 'auto',
        fontFamily: 'var(--font-sans)',
        fontSize: '0.875rem',
        lineHeight: '1.625'
    },
    '.cm-content': {
        maxWidth: '45rem',
        margin: '0 auto',
        padding: '0.75rem 0 12rem 0',
        caretColor: 'var(--foreground)'
    },
    '.cm-line': { padding: '0' },
    '&.cm-focused': { outline: 'none' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)' },
    // 露出的语法符（反斜杠转义等）与代码块语言标注：弱化显示
    '.cm-syntax-mark': {
        color: 'var(--color-muted-foreground)'
    }
})

/** 基础高亮：只覆盖与插件无关的通用 tag（其余样式随各插件自带） */
const baseHighlighting = syntaxHighlighting(
    HighlightStyle.define([
        { tag: t.processingInstruction, class: 'cm-syntax-mark' },
        { tag: t.contentSeparator, class: 'cm-syntax-mark' }
    ])
)

export const editorTheme: readonly Extension[] = [layoutTheme, baseHighlighting]
