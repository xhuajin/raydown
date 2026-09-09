import { useCallback, useEffect, useMemo, useRef } from 'react'
import dayjs from 'dayjs'

import { SidebarProvider } from '@renderer/components/ui/sidebar'
import { MessageProvider, useMessage } from '@renderer/contexts/MessageContext'
import { TopBar } from '@renderer/components/layout/top-bar'
import { BottomBar } from '@renderer/components/layout/bottom-bar'
import { SidebarContainer } from '@renderer/components/sidebar/sidebar'
import NoteEditor from '@renderer/components/editor/note-editor'
import useTheme from '@renderer/hooks/use-theme'

import { useNoteStore } from '@renderer/store/note-store'
import { dispatchKeymapEvent, registerKeymapHandler } from '@renderer/store/keymap-store'
import { TooltipProvider } from './components/ui/tooltip'
import { Kbd } from './components/ui/kbd'

/** Page1 右侧只读预览：用 ProseMirror 渲染选中笔记的内容与元信息 */
function PreviewPane() {
    const selectedNote = useNoteStore((s) => s.selectedNote)
    const notes = useNoteStore((s) => s.notes)

    if (notes.length === 0) {
        return (
            <div className="bg-background h-full flex items-center justify-center text-sm text-muted-foreground select-none">
                当前工作区没有笔记，<Kbd className="mr-1">Ctrl+N</Kbd> 新建
            </div>
        )
    }

    if (!selectedNote) {
        return (
            <div className="bg-background h-full flex items-center justify-center text-sm text-muted-foreground select-none">
                选择左侧笔记查看预览
            </div>
        )
    }

    return (
        <div className="bg-background h-full flex flex-col min-h-0">
            <NoteEditor
                key={selectedNote.id}
                defaultValue={selectedNote.content}
                className="flex-1 min-h-0"
                readonly
                showToolbar={false}
            />
            <div className="border-t border-border p-3 text-[11px] text-muted-foreground space-y-1 select-none">
                <div className="flex justify-between gap-4">
                    <span>Modified</span>
                    <span>{dayjs(selectedNote.mtime).format('YYYY年M月D日 HH:mm:ss')}</span>
                </div>
                <div className="flex justify-between gap-4">
                    <span>Created</span>
                    <span>{dayjs(selectedNote.ctime).format('YYYY年M月D日 HH:mm:ss')}</span>
                </div>
            </div>
        </div>
    )
}

/** Page2 编辑页：新建或编辑当前选中的笔记 */
function NoteEditorPage() {
    const selectedNote = useNoteStore((s) => s.selectedNote)
    const draft = useNoteStore((s) => s.draft)
    const setDraft = useNoteStore((s) => s.setDraft)
    const setCursor = useNoteStore((s) => s.setCursor)
    const toolbarVisible = useNoteStore((s) => s.toolbarVisible)

    return (
        <NoteEditor
            key={selectedNote?.id ?? 'new-note'}
            defaultValue={draft}
            // 打开笔记时 store 已按该笔记保存的光标初始化；此处只读取一次作为初始焦点
            initialCursor={useNoteStore.getState().cursor}
            onCursorChange={setCursor}
            className="h-full bg-background text-sm"
            showToolbar={toolbarVisible}
            readonly={false}
            placeholder=""
            onChange={(d) => setDraft(d)}
        />
    )
}

/** 自动保存失败提示：把 store 里的 saveError 转成用户可见的 toast */
function SaveErrorToast() {
    const saveError = useNoteStore((s) => s.saveError)
    const clearSaveError = useNoteStore((s) => s.clearSaveError)
    const { pushMessage } = useMessage()

    useEffect(() => {
        if (saveError) {
            pushMessage(saveError, 'error')
            clearSaveError()
        }
    }, [saveError, pushMessage, clearSaveError])

    return null
}

