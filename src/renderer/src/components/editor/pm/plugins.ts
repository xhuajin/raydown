import { baseKeymap } from 'prosemirror-commands'
import { keymap } from 'prosemirror-keymap'
import { history, redo, undo } from 'prosemirror-history'
import { gapCursor } from 'prosemirror-gapcursor'
import { Slice } from 'prosemirror-model'
import { createEnterRulePlugin } from 'prosemirror-enter-rules'
import { createCursorInsidePlugin, mathBlockEnterRule } from 'prosemirror-math'
import { liftListItem, sinkListItem, splitListItemKeepMarks } from 'prosemirror-schema-list'
import { EditorState, Plugin, type PluginKey } from 'prosemirror-state'
import * as cmd from './commands'
import { inputRulesPlugin } from './inputrules'
import { looksLikeMarkdown, markdownToSlice } from './markdown'
import { pmSchema } from './schema'

/** 工具栏/源码用到的撤销重做动作（history 插件提供底层绑定） */
export { undo, redo }

const LIST_ITEM = pmSchema.nodes.list_item

/** 光标是否在列表项内（用于 Tab 缩进守卫，避免抢占普通焦点移动） */
function inListItem(state: EditorState): boolean {
    const { $from } = state.selection
    for (let depth = $from.depth; depth > 0; depth--) {
        const node = $from.node(depth)
        if (node.type === LIST_ITEM) return true
        if (node.type.isBlock) return false
    }
    return false
}

/* ---------------- 粘贴 markdown ---------------- */

/**
 * 按来源智能处理粘贴：
 * - 本编辑器内部复制（HTML 带 data-pm-slice 标记）→ 放行默认解析，保真；
 * - 剪贴板纯文本“看起来像 markdown”（即使带 HTML，说明来源是其他 markdown 工具）
 *   → 解析成 markdown 语法插入；
 * - 其余（网页富文本 / 普通句子）→ 保持 ProseMirror 默认行为。
 */
function pasteMarkdownPlugin(): Plugin {
    return new Plugin({
        props: {
            handlePaste(view, event) {
                const data = event.clipboardData
                if (!data) return false
                const text = data.getData('text/plain')
                if (!text) return false
                // 代码块内保持原样粘贴
                if (view.state.selection.$from.parent.type.spec.code) return false
                const html = data.getData('text/html')
                if (html) {
                    if (html.includes('data-pm-slice')) return false
                    if (!looksLikeMarkdown(text)) return false
                } else if (!looksLikeMarkdown(text)) {
                    return false
                }
                let slice: Slice
                try {
                    slice = markdownToSlice(text)
                } catch {
                    return false
                }
                view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
                return true
            }
        }
    })
}

/* ---------------- 任务列表勾选 ---------------- */

/**
 * 点击任务列表项前面的 checkbox 切换完成状态。
 * checkbox 是 li 里的 span.task-checkbox（schema toDOM 渲染，非受控 input）。
 */
function taskCheckboxPlugin(): Plugin {
    return new Plugin({
        props: {
            handleDOMEvents: {
                mousedown(view, event) {
                    const target = event.target as HTMLElement | null
                    if (!target?.classList.contains('task-checkbox')) return false
                    if (!view.editable) return false
                    const li = target.closest('li[data-checked]')
                    if (!(li instanceof HTMLElement) || !view.dom.contains(li)) return false
                    const $pos = view.state.doc.resolve(view.posAtDOM(li, 0))
                    for (let depth = $pos.depth; depth >= 0; depth--) {
                        const node = $pos.node(depth)
                        if (node.type === LIST_ITEM && node.attrs.checked !== null) {
                            event.preventDefault()
                            view.dispatch(
                                view.state.tr
                                    .setNodeMarkup($pos.before(depth), null, {
                                        checked: !node.attrs.checked
                                    })
                                    .scrollIntoView()
                            )
                            return true
                        }
                    }
                    return false
                }
            }
        }
    })
}

/**
 * 组装 ProseMirror 需要的所有插件。
 * 顺序：history 先行，使其 Mod-z/y 绑定优先于自定义 keymap；
 * 列表键位与 enter rules 要排在 baseKeymap 之前（PM 按注册顺序尝试 handleKeyDown）。
 */
export function buildPlugins(): Plugin[] {
    return [
        history(),
        // ── 撤销/重做快捷键（Ctrl+Z / Ctrl+Y，Shift+Ctrl+Z 同重做）──
        keymap({
            'Mod-z': undo,
            'Mod-y': redo,
            'Shift-Mod-z': redo
        }),
        // ── 常用格式化快捷键（bold/italic/strike/code 等）──
        keymap({
            'Mod-b': (s, d, v) => cmd.strong(s, d, v),
            'Mod-i': (s, d, v) => cmd.em(s, d, v),
            'Mod-Shift-x': (s, d, v) => cmd.strike(s, d, v),
            'Mod-e': (s, d, v) => cmd.code(s, d, v)
        }),
        // ── 列表键位：Enter 拆分列表项（空项交给 baseKeymap 退出列表）、Tab 缩进 ──
        keymap({
            Enter: splitListItemKeepMarks(LIST_ITEM),
            Tab: (state, dispatch) => inListItem(state) && sinkListItem(LIST_ITEM)(state, dispatch),
            'Shift-Tab': (state, dispatch) =>
                inListItem(state) && liftListItem(LIST_ITEM)(state, dispatch),
            'Mod-]': (state, dispatch) =>
                inListItem(state) && sinkListItem(LIST_ITEM)(state, dispatch),
            'Mod-[': (state, dispatch) =>
                inListItem(state) && liftListItem(LIST_ITEM)(state, dispatch)
        }),
        // ── `$$` + Enter → 数学块 ──
        createEnterRulePlugin({ rules: [mathBlockEnterRule] }),
        keymap(baseKeymap),
        // ── markdown 风格的自动格式化（# - > ``` $ 等）──
        inputRulesPlugin(),
        // ── 列表/代码块处的块级光标 ──
        gapCursor(),
        // ── 数学节点：光标进入时切换 编辑源码/渲染结果 视图 ──
        createCursorInsidePlugin(),
        pasteMarkdownPlugin(),
        taskCheckboxPlugin()
    ]
}

export type { PluginKey }
