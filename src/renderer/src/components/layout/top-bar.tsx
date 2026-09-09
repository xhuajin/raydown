import { useEffect, useState } from 'react'
import {
    ArrowLeft,
    PlayingCardsFan,
    FileText,
    LayoutDashboard,
    Check,
    Pencil,
    Trash2,
    FolderPlus,
    StickyNote
} from 'lucide-react'

import { SidebarTrigger } from '@renderer/components/sidebar/sidebar-trigger'
import WindowControls from '@renderer/components/window-controls'
import { Tooltip, TooltipTrigger, TooltipContent } from '@renderer/components/ui/tooltip'

import { Kbd, KbdGroup } from '@renderer/components/ui/kbd'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@renderer/components/ui/dialog'
import {
    CommandDialog,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem,
    CommandSeparator,
    CommandShortcut
} from '@renderer/components/ui/command'
import { useMessage } from '@renderer/contexts/MessageContext'
import { KEYMAP, registerKeymapHandler } from '@renderer/store/keymap-store'
import { useNoteStore } from '@renderer/store/note-store'
import { DEFAULT_WORKSPACE_ID, type Workspace } from '@renderer/api/workspaces'
import { firstLineOfDoc } from '@renderer/components/editor/pm/doc'
import { cn } from '@renderer/lib/utils'

/** 工作区新增/重命名共用的弹窗（由父级条件渲染，打开即初始状态） */
function WorkspaceNameDialog({
    workspace,
    onClose
}: {
    /** 传入则为重命名 mode（初始 name 为当前名）；null 则为新增 */
    workspace: Workspace | null
    onClose: () => void
}) {
    const { pushMessage } = useMessage()
    const createWorkspace = useNoteStore((s) => s.createWorkspace)
    const renameWorkspace = useNoteStore((s) => s.renameWorkspace)
    const [name, setName] = useState(workspace?.name ?? '')
    const [open, setOpen] = useState(true)

    const isRename = workspace !== null

    const close = () => {
        setOpen(false)
        onClose()
    }

    const handleConfirm = async () => {
        const trimmed = name.trim()
        if (!trimmed) return
        if (isRename && workspace) {
            await renameWorkspace(workspace.id, trimmed)
            pushMessage('已重命名工作区', 'success')
        } else {
            await createWorkspace(trimmed)
            pushMessage('已创建工作区', 'success')
        }
        close()
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (!o) close()
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{isRename ? '重命名工作区' : '新建工作区'}</DialogTitle>
                    <DialogDescription>输入工作区名称</DialogDescription>
                </DialogHeader>
                <Input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleConfirm()
                    }}
                    placeholder="工作区名称"
                />
                <DialogFooter>
                    <Button variant="outline" onClick={close}>
                        取消
                    </Button>
                    <Button onClick={() => void handleConfirm()} disabled={!name.trim()}>
                        确定
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function LeftControls({
    setOpenCommand
}: {
    setOpenCommand: React.Dispatch<React.SetStateAction<boolean>>
}) {
    const page = useNoteStore((s) => s.page)
    const closeEditor = useNoteStore((s) => s.closeEditor)

    if (page === 'editor') {
        return (
            <div className="flex items-center gap-1 min-w-0">
                <Tooltip>
                    <TooltipTrigger
                        render={
                            <button
                                className="size-7 rounded-lg flex items-center justify-center transition-colors hover:bg-muted"
                                onClick={() => closeEditor()}
                            >
                                <ArrowLeft size={16} strokeWidth={1.7} />
                            </button>
                        }
                    />
                    <TooltipContent>
                        <p>Back</p>
                        <KbdGroup className="text-muted-foreground">
                            <Kbd>ESC</Kbd>+<Kbd>ESC</Kbd>
                        </KbdGroup>
                    </TooltipContent>
                </Tooltip>
                {/* 有 Bug，第二个 Tooltip 不显示，用一个空的 hidden 来占位 */}
                <Tooltip>
                    <TooltipTrigger className="hidden" />
                    <TooltipContent></TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger
                        render={
                            <button
                                className="size-7 rounded-lg flex items-center justify-center transition-colors hover:bg-muted"
                                onClick={() => setOpenCommand(true)}
                            >
                                <PlayingCardsFan size={16} strokeWidth={1.7} />
                            </button>
                        }
                    />
                    <TooltipContent>
                        <p>命令面板</p>
                        <KbdGroup>
                            <Kbd>Ctrl</Kbd>
                            <Kbd>{KEYMAP.commandPanel.replace('Ctrl+', '')}</Kbd>
                        </KbdGroup>
                    </TooltipContent>
                </Tooltip>
            </div>
        )
    } else {
        return (
            <div className="flex items-center gap-1 min-w-0">
                <SidebarTrigger size={16} strokeWidth={1.7} />
                {/* 有 Bug，第二个 Tooltip 不显示，用一个空的 hidden 来占位 */}
                <Tooltip>
                    <TooltipTrigger className="hidden" />
                    <TooltipContent></TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger
                        render={
                            <button
                                className="size-7 rounded-lg flex items-center justify-center transition-colors hover:bg-muted"
                                onClick={() => setOpenCommand(true)}
                            >
                                <PlayingCardsFan size={16} strokeWidth={1.7} />
                            </button>
                        }
                    />
                    <TooltipContent>
                        <p>命令面板</p>
                        <KbdGroup>
                            <Kbd>Ctrl</Kbd>
                            <Kbd>{KEYMAP.commandPanel.replace('Ctrl+', '')}</Kbd>
                        </KbdGroup>
                    </TooltipContent>
                </Tooltip>
                {/* <Tooltip>
                    <TooltipTrigger
                        render={
                            <button
                                variant="ghost"
                                className="size-7 rounded-lg flex items-center justify-center transition-colors hover:bg-muted"
                                onClick={() => openNewNote()}
                            >
                                <Plus size={16} strokeWidth={1.7} />
                            </button>
                        }
                    />
                    <TooltipContent>
                        <p>创建笔记</p>
                        <KbdGroup>
                            <Kbd>Ctrl</Kbd>
                            <Kbd>{KEYMAP.newNote.replace('Ctrl+', '')}</Kbd>
                        </KbdGroup>
                    </TooltipContent>
                </Tooltip> */}
            </div>
        )
    }
}

