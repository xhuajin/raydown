import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useReducer,
    useRef,
    useState,
    type HTMLAttributes
} from 'react'
import { AllSelection, EditorState, Selection, type Command } from 'prosemirror-state'
import { EditorView, type Decoration } from 'prosemirror-view'
import type { MarkType, Node as PMNode, NodeType, Slice } from 'prosemirror-model'
import { createMathBlockView, createMathInlineView } from 'prosemirror-math'
import katex from 'katex'
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
    Undo2,
    Redo2
} from 'lucide-react'

import { Button } from '@renderer/components/ui/button'
import { Separator } from '@renderer/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { cn } from '@renderer/lib/utils'
import { pmSchema } from './pm/schema'
import { emptyDocJson, jsonToDoc, docToJson, type JSONDoc } from './pm/doc'
import { buildPlugins, undo, redo } from './pm/plugins'
import * as cmd from './pm/commands'
import { htmlToSlice, looksLikeMarkdown, markdownToSlice, sliceToMarkdown } from './pm/markdown'
import {
    EditorContextMenu,
    MENU_SEPARATOR,
    type ContextMenuItem,
    type ContextMenuState
} from './context-menu'
import 'katex/dist/katex.min.css'
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

/* ---------------- 工具栏辅助 ---------------- */

// 数学公式渲染（prosemirror-math NodeView 用）。throwOnError=false 时
// 非法 LaTeX 会以红色源码形式展示而不是抛错。
const renderMathInline = (text: string, element: HTMLElement): void => {
    katex.render(text, element, { throwOnError: false, displayMode: false })
}
const renderMathBlock = (text: string, element: HTMLElement): void => {
    katex.render(text, element, { throwOnError: false, displayMode: true })
}
const mathNodeViews = {
    mathInline: (node: PMNode, _v: EditorView, _p: unknown, decorations: readonly Decoration[]) =>
        createMathInlineView(renderMathInline, node, decorations),
    mathBlock: (node: PMNode, _v: EditorView, _p: unknown, decorations: readonly Decoration[]) =>
        createMathBlockView(renderMathBlock, node, decorations)
}

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
}) {
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

function markActive(state: EditorState, type: MarkType): boolean {
    const { from, to, empty } = state.selection
    if (empty) return !!type.isInSet(state.storedMarks || [])
    return state.doc.rangeHasMark(from, to, type)
}

function isHeading(state: EditorState, level: number): boolean {
    const node = state.selection.$from.node()
    return node.type === pmSchema.nodes.heading && node.attrs.level === level
}

function isList(state: EditorState, name: 'bullet_list' | 'ordered_list'): boolean {
    // 任务项不算 bullet/ordered 的 active 态（由任务按钮负责），否则任务列表会亮无序按钮
    const item = currentListItem(state)
    if (item && item.attrs.checked !== null) return false
    const { $from } = state.selection
    for (let depth = $from.depth; depth > 0; depth--) {
        const node = $from.node(depth)
        if (node.type === pmSchema.nodes[name]) return true
    }
    return false
}

/** 光标所在列表项（最内层），不在列表内返回 null */
function currentListItem(state: EditorState): PMNode | null {
    const { $from } = state.selection
    for (let depth = $from.depth; depth > 0; depth--) {
        if ($from.node(depth).type === pmSchema.nodes.list_item) return $from.node(depth)
    }
    return null
}

/** 光标是否在任务列表项内（无论勾选状态） */
function isTaskItem(state: EditorState): boolean {
    const item = currentListItem(state)
    return item !== null && item.attrs.checked !== null
}

/**
 * 只读视图里 PM 不把原生 DOM 选区同步回 state（双击选词、拖选都是浏览器行为），
 * 这里手动把原生选区映射为文档范围，供只读「复制」序列化用。
 */
function domSelectionRange(view: EditorView): { from: number; to: number } | null {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.anchorNode) return null
    if (!view.dom.contains(selection.anchorNode)) return null
    try {
        const anchor = view.posAtDOM(selection.anchorNode, selection.anchorOffset)
        const focus = view.posAtDOM(selection.focusNode!, selection.focusOffset)
        if (anchor === focus) return null
        return { from: Math.min(anchor, focus), to: Math.max(anchor, focus) }
    } catch {
        return null
    }
}

function isBlock(state: EditorState, type: NodeType): boolean {
    const node = state.selection.$from.node()
    return !!node && node.type === type
}

