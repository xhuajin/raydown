/**
 * markdown 编辑器组装入口。
 *
 * 扩展顺序注意：插件 keymap 必须排在 defaultKeymap 之前（CM 按扩展顺序求值，
 * 先注册者优先），且各命令内部都做上下文守卫（不在自己领域内 return false），
 * 因此插件关闭时对应按键自然回落到默认行为。
 */
import { Compartment, EditorState } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { indentUnit } from '@codemirror/language'
import { EditorView, dropCursor, keymap } from '@codemirror/view'
import { markdownKeymap } from '@codemirror/lang-markdown'
import { buildMarkdownLanguage } from './language/markdown'
import { buildPluginBundle } from './core/registry'
import { livePreview } from './core/live-preview'
import { tabIndent, shiftTabIndent } from './core/indent'
import { editorTheme } from './theme/theme'
import './theme/cm-editor.css'
import type { EditorHost } from './core/types'

export interface CreateEditorOptions {
    /** 初始 markdown 源文本 */
    doc: string
    readonly?: boolean
    /** 启用的插件 id 集合 */
    enabledPlugins: ReadonlySet<string>
    host: EditorHost
    parent: HTMLElement
}

export interface MarkdownEditor {
    view: EditorView
    /** 插件开关变化：整体重装方言 + 扩展（文档/撤销历史保留） */
    reconfigurePlugins(enabledPlugins: ReadonlySet<string>): void
    destroy(): void
}

export function createMarkdownEditor(options: CreateEditorOptions): MarkdownEditor {
    // 语言与插件各占一个 compartment：插件开关时整体重装
    const languageCompartment = new Compartment()
    const pluginCompartment = new Compartment()
    const readOnlyCompartment = new Compartment()
    const editingKeysCompartment = new Compartment()

    const bundle = buildPluginBundle(options.enabledPlugins)

    // 编辑键位（Tab/Enter/Backspace/undo…）：预览模式下整体卸载——
    // CM 的 keymap 在非可编辑视图上仍会触发，官方命令不检查 readOnly，
    // 不卸载会让预览页的 Enter/undo 改写文档
    const editingKeys = keymap.of([
        { key: 'Tab', run: tabIndent },
        { key: 'Shift-Tab', run: shiftTabIndent },
        ...markdownKeymap,
        ...defaultKeymap,
        ...historyKeymap
    ])

    const baseExtensions: readonly Extension[] = [
        history(),
        // 不启用 drawSelection：选区与光标由浏览器原生绘制（contenteditable）。
        // 原生选区按字形精确高亮，且绘制在文本层之上——代码块背景不会遮挡选区，
        // 也不会出现多行整行高亮。代价：Ctrl+点击多光标时，非主选区不可见。
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        EditorView.lineWrapping,
        // 代码块内 Tab 缩进单位（Obsidian 风格 4 空格）
        indentUnit.of('    '),
        readOnlyCompartment.of([
            EditorState.readOnly.of(!!options.readonly),
            EditorView.editable.of(!options.readonly)
        ]),
        languageCompartment.of(buildMarkdownLanguage(bundle)),
        // 插件 keymap 在 defaultKeymap 之前（见模块注释）
        pluginCompartment.of(bundle.extensions),
        editingKeysCompartment.of(options.readonly ? [] : [editingKeys]),
        livePreview,
        editorTheme,
        EditorView.updateListener.of((update) => {
            if (update.docChanged) options.host.onChange?.(update.state.doc.toString())
            if (update.docChanged || update.selectionSet) {
                options.host.onCursorChange?.(update.state.selection.main.head)
            }
        })
    ]

    const view = new EditorView({
        state: EditorState.create({ doc: options.doc, extensions: baseExtensions }),
        parent: options.parent
    })

    return {
        view,
        reconfigurePlugins(enabledPlugins: ReadonlySet<string>) {
            const next = buildPluginBundle(enabledPlugins)
            view.dispatch({
                effects: [
                    languageCompartment.reconfigure(buildMarkdownLanguage(next)),
                    pluginCompartment.reconfigure(next.extensions)
                ]
            })
        },
        destroy() {
            view.destroy()
        }
    }
}