export function TopBar() {
    const page = useNoteStore((s) => s.page)
    const selectedNote = useNoteStore((s) => s.selectedNote)
    const notes = useNoteStore((s) => s.notes)
    const newNoteActive = useNoteStore((s) => s.newNoteActive)
    const openNewNote = useNoteStore((s) => s.openNewNote)
    const openEditorFor = useNoteStore((s) => s.openEditorFor)
    const workspaces = useNoteStore((s) => s.workspaces)
    const activeWorkspaceId = useNoteStore((s) => s.activeWorkspaceId)
    const setActiveWorkspace = useNoteStore((s) => s.setActiveWorkspace)
    const deleteWorkspace = useNoteStore((s) => s.deleteWorkspace)

    const [openCommand, setOpenCommand] = useState(false)
    // 工作区新增/重命名弹窗状态：workspace 为 null 表示新增
    const [nameDialog, setNameDialog] = useState<{
        open: boolean
        workspace: Workspace | null
    }>({ open: false, workspace: null })

    // 首页/编辑页都用 Ctrl+P 打开/关闭 command palette
    useEffect(() => {
        const unregister = registerKeymapHandler('commandPanel', () => {
            setOpenCommand((open) => !open)
            return true
        })
        return unregister
    }, [registerKeymapHandler])

    useEffect(() => {
        const unregister = registerKeymapHandler('newNote', () => {
            openNewNote()
            return true
        })
        return unregister
    }, [registerKeymapHandler, openNewNote])

    const inEditor = page === 'editor'
    const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null
    const activeWorkspaceIsDefault = activeWorkspaceId === DEFAULT_WORKSPACE_ID

    /** 切换到指定工作区（保留 command 弹层，便于继续操作） */
    const handleSwitch = (id: string) => {
        setActiveWorkspace(id)
        setOpenCommand(false)
    }

    /** 删除当前工作区；默认工作区本就无删除项 */
    const handleDeleteActive = async () => {
        if (!activeWorkspace || activeWorkspaceIsDefault) return
        if (
            !window.confirm(
                `确定删除工作区「${activeWorkspace.name}」？其下笔记将归入「全部笔记」。`
            )
        )
            return
        await deleteWorkspace(activeWorkspace.id)
        setOpenCommand(false)
    }

    /** 新建笔记并退出命令面板 */
    const handleNewNote = () => {
        setOpenCommand(false)
        openNewNote()
    }

    // 编辑页标题：默认取笔记首行，没有则显示空
    const editorTitle = selectedNote ? firstLineOfDoc(selectedNote.content) : ''

    const title = inEditor ? editorTitle || 'New Note' : 'Raydown'

    return (
        <>
            <div
                className={cn(
                    'bg-background flex w-full h-10 min-h-10 max-h-10 items-center justify-between gap-3.5 border-b border-border pl-2 pr-0 font-interface [-webkit-app-region:drag]'
                )}
            >
                <LeftControls setOpenCommand={setOpenCommand} />

                <span
                    className={cn(
                        'flex-1 min-w-0 text-center text-[13px] font-medium text-muted-foreground select-none truncate px-3 shimmer shimmer-duration-4000',
                        inEditor && newNoteActive && 'text-foreground'
                    )}
                >
                    {title}
                </span>

                <div className="flex items-center h-full">
                    <WindowControls />
                </div>
            </div>

            {/* 编辑页：note list command palette —— 展示并切换笔记 */}
            {/* 首页：工作区命令面板 —— 切换/新增工作区 + 当前工作区操作 */}
            {inEditor ? (
                <CommandDialog open={openCommand} onOpenChange={setOpenCommand}>
                    <CommandInput placeholder="搜索命令" />
                    <CommandList>
                        <CommandEmpty>无匹配的命令</CommandEmpty>
                        {notes.length > 0 && (
                            <CommandGroup heading="All Notes">
                                {notes.map((note) => (
                                    <CommandItem
                                        key={note.id}
                                        // value={textOf(note.content)}
                                        onSelect={() => {
                                            openEditorFor(note.id)
                                            setOpenCommand(false)
                                        }}
                                    >
                                        <FileText className="size-4 shrink-0 mr-1" />
                                        <span>{firstLineOfDoc(note.content) || 'Untitled'}</span>
                                        {selectedNote?.id === note.id && (
                                            <CommandShortcut className="font-sans tracking-normal text-muted-foreground!">
                                                current
                                            </CommandShortcut>
                                        )}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                    </CommandList>
                </CommandDialog>
            ) : (
                <CommandDialog open={openCommand} onOpenChange={setOpenCommand}>
                    <CommandInput placeholder="搜索命令" />
                    <CommandList>
                        <CommandEmpty>无匹配的选项</CommandEmpty>

                        <CommandGroup heading="工作区">
                            {workspaces.map((ws) => {
                                const active = ws.id === activeWorkspaceId
                                return (
                                    <CommandItem
                                        key={ws.id}
                                        value={ws.name}
                                        onSelect={() => handleSwitch(ws.id)}
                                    >
                                        <LayoutDashboard className="size-4 shrink-0 mr-1" />
                                        <span className="flex-1 truncate">{ws.name}</span>
                                        {active && <Check className="ml-auto size-4 shrink-0" />}
                                    </CommandItem>
                                )
                            })}
                            <CommandItem
                                onSelect={() => setNameDialog({ open: true, workspace: null })}
                            >
                                <FolderPlus className="size-4 shrink-0 mr-1" />
                                新建工作区
                            </CommandItem>
                        </CommandGroup>

                        <CommandSeparator />

                        <CommandGroup heading="当前工作区">
                            <CommandItem
                                onSelect={() =>
                                    setNameDialog({ open: true, workspace: activeWorkspace })
                                }
                            >
                                <Pencil className="size-4 shrink-0 mr-1" />
                                重命名当前工作区
                            </CommandItem>
                            {!activeWorkspaceIsDefault && (
                                <CommandItem onSelect={() => void handleDeleteActive()}>
                                    <Trash2 className="size-4 shrink-0 mr-1" />
                                    删除当前工作区
                                </CommandItem>
                            )}
                            <CommandItem onSelect={handleNewNote}>
                                <StickyNote className="size-4 shrink-0 mr-1" />
                                新建笔记
                            </CommandItem>
                        </CommandGroup>
                    </CommandList>
                </CommandDialog>
            )}

            {/* 工作区新增/重命名弹窗：仅 open 时挂载 */}
            {nameDialog.open && (
                <WorkspaceNameDialog
                    key={nameDialog.workspace?.id ?? 'new-workspace'}
                    workspace={nameDialog.workspace}
                    onClose={() => setNameDialog({ open: false, workspace: null })}
                />
            )}
        </>
    )
}
