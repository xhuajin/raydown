import { Extension, getTextContentFromNodes } from '@tiptap/core'
import { Highlight } from '@tiptap/extension-highlight'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

/**
 * 高亮 mark（markdown 语法 ==xx==），基于官方 @tiptap/extension-highlight：
 * 官方已内置 ==xx== 的输入规则（逐字输入）、粘贴规则、markdown tokenizer 与 <mark> 解析，
 * 这里只做两处增强：
 *
 * 1) HighlightMark：快捷键增加 Ctrl/Cmd+H（官方默认 Mod-Shift-h 保留）。
 *
 * 2) HighlightEqualSignWrap：选中文本后按两次 = —— 官方输入规则只匹配「光标前文本」，
 *    感知不到选区，无法实现该交互，因此自定义插件接管：
 *    - 第一次按 = ：选区两侧各插入一个 =（形如 =xx=），光标移到末尾；
 *    - 第二次按 = ：光标正位于刚包好的 =xx= 末尾时，去掉两侧 = 并把 xx 转为高亮。
 *    第二次按 = 的识别要求「光标恰好在上次包裹的结束位置」+ 文本命中 =xx= 双重成立，
 *    避免误伤手打的 a = b = 之类内容。
 */

export const HighlightMark = Highlight.extend({
    addKeyboardShortcuts() {
        return {
            ...this.parent?.(),
            'Mod-h': () => this.editor.commands.toggleHighlight()
        }
    }
})

/** 记录「上次 = 包裹」结束位置（光标处）的插件 key */
const equalWrapKey = new PluginKey('highlightEqualWrap')

/** 选区两端是否带代码 mark（与官方输入规则跳过代码的策略一致） */
function hasCodeMarkAtEdge(view: EditorView, from: number, to: number): boolean {
    const $from = view.state.doc.resolve(from)
    const $to = view.state.doc.resolve(to)
    return (
        ($from.nodeAfter?.marks.some((m) => m.type.spec.code) ?? false) ||
        ($to.nodeBefore?.marks.some((m) => m.type.spec.code) ?? false)
    )
}

export const HighlightEqualSignWrap = Extension.create({
    name: 'highlightEqualSignWrap',

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: equalWrapKey,
                state: {
                    init: () => null as number | null,
                    apply(tr, prev) {
                        const meta = tr.getMeta(equalWrapKey)
                        if (meta !== undefined) return meta as number | null
                        if (prev === null || !tr.docChanged) return prev
                        return tr.mapping.map(prev)
                    }
                },
                props: {
                    handleTextInput(view: EditorView, from: number, to: number, text: string) {
                        if (text !== '=') return false
                        const { state } = view
                        const markType = state.schema.marks.highlight
                        if (!markType) return false

                        // 第二次按 =：光标位于上次包裹的末尾，且光标前文本是 =xx= → 转为高亮
                        const pending = equalWrapKey.getState(state) as number | null
                        if (from === to && pending !== null && from === pending) {
                            const $from = state.doc.resolve(from)
                            if (!$from.parent.type.spec.code) {
                                const textBefore = getTextContentFromNodes($from)
                                // =xx=：xx 不含 = 与换行，且非纯空白；前导 = 须在行首或空格后
                                const match = /(?:^|\s)=([^=\n]+)=$/.exec(textBefore)
                                if (match && match[1].trim()) {
                                    const inner = match[1]
                                    // match[0] 末尾是光标，前导 = 的绝对位置 = from - xx长度 - 2
                                    const eqPos = from - inner.length - 2
                                    const tr = state.tr
                                    tr.delete(from - 1, from) // 尾部 =
                                    tr.delete(eqPos, eqPos + 1) // 头部 =
                                    tr.addMark(eqPos, from - 2, markType.create())
                                    tr.removeStoredMark(markType)
                                    tr.setSelection(TextSelection.create(tr.doc, from - 2))
                                    tr.setMeta(equalWrapKey, null)
                                    tr.scrollIntoView()
                                    view.dispatch(tr)
                                    return true
                                }
                            }
                        }

                        // 第一次按 =：同一文本块内的非空文本选区 → 两侧插入 =
                        const { selection } = state
                        const $from = state.doc.resolve(from)
                        const $to = state.doc.resolve(to)
                        if (
                            from !== to &&
                            selection instanceof TextSelection &&
                            $from.parent === $to.parent &&
                            !$from.parent.type.spec.code &&
                            !hasCodeMarkAtEdge(view, from, to)
                        ) {
                            const tr = state.tr
                            tr.insertText('=', to, to) // 先插尾部，不影响头部位置
                            tr.insertText('=', from, from)
                            const end = to + 2
                            tr.setSelection(TextSelection.create(tr.doc, end))
                            tr.setMeta(equalWrapKey, end)
                            tr.scrollIntoView()
                            view.dispatch(tr)
                            return true
                        }

                        return false
                    }
                }
            })
        ]
    }
})
