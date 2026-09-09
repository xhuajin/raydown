import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Kbd, KbdGroup } from '@renderer/components/ui/kbd'
import { Separator } from '@renderer/components/ui/separator'
import { useMessage } from '@renderer/contexts/MessageContext'
import { MessageIndicator } from './message-indicator'
import { useNoteStore } from '@renderer/store/note-store'
import { textOf } from '@renderer/components/editor/pm/doc'
import { cn } from '@renderer/lib/utils'
import { KEYMAP, registerKeymapHandler } from '@renderer/store/keymap-store'
import { DEFAULT_WORKSPACE_ID } from '@renderer/api/workspaces'

import { ModeToggle } from '../mode-toggle'
import { PenIcon, CopyIcon, Trash2Icon, FolderInput, Check } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuShortcut,
    DropdownMenuSeparator,
    DropdownMenuLabel,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent
} from '../ui/dropdown-menu'

/** ↵ 提示键 */
function kbdEnter() {
    return (
        <Kbd className="min-w-4 w-4.5 h-4.5 text-[10px] bg-transparent border border-border text-muted-foreground">
            ↵
        </Kbd>
    )
}

function kbdKey(label: string) {
    return (
        <Kbd className="min-w-4 w-4.5 h-4.5 text-[10px] bg-transparent border border-border text-muted-foreground">
            {label}
        </Kbd>
    )
}

function kbdModifier(label: string) {
    return (
        <Kbd className="min-w-4 h-4.5 text-[10px] bg-transparent border border-border text-muted-foreground tracking-normal">
            {label}
        </Kbd>
    )
}

