import { forwardRef, useEffect, useImperativeHandle, useRef, type HTMLAttributes } from 'react'
import { createMarkdownEditor, type MarkdownEditor } from './cm'
import { resolveEnabledPlugins } from './cm/core/registry'
import { useSettingsStore } from '@renderer/store/settings-store'
import { cn } from '@renderer/lib/utils'

export interface NoteEditorRef {
    /** 当前 markdown 源文本 */
    getMarkdown: () => string | null
    clear: () => void
}

interface NoteEditorProps extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'onChange' | 'defaultValue'
> {
    defaultValue?: string | null
    /** 独立标题（与正文解耦）；编辑态可输入，预览态只读展示 */
    title?: string
    readonly?: boolean
    onChange?: (markdown: string) => void
    onTitleChange?: (title: string) => void
    /** 初始光标文档位置：打开编辑器时把焦点放到这里（越界时自动收敛到文档末尾） */
    initialCursor?: number
    /** 光标每次移动时回调，供上层落库 */
    onCursorChange?: (position: number) => void
}

/**
 * markdown 笔记编辑器（CodeMirror 6 live preview）。
 * 本组件由上层用 key 按笔记重挂载：编辑器只在挂载时创建一次，
 * 挂载内 props（defaultValue/onChange/initialCursor）恒定不变，无需响应式同步。
 * 插件开关实时生效：订阅 settings-store，变化时经 compartment 重装扩展。
 */
export const NoteEditor = forwardRef<NoteEditorRef, NoteEditorProps>(function NoteEditor(
    { defaultValue, title, readonly = false, onChange, onTitleChange, initialCursor, onCursorChange, className },
    ref
) {
    const containerRef = useRef<HTMLDivElement>(null)
    const editorRef = useRef<MarkdownEditor | null>(null)

    useEffect(() => {
        const container = containerRef.current
        if (!container) return
        const editor = createMarkdownEditor({
            doc: defaultValue ?? '',
            readonly,
            enabledPlugins: resolveEnabledPlugins(useSettingsStore.getState().plugins),
            host: { onChange, onCursorChange },
            parent: container
        })
        editorRef.current = editor
        // 进入编辑页自动聚焦并把光标放到保存的位置（收敛到文档范围内）
        const raf = requestAnimationFrame(() => {
            // 组件已卸载（editorRef 清空）则跳过
            if (editorRef.current !== editor) return
            const view = editor.view
            const target = Math.min(Math.max(0, initialCursor ?? 0), view.state.doc.length)
            view.dispatch({ selection: { anchor: target }, scrollIntoView: true })
            if (!readonly) view.focus()
        })
        return () => {
            cancelAnimationFrame(raf)
            editor.destroy()
            editorRef.current = null
        }
        // 挂载时一次性创建：父级以 key={note.id} 重挂载，挂载内 props 恒定
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // 插件开关变化：整体重装（文档与撤销历史保留）
    const pluginOverrides = useSettingsStore((s) => s.plugins)
    useEffect(() => {
        editorRef.current?.reconfigurePlugins(resolveEnabledPlugins(pluginOverrides))
    }, [pluginOverrides])

    useImperativeHandle(
        ref,
        () => ({
            getMarkdown: () =>
                editorRef.current ? editorRef.current.view.state.doc.toString() : null,
            clear: () => {
                const editor = editorRef.current
                if (!editor) return
                editor.view.dispatch({
                    changes: { from: 0, to: editor.view.state.doc.length, insert: '' }
                })
            }
        }),
        []
    )

    return (
        <div className={cn('flex flex-col min-h-0 min-w-0 h-full', className)}>
            {readonly ? (
                <div className="cm-note-title">{title || 'Untitled'}</div>
            ) : (
                <input
                    className="cm-note-title cm-note-title-input"
                    value={title ?? ''}
                    placeholder="Untitled"
                    onChange={(e) => onTitleChange?.(e.target.value)}
                />
            )}
            <div ref={containerRef} className="flex-1 min-h-0 min-w-0 overflow-hidden" />
        </div>
    )
})

export default NoteEditor