function AppShell() {
    useTheme()

    const page = useNoteStore((s) => s.page)
    const notes = useNoteStore((s) => s.notes)
    const selectedId = useNoteStore((s) => s.selectedId)
    const selectNote = useNoteStore((s) => s.selectNote)
    const actionMenuOpen = useNoteStore((s) => s.actionMenuOpen)
    const openSelectedNote = useNoteStore((s) => s.openSelectedNote)
    const closeEditor = useNoteStore((s) => s.closeEditor)
    const refetch = useNoteStore((s) => s.refetch)
    const loadWorkspaces = useNoteStore((s) => s.loadWorkspaces)
    const inEditor = page === 'editor'

    // 编辑页双击 Esc：先记录首次按键时间，窗口内再次按下则返回列表
    const lastEscapeRef = useRef(0)

    const orderedIds = useMemo(() => notes.map((n) => n.id), [notes])

    useEffect(() => {
        // 先加载工作区（含默认行），再拉取笔记列表（按激活工作区过滤）
        void loadWorkspaces().then(() => refetch())
    }, [loadWorkspaces, refetch])

    const moveSelection = useCallback(
        (dir: -1 | 1) => {
            if (orderedIds.length === 0) return false
            const currentIndex = selectedId != null ? orderedIds.indexOf(selectedId) : -1
            const nextIndex =
                currentIndex === -1
                    ? 0
                    : Math.min(orderedIds.length - 1, Math.max(0, currentIndex + dir))
            if (nextIndex === currentIndex && currentIndex !== -1) return false
            selectNote(orderedIds[nextIndex])
            return true
        },
        [orderedIds, selectedId, selectNote]
    )

    useEffect(() => {
        // action panel 打开时方向键交给 dropdown 自身的菜单导航，不再移动列表选中项；
        // 面板关闭时方向键一律由列表认领（即使已到边界不移动也返回 true），否则事件会落到
        // 关闭后仍持有焦点的 Actions 触发按钮上，被 base-ui 当作“展开菜单”重新打开面板
        const unregisterUp = registerKeymapHandler('moveNoteUp', () => {
            if (inEditor || actionMenuOpen) return false
            moveSelection(-1)
            return true
        })
        const unregisterDown = registerKeymapHandler('moveNoteDown', () => {
            if (inEditor || actionMenuOpen) return false
            moveSelection(1)
            return true
        })
        const unregisterOpen = registerKeymapHandler('openNote', () => {
            // 仅在列表页生效：Enter 进入编辑；编辑页 Enter 保留给编辑器换行；
            // action panel 打开时 Enter 保留给菜单项激活
            if (!inEditor && !actionMenuOpen && selectedId) {
                openSelectedNote()
                return true
            }
            return false
        })
        return () => {
            unregisterUp()
            unregisterDown()
            unregisterOpen()
        }
    }, [
        moveSelection,
        selectedId,
        openSelectedNote,
        inEditor,
        actionMenuOpen,
        registerKeymapHandler
    ])

    // 编辑页双击 Esc 返回列表（closeEditor 会先落盘），中间间隔须足够短
    useEffect(() => {
        if (!inEditor) return
        const DOUBLE_ESC_MS = 400
        const unregisterEscape = registerKeymapHandler('escape', () => {
            const now = Date.now()
            if (now - lastEscapeRef.current < DOUBLE_ESC_MS) {
                lastEscapeRef.current = 0
                closeEditor()
                return true
            }
            lastEscapeRef.current = now
            return false
        })
        return () => {
            unregisterEscape()
            lastEscapeRef.current = 0
        }
    }, [inEditor, closeEditor, registerKeymapHandler])

    // 全局键盘：keymap 在捕获阶段分发，必须先于 ProseMirror / base-ui 等组件拿到按键——
    // - 编辑页里 ProseMirror 会对 Escape preventDefault，若等冒泡到 window 再分发，
    //   按键已被 defaultPrevented 挡掉，双击 Esc 退出编辑页会失效；
    // - action panel 关闭后焦点回到 Actions 触发按钮，base-ui 会在按钮上拦截方向键
    //   重新打开菜单。认领的按键（handler 返回 true）会 preventDefault + stopPropagation，
    //   不再下发给组件；未认领的按键照常流向 ProseMirror / dropdown / cmdk。
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            dispatchKeymapEvent(e)
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
    }, [window, dispatchKeymapEvent])

    return (
        <TooltipProvider>
            <MessageProvider>
                <SidebarProvider>
                    <div className="flex h-screen w-full flex-col overflow-hidden">
                        <TopBar />
                        <div className="flex flex-1 min-h-0 min-w-0">
                            {!inEditor && <SidebarContainer />}
                            <div className="flex-1 min-w-0 min-h-0">
                                {inEditor ? <NoteEditorPage /> : <PreviewPane />}
                            </div>
                        </div>
                        <BottomBar />
                        <SaveErrorToast />
                    </div>
                </SidebarProvider>
            </MessageProvider>
        </TooltipProvider>
    )
}

export default function App() {
    return <AppShell />
}