function promptLink(dispatch: (cmd: Command) => void): void {
    const url = window.prompt('链接地址')
    if (url) dispatch(cmd.linkHref(url))
}

/** 是否含实际文本（占位显示依据） */
function docHasText(doc: import('prosemirror-model').Node): boolean {
    return doc.textContent.trim().length > 0
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
    const containerRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange
    const onCursorChangeRef = useRef(onCursorChange)
    onCursorChangeRef.current = onCursorChange
    const readonlyRef = useRef(readonly)
    readonlyRef.current = readonly
    // 每次事务强制一次重渲染，驱动工具栏 active 态更新
    const [, bump] = useReducer((n: number) => n + 1, 0)
    // 初始光标只在挂载时读取一次（防止依赖项变化导致重复聚焦）
    const initialCursorRef = useRef(initialCursor)

    useImperativeHandle(
        ref,
        () => ({
            getJSON: () => (viewRef.current ? docToJson(viewRef.current.state.doc) : null),
            clear: () => {
                const v = viewRef.current
                if (!v) return
                const empty = jsonToDoc(emptyDocJson())
                v.dispatch(v.state.tr.replaceWith(0, v.state.doc.nodeSize, empty))
                onChangeRef.current?.(docToJson(v.state.doc))
            }
        }),
        []
    )

    // 首帧创建 EditorView；StrictMode 建→毁→再建，同一 container，旧 view destroy 只清子节点
    useEffect(() => {
        const mount = containerRef.current
        if (!mount) return

        const doc = jsonToDoc(defaultValue ?? emptyDocJson())
        // 把光标放在保存的位置（自动收敛到文档范围内），否则默认文档开头。
        // 用 Selection.near 兜底：保存的 cursor 可能落在块边界（parent 为 doc），
        // TextSelection.create 会直接抛错导致整页崩溃
        const savedPos = Math.max(0, initialCursorRef.current ?? 0)
        const clampedPos = Math.min(savedPos, doc.content.size)
        const selection = Selection.near(doc.resolve(clampedPos))
        const state = EditorState.create({ doc, selection, plugins: buildPlugins() })

        const view = new EditorView(mount, {
            state,
            editable: () => !readonlyRef.current,
            // 数学公式节点用 prosemirror-math 的 NodeView：光标在节点内显示 LaTeX 源码，
            // 移出后显示 KaTeX 渲染结果
            nodeViews: mathNodeViews,
            // 复制/剪切到编辑器外时，text/plain 写入 markdown 语法
            // （text/html 仍由 PM 默认序列化，保证内部粘贴与富文本互拷可用）
            clipboardTextSerializer: (slice) => sliceToMarkdown(slice),
            dispatchTransaction(tr) {
                const nextState = view.state.apply(tr)
                view.updateState(nextState)
                if (tr.docChanged) onChangeRef.current?.(docToJson(nextState.doc))
                // 光标移动（含联想/方向键）也随事务更新，便于上层落库
                onCursorChangeRef.current?.(nextState.selection.head)
                bump() // 刷新工具栏 active 态
            },
            attributes: { spellcheck: 'false' }
        })
        viewRef.current = view
        // 进入编辑页自动聚焦，省去手动点击（StrictMode 二次挂载时最终保留的视图也会聚焦）
        const focusRaf = requestAnimationFrame(() => {
            if (!viewRef.current) return
            viewRef.current.focus()
        })

        return () => {
            cancelAnimationFrame(focusRaf)
            view.destroy()
            viewRef.current = null
        }
    }, [])

    const dispatch = useCallback((command: Command) => {
        const v = viewRef.current
        if (!v) return
        if (command(v.state, v.dispatch, v)) v.focus()
    }, [])

    /* ---------------- 右键菜单 ---------------- */

    const [menu, setMenu] = useState<ContextMenuState | null>(null)

    // 无选中时把光标移到右键位置（方便直接粘贴）；有选区时原样保留。
    // 只读视图不移动光标，其选区只存在于原生 DOM selection（见 domSelectionRange）
    const openContextMenu = useCallback((event: React.MouseEvent) => {
        const v = viewRef.current
        if (!v) return
        event.preventDefault()
        const nativeRange = v.editable ? null : domSelectionRange(v)
        const hasSelection = !v.state.selection.empty || nativeRange !== null
        if (!hasSelection && v.editable) {
            const pos = v.posAtCoords({ left: event.clientX, top: event.clientY })
            if (pos) {
                v.dispatch(v.state.tr.setSelection(Selection.near(v.state.doc.resolve(pos.pos))))
            }
        }
        v.focus()
        setMenu({ x: event.clientX, y: event.clientY, hasSelection, readonly: !v.editable })
    }, [])

    const selectAll = useCallback(() => {
        const v = viewRef.current
        if (!v) return
        if (!v.editable) {
            // 只读视图：用原生选区全选，配合 domSelectionRange 完成「复制」
            const range = document.createRange()
            range.selectNodeContents(v.dom)
            const selection = window.getSelection()
            selection?.removeAllRanges()
            selection?.addRange(range)
            return
        }
        v.dispatch(v.state.tr.setSelection(new AllSelection(v.state.doc)))
        v.focus()
    }, [])

    // 右键菜单「粘贴」：与 Ctrl+V 同一套语义 —— markdown 源按 markdown 解析，
    // 富文本（网页等）按 HTML 解析；代码块内按纯文本插入
    const pasteFromClipboard = useCallback(async () => {
        const v = viewRef.current
        if (!v || !v.editable) return
        v.focus()
        let text = ''
        let html = ''
        try {
            ;[text, html] = await Promise.all([
                window.electronAPI.clipboard.readText(),
                window.electronAPI.clipboard.readHTML()
            ])
        } catch {
            return
        }
        let slice: Slice | null = null
        if (v.state.selection.$from.parent.type.spec.code) {
            if (text) v.dispatch(v.state.tr.insertText(text))
            return
        }
        if (html && !(text && looksLikeMarkdown(text))) slice = htmlToSlice(html)
        else if (text) slice = markdownToSlice(text)
        if (!slice) return
        v.dispatch(v.state.tr.replaceSelection(slice).scrollIntoView())
    }, [])

    const buildMenuItems = (
        menuState: ContextMenuState
    ): (ContextMenuItem | typeof MENU_SEPARATOR)[] => {
        const v = viewRef.current
        const current = v?.state
        const undoRedo: (ContextMenuItem | typeof MENU_SEPARATOR)[] = [
            {
                label: '撤销',
                hint: 'Ctrl+Z',
                disabled: !current || !undo(current),
                onSelect: () => dispatch(undo)
            },
            {
                label: '重做',
                hint: 'Ctrl+Y',
                disabled: !current || !redo(current),
                onSelect: () => dispatch(redo)
            }
        ]
        if (menuState.readonly) {
            return [
                {
                    label: '复制',
                    hint: 'Ctrl+C',
                    disabled: !menuState.hasSelection,
                    // 只读视图的选区在原生 DOM selection 上，手动映射成文档范围后序列化为 markdown
                    onSelect: () => {
                        const v = viewRef.current
                        if (!v) return
                        const range = domSelectionRange(v)
                        if (!range) return
                        const text = sliceToMarkdown(v.state.doc.slice(range.from, range.to))
                        void navigator.clipboard.writeText(text).catch(() => {})
                    }
                },
                { label: '全选', hint: 'Ctrl+A', onSelect: selectAll }
            ]
        }
        if (menuState.hasSelection) {
            return [
                { label: '剪切', hint: 'Ctrl+X', onSelect: () => document.execCommand('cut') },
                { label: '复制', hint: 'Ctrl+C', onSelect: () => document.execCommand('copy') },
                { label: '粘贴', hint: 'Ctrl+V', onSelect: () => void pasteFromClipboard() },
                MENU_SEPARATOR,
                { label: '加粗', hint: 'Ctrl+B', onSelect: () => dispatch(cmd.strong) },
                { label: '斜体', hint: 'Ctrl+I', onSelect: () => dispatch(cmd.em) },
                { label: '删除线', hint: 'Ctrl+Shift+X', onSelect: () => dispatch(cmd.strike) },
                { label: '行内代码', hint: 'Ctrl+E', onSelect: () => dispatch(cmd.code) },
                MENU_SEPARATOR,
                ...undoRedo
            ]
        }
        return [
            { label: '粘贴', hint: 'Ctrl+V', onSelect: () => void pasteFromClipboard() },
            { label: '全选', hint: 'Ctrl+A', onSelect: selectAll },
            MENU_SEPARATOR,
            ...undoRedo
        ]
    }

    const state = viewRef.current?.state

    return (
        <div className={cn('flex flex-col min-h-0 min-w-0', className)}>
            {showToolbar && state ? (
                <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-border px-2 text-xs text-muted-foreground">
                    <ToolbarButton
                        title="撤销"
                        disabled={!undo(state)}
                        onClick={() => dispatch(undo)}
                    >
                        <Undo2 size={15} />
                    </ToolbarButton>
                    <ToolbarButton
                        title="重做"
                        disabled={!redo(state)}
                        onClick={() => dispatch(redo)}
                    >
                        <Redo2 size={15} />
                    </ToolbarButton>
                    <Separator orientation="vertical" className="w-px mx-1 h-4" />

                    <ToolbarButton
                        title="标题 1"
                        active={isHeading(state, 1)}
                        onClick={() => dispatch(cmd.setHeading(1))}
                    >
                        H1
                    </ToolbarButton>
                    <ToolbarButton
                        title="标题 2"
                        active={isHeading(state, 2)}
                        onClick={() => dispatch(cmd.setHeading(2))}
                    >
                        H2
                    </ToolbarButton>
                    <ToolbarButton
                        title="标题 3"
                        active={isHeading(state, 3)}
                        onClick={() => dispatch(cmd.setHeading(3))}
                    >
                        H3
                    </ToolbarButton>
                    <Separator orientation="vertical" className="w-px mx-1 h-4" />

                    <ToolbarButton
                        title="加粗"
                        active={markActive(state, pmSchema.marks.strong)}
                        onClick={() => dispatch(cmd.strong)}
                    >
                        <Bold size={15} />
                    </ToolbarButton>
                    <ToolbarButton
                        title="斜体"
                        active={markActive(state, pmSchema.marks.em)}
                        onClick={() => dispatch(cmd.em)}
                    >
                        <Italic size={15} />
                    </ToolbarButton>
                    <ToolbarButton
                        title="删除线"
                        active={markActive(state, pmSchema.marks.strike)}
                        onClick={() => dispatch(cmd.strike)}
                    >
                        <Strikethrough size={15} />
                    </ToolbarButton>
                    <ToolbarButton
                        title="行内代码"
                        active={markActive(state, pmSchema.marks.code)}
                        onClick={() => dispatch(cmd.code)}
                    >
                        <Code size={15} />
                    </ToolbarButton>
                    <Separator orientation="vertical" className="w-px mx-1 h-4" />

                    <ToolbarButton
                        title="无序列表"
                        active={isList(state, 'bullet_list')}
                        onClick={() => dispatch(cmd.bulletList())}
                    >
                        <List size={15} />
                    </ToolbarButton>
                    <ToolbarButton
                        title="有序列表"
                        active={isList(state, 'ordered_list')}
                        onClick={() => dispatch(cmd.orderedList())}
                    >
                        <ListOrdered size={15} />
                    </ToolbarButton>
                    <ToolbarButton
                        title="任务列表"
                        active={isTaskItem(state)}
                        onClick={() => dispatch(cmd.taskList())}
                    >
                        <ListTodo size={15} />
                    </ToolbarButton>
                    <ToolbarButton
                        title="引用"
                        active={isBlock(state, pmSchema.nodes.blockquote)}
                        onClick={() => dispatch(cmd.blockquote())}
                    >
                        <Quote size={15} />
                    </ToolbarButton>
                    <ToolbarButton
                        title="代码块"
                        active={isBlock(state, pmSchema.nodes.code_block)}
                        onClick={() => dispatch(cmd.codeBlock())}
                    >
                        <Code2 size={15} />
                    </ToolbarButton>
                    <ToolbarButton
                        title="链接"
                        active={markActive(state, pmSchema.marks.link)}
                        onClick={() => promptLink(dispatch)}
                    >
                        <LinkIcon size={15} />
                    </ToolbarButton>
                </div>
            ) : null}

            <div
                ref={containerRef}
                data-placeholder={placeholder}
                data-empty={state ? !docHasText(state.doc) : undefined}
                onContextMenu={openContextMenu}
                className="flex-1 min-h-0 overflow-y-auto px-4 py-3 text-sm leading-relaxed outline-none"
            />
            {menu ? (
                <EditorContextMenu
                    menu={menu}
                    items={buildMenuItems(menu)}
                    onClose={() => setMenu(null)}
                />
            ) : null}
        </div>
    )
})

export default NoteEditor
