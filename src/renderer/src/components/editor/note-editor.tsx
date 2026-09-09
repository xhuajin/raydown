import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useReducer,
    type HTMLAttributes
} from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import {
    Bold,
    Italic,
    Strikethrough,
    Code,
    List,
    ListOrdered,
    ListTodo,
    Quote,
    Code2,
    Link as LinkIcon,
    Unlink,
    Undo2,
    Redo2
} from 'lucide-react'

import { Button } from '@renderer/components/ui/button'
import { Separator } from '@renderer/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { cn } from '@renderer/lib/utils'
import { emptyDocJson, jsonToDoc, type JSONDoc } from './pm/doc'
import { buildExtensions } from './extensions'
import './pm/editor.css'

export interface NoteEditorRef {
    getJSON: () => JSONDoc | null
    clear: () => void
}

interface NoteEditorProps extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'onChange' | 'defaultValue'
> {
    defaultValue?: JSONDoc | null
    readonly?: boolean
    placeholder?: string
    showToolbar?: boolean
    onChange?: (doc: JSONDoc) => void
    /** 初始光标文档位置：打开编辑器时把焦点放到这里（越界时自动收敛到文档末尾） */
    initialCursor?: number
    /** 光标每次移动时回调，供上层落库 */
    onCursorChange?: (position: number) => void
}

/** 初始化内容：解析失败（脏数据等）回落空文档，绝不白屏 */
function safeContent(defaultValue: JSONDoc | null | undefined): JSONDoc {
    if (!defaultValue) return emptyDocJson()
    // 用 doc.ts 的 jsonToDoc 校验一次（内部已兜底），返回校验通过的内容；解析失败则给空文档
    jsonToDoc(defaultValue)
    return defaultValue
}

/* ---------------- 工具栏辅助 ---------------- */

function ToolbarButton({
    title,
    onClick,
    active,
    disabled,
    children
}: {
    title: string
    onClick: () => void
    active?: boolean
    disabled?: boolean
    children: React.ReactNode
}): React.ReactElement {
    return (
        <Tooltip>
            <TooltipTrigger
                render={
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={onClick}
                        disabled={disabled}
                        className={cn(active && 'bg-muted text-foreground')}
                    >
                        {children}
                    </Button>
                }
            />
            <TooltipContent side="bottom">
                <p>{title}</p>
            </TooltipContent>
        </Tooltip>
    )
}