export function BottomBar() {
    const { activeMessage, pushMessage } = useMessage()
    const page = useNoteStore((s) => s.page)
    const selectedId = useNoteStore((s) => s.selectedId)
    const selectedNote = useNoteStore((s) => s.selectedNote)
    const openSelectedNote = useNoteStore((s) => s.openSelectedNote)
    const remove = useNoteStore((s) => s.remove)
    const actionMenuOpen = useNoteStore((s) => s.actionMenuOpen)
    const setActionMenuOpen = useNoteStore((s) => s.setActionMenuOpen)
    const toggleToolbar = useNoteStore((s) => s.toggleToolbar)
    const workspaces = useNoteStore((s) => s.workspaces)
    const moveSelectedToWorkspace = useNoteStore((s) => s.moveSelectedToWorkspace)
    // 删除二次确认：第一次激活 Delete 项时武装，第二次（Enter 或点击）才真正删除
    const [deleteArmed, setDeleteArmed] = useState(false)

    /** 当前选中便签归属的工作区 id（空/NULL 归默认） */
    const noteWorkspaceId = selectedNote?.workspace_id ?? DEFAULT_WORKSPACE_ID

    /** 把当前选中便签移入指定工作区 */
    const handleMoveToWorkspace = async (workspaceId: string) => {
        if (!selectedId) return
        await moveSelectedToWorkspace(workspaceId)
        const target = workspaces.find((w) => w.id === workspaceId)
        pushMessage(
            workspaceId === DEFAULT_WORKSPACE_ID
                ? '已移至「全部便签」'
                : `已移至「${target?.name ?? '工作区'}」`,
            'success'
        )
        setActionMenuOpen(false)
    }

    const inEditor = page === 'editor'

    // —— 编辑页操作：Ctrl+T 切换编辑器工具栏 ——
    useEffect(() => {
        const unregister = registerKeymapHandler('toggleToolbar', () => {
            if (!inEditor) return false
            toggleToolbar()
            return true
        })
        return unregister
    }, [inEditor, toggleToolbar, registerKeymapHandler])

    // —— 列表页操作：Ctrl+K 打开 / 关闭右侧 ActionPanel ——
    useEffect(() => {
        const unregister = registerKeymapHandler('actionsMenu', () => {
            if (inEditor) return false
            setActionMenuOpen(!useNoteStore.getState().actionMenuOpen)
            return true
        })
        return unregister
    }, [inEditor, setActionMenuOpen, registerKeymapHandler])

    // —— 列表页全局快捷键：复制 / 分享占位 / 删除 ——
    useEffect(() => {
        if (inEditor) return

        const copyNote = () => {
            if (!selectedNote) return false
            void navigator.clipboard.writeText(textOf(selectedNote.content))
            pushMessage('已复制笔记内容', 'success')
            return true
        }

        const shareNote = () => {
            pushMessage('分享功能开发中', 'info')
            return true
        }

        const deleteNote = () => {
            if (!selectedId) return false
            const note = selectedNote
            if (
                !window.confirm(
                    `确定删除笔记「${note ? textOf(note.content).slice(0, 20) : '未命名'}」？`
                )
            ) {
                return true
            }
            void remove(selectedId)
            pushMessage('已删除笔记', 'success')
            return true
        }

        const unrefCopy = registerKeymapHandler('copyNote', copyNote)
        const unrefShare = registerKeymapHandler('shareNote', shareNote)
        const unrefDelete = registerKeymapHandler('deleteNote', deleteNote)
        return () => {
            unrefCopy()
            unrefShare()
            unrefDelete()
        }
    }, [inEditor, selectedNote, selectedId, remove, pushMessage, registerKeymapHandler])

    // —— 列表页内删除 / 编辑：把菜单项动作走通 ——
    const handleEdit = () => openSelectedNote()
    const handleCopy = () => {
        if (!selectedNote) return
        void navigator.clipboard.writeText(textOf(selectedNote.content))
        pushMessage('已复制笔记内容', 'success')
    }
    const handleDelete = () => {
        if (!selectedId) return
        void remove(selectedId)
        pushMessage('已删除笔记', 'success')
    }

    /** Delete 菜单项激活：第一次进入确认态，第二次确认删除 */
    const handleDeleteActivate = () => {
        if (!selectedId) return
        if (!deleteArmed) {
            setDeleteArmed(true)
            return
        }
        setDeleteArmed(false)
        handleDelete()
        setActionMenuOpen(false)
    }

    return (
        <div
            className={cn(
                'bg-background relative flex min-w-0 w-full h-10 min-h-10 max-h-10 justify-between items-center pr-2 border-t border-border text-xs [-webkit-app-region:drag]'
            )}
        >
            <div className="relative h-full w-full flex items-center min-w-0 z-10">
                {activeMessage ? <MessageIndicator /> : <ModeToggle />}
            </div>

            {!inEditor && (
                <div className="flex min-w-fit items-center select-none">
                    <button
                        className="flex items-center justify-center h-7 px-2 rounded-lg transition-all duration-300 hover:bg-muted gap-2 leading-3"
                        onClick={() => openSelectedNote()}
                        disabled={!selectedId}
                    >
                        Open Note
                        {kbdEnter()}
                    </button>
                    <Separator
                        orientation="vertical"
                        className="h-3.5 w-0.5 my-auto mx-2 bg-border rounded-full"
                    />
                    <DropdownMenu
                        open={actionMenuOpen}
                        onOpenChange={(open) => {
                            setActionMenuOpen(open)
                            if (!open) setDeleteArmed(false)
                        }}
                    >
                        <DropdownMenuTrigger
                            render={
                                <button className="flex items-center justify-center h-7 px-2 rounded-lg transition-all duration-300 hover:bg-muted gap-2 leading-3">
                                    Actions
                                    <KbdGroup>
                                        {kbdModifier('Ctrl')}
                                        {kbdModifier(KEYMAP.actionsMenu.replace('Ctrl+', ''))}
                                    </KbdGroup>
                                </button>
                            }
                        />
                        <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuGroup>
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem className="text-[13px]" onClick={handleEdit}>
                                    <PenIcon size={14} />
                                    <span>Edit</span>
                                    <DropdownMenuShortcut>{kbdEnter()}</DropdownMenuShortcut>
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-[13px]" onClick={handleCopy}>
                                    <CopyIcon size={14} />
                                    <span>Copy</span>
                                    <DropdownMenuShortcut>
                                        <KbdGroup>
                                            {kbdModifier('Ctrl')}
                                            {kbdKey('C')}
                                        </KbdGroup>
                                    </DropdownMenuShortcut>
                                </DropdownMenuItem>
                                {/* <DropdownMenuItem className="text-[13px]" onClick={handleShare}>
                                    <ImageIcon size={14} />
                                    <span>Share</span>
                                    <DropdownMenuShortcut>
                                        <KbdGroup>
                                            {kbdModifier('Ctrl')}
                                            {kbdKey('S')}
                                        </KbdGroup>
                                    </DropdownMenuShortcut>
                                </DropdownMenuItem> */}
                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger className="text-[13px]">
                                        <FolderInput size={14} />
                                        <span>切换工作区</span>
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent className="w-auto min-w-36">
                                        {workspaces.map((ws) => {
                                            const current = noteWorkspaceId === ws.id
                                            return (
                                                <DropdownMenuItem
                                                    key={ws.id}
                                                    className="text-[13px]"
                                                    onClick={() =>
                                                        void handleMoveToWorkspace(ws.id)
                                                    }
                                                >
                                                    <span className="flex-1 truncate">
                                                        {ws.name}
                                                    </span>
                                                    {current && <Check size={14} />}
                                                </DropdownMenuItem>
                                            )
                                        })}
                                    </DropdownMenuSubContent>
                                </DropdownMenuSub>
                            </DropdownMenuGroup>

                            <DropdownMenuSeparator />
                            <DropdownMenuGroup>
                                <DropdownMenuItem
                                    className="text-[13px]"
                                    variant="destructive"
                                    onClick={handleDeleteActivate}
                                    closeOnClick={false}
                                    disabled={!selectedId}
                                >
                                    <Trash2Icon size={14} />
                                    <span>Delete</span>
                                    <DropdownMenuShortcut>
                                        {kbdModifier('Del')}
                                    </DropdownMenuShortcut>
                                    <AnimatePresence>
                                        {deleteArmed && (
                                            <motion.div
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0, y: '100%' }}
                                                transition={{ duration: 0.15, ease: 'easeOut' }}
                                                className="absolute inset-0 z-10 flex items-center gap-1.5 rounded-md bg-destructive px-1.5 text-[13px] text-white"
                                            >
                                                <Trash2Icon size={14} />
                                                <span>确认删除？</span>
                                                <span className="ml-auto text-[10px] opacity-80">
                                                    再次 Enter
                                                </span>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </DropdownMenuItem>
                            </DropdownMenuGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            )}
            {inEditor && (
                <div className="flex min-w-fit items-center select-none">
                    <button
                        className="flex items-center justify-center h-7 px-2 rounded-lg transition-all duration-300 hover:bg-muted gap-2 leading-3"
                        onClick={toggleToolbar}
                    >
                        Toolbar
                        <KbdGroup>
                            {kbdModifier('Ctrl')}
                            {kbdKey(KEYMAP.toggleToolbar.replace('Ctrl+', ''))}
                        </KbdGroup>
                    </button>
                </div>
            )}
        </div>
    )
}