export const NoteEditor = forwardRef<NoteEditorRef, NoteEditorProps>(function NoteEditor(
    {
        defaultValue,
        readonly = false,
        placeholder,
        showToolbar = true,
        onChange,
        initialCursor,
        onCursorChange,
        className
    },
    ref
) {
    // 本组件由 App 用 key 按笔记重挂载：useEditor/effect 只在挂载时创建一次，
    // 挂载内 props（defaultValue/onChange/onCursorChange/initialCursor）恒定不变，
    // 因此直接引用 props 即可，无需 ref 中转。
    // 每次事务强制一次重渲染，驱动工具栏 active 态更新
    const [, bump] = useReducer((n: number) => n + 1, 0)

    const extensions = useMemo(() => buildExtensions(placeholder), [placeholder])

    /**
     * 选择 useEditor + <EditorContent>：单组件编辑器用 hook 最贴合（Composable <Tiptap> 面向多编辑器场景）。
     * 传入空 deps → 只在挂载时创建一次，content/editable 取自挂载时的 props，之后的
     * React 重渲染（store 更新、工具栏 bump）不会重建或重置文档。
     */
    const editor = useEditor(
        {
            extensions,
            content: safeContent(defaultValue),
            editable: !readonly,
            immediatelyRender: false,
            shouldRerenderOnTransaction: false,
            onUpdate: ({ editor }) => {
                onChange?.(editor.getJSON() as JSONDoc)
            },
            onTransaction: ({ editor, transaction }) => {
                // 光标移动（含联想/方向键）随事务上报，便于上层存储
                if (transaction.selectionSet) onCursorChange?.(editor.state.selection.head)
                bump() // 刷新工具栏 active 态
            }
        },
        []
    )

    // 进入编辑页自动聚焦并把光标放到保存的位置（收敛到文档范围内）
    useEffect(() => {
        if (!editor) return
        const savedPos = Math.max(0, initialCursor ?? 0)
        const size = editor.state.doc.content.size
        const target = Math.min(savedPos, Math.max(0, size))
        const raf = requestAnimationFrame(() => {
            if (!editor || editor.isDestroyed) return
            editor.commands.setTextSelection(target)
            if (editor.isEditable) editor.commands.focus()
        })
        return () => cancelAnimationFrame(raf)
    }, [editor])

    useImperativeHandle(
        ref,
        () => ({
            getJSON: () => (editor ? (editor.getJSON() as JSONDoc) : null),
            clear: () => {
                if (!editor) return
                editor.commands.clearContent()
                onChange?.(editor.getJSON() as JSONDoc)
            }
        }),
        [editor]
    )

    const run = useCallback(
        (fn: (ed: Editor) => void) => {
            if (!editor) return
            fn(editor)
            editor.commands.focus()
        },
        [editor]
    )

    const toggleLink = useCallback(() => {
        if (!editor) return
        if (editor.isActive('link')) {
            editor.chain().focus().extendMarkRange('link').unsetLink().run()
            return
        }
        const url = window.prompt('链接地址')
        if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }, [editor])

    return (
        <div className={cn('flex flex-col min-h-0 min-w-0', className)}>
            {showToolbar && editor ? (
                <div className="flex items-center h-9 shrink-0 gap-0.5 border-b border-border px-2 text-xs text-muted-foreground">
                    <ToolbarButton
                        title="撤销"
                        disabled={!editor.can().undo()}
                        onClick={() => run((ed) => ed.chain().undo().run())}
                    >
                        <Undo2 size={15} />
                    </ToolbarButton>
                    <ToolbarButton
                        title="重做"
                        disabled={!editor.can().redo()}
                        onClick={() => run((ed) => ed.chain().redo().run())}
                    >
                        <Redo2 size={15} />
                    </ToolbarButton>
                    <Separator orientation="vertical" className="w-[1.5px]! mx-1 h-4 my-auto" />

                    <ToolbarButton
                        title="标题 1"
                        active={editor.isActive('heading', { level: 1 })}
                        onClick={() => run((ed) => ed.chain().toggleHeading({ level: 1 }).run())}
                    >
                        H1
                    </ToolbarButton>
                    <ToolbarButton
                        title="标题 2"
                        active={editor.isActive('heading', { level: 2 })}
                        onClick={() => run((ed) => ed.chain().toggleHeading({ level: 2 }).run())}
                    >
                        H2
                    </ToolbarButton>
                    <ToolbarButton
                        title="标题 3"
                        active={editor.isActive('heading', { level: 3 })}
                        onClick={() => run((ed) => ed.chain().toggleHeading({ level: 3 }).run())}
                    >
                        H3
                    </ToolbarButton>
                    <Separator orientation="vertical" className="w-[1.5px]! mx-1 h-4 my-auto" />

                    <ToolbarButton
                        title="加粗"
                        active={editor.isActive('bold')}
                        onClick={() => run((ed) => ed.chain().toggleBold().run())}
                    >
                        <Bold size={15} />
                    </ToolbarButton>
                    <ToolbarButton
                        title="斜体"
                        active={editor.isActive('italic')}
                        onClick={() => run((ed) => ed.chain().toggleItalic().run())}
                    >
                        <Italic size={15} />
                    </ToolbarButton>
                    <ToolbarButton
                        title="删除线"
                        active={editor.isActive('strike')}
                        onClick={() => run((ed) => ed.chain().toggleStrike().run())}
                    >
                        <Strikethrough size={15} />
                    </ToolbarButton>
                    <ToolbarButton
                        title="行内代码"
                        active={editor.isActive('code')}
                        onClick={() => run((ed) => ed.chain().toggleCode().run())}
                    >
                        <Code size={15} />
                    </ToolbarButton>
                    <Separator orientation="vertical" className="w-[1.5px]! mx-1 h-4 my-auto" />

                    <ToolbarButton
                        title="无序列表"
                        active={editor.isActive('bulletList')}
                        onClick={() => run((ed) => ed.chain().toggleBulletList().run())}
                    >
                        <List size={15} />
                    </ToolbarButton>
                    <ToolbarButton
                        title="有序列表"
                        active={editor.isActive('orderedList')}
                        onClick={() => run((ed) => ed.chain().toggleOrderedList().run())}
                    >
                        <ListOrdered size={15} />
                    </ToolbarButton>
                    <ToolbarButton
                        title="任务列表"
                        active={editor.isActive('taskList')}
                        onClick={() => run((ed) => ed.chain().toggleTaskList().run())}
                    >
                        <ListTodo size={15} />
                    </ToolbarButton>
                    <ToolbarButton
                        title="引用"
                        active={editor.isActive('blockquote')}
                        onClick={() => run((ed) => ed.chain().toggleBlockquote().run())}
                    >
                        <Quote size={15} />
                    </ToolbarButton>
                    <ToolbarButton
                        title="代码块"
                        active={editor.isActive('codeBlock')}
                        onClick={() => run((ed) => ed.chain().toggleCodeBlock().run())}
                    >
                        <Code2 size={15} />
                    </ToolbarButton>
                    <ToolbarButton
                        title="链接"
                        active={editor.isActive('link')}
                        onClick={toggleLink}
                    >
                        {editor.isActive('link') ? <Unlink size={15} /> : <LinkIcon size={15} />}
                    </ToolbarButton>
                </div>
            ) : null}

            <EditorContent
                editor={editor}
                spellCheck={false}
                className="flex-1 min-h-0 overflow-y-auto px-4 py-3 text-sm leading-relaxed outline-none"
            />
        </div>
    )
})

export default NoteEditor
