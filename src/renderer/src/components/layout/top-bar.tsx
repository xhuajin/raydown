import { useEffect, useState } from 'react'
import { ArrowLeft, Plus, PlayingCardsFan, FileText } from 'lucide-react'

import { SidebarTrigger } from '@renderer/components/sidebar/sidebar-trigger'
import WindowControls from '@renderer/components/window-controls'
import { Tooltip, TooltipTrigger, TooltipContent } from '@renderer/components/ui/tooltip'
import { Kbd, KbdGroup } from '@renderer/components/ui/kbd'
import {
    CommandDialog,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem
} from '@renderer/components/ui/command'
import { KEYMAP, registerKeymapHandler } from '@renderer/store/keymap-store'
import { useNoteStore } from '@renderer/store/note-store'
import { firstLineOfDoc, textOf } from '@renderer/components/editor/pm/doc'
import { cn } from '@renderer/lib/utils'

export function TopBar() {
    const page = useNoteStore((s) => s.page)
    const selectedNote = useNoteStore((s) => s.selectedNote)
    const notes = useNoteStore((s) => s.notes)
    const newNoteActive = useNoteStore((s) => s.newNoteActive)
    const openNewNote = useNoteStore((s) => s.openNewNote)
    const openEditorFor = useNoteStore((s) => s.openEditorFor)
    const closeEditor = useNoteStore((s) => s.closeEditor)

    const [openCommand, setOpenCommand] = useState(false)

    useEffect(() => {
        const unregister = registerKeymapHandler('newNote', () => {
            openNewNote()
            return true
        })
        return unregister
    }, [openNewNote])

    const inEditor = page === 'editor'

    // —— 编辑页：Ctrl+P 打开 / 关闭 Note List command palette ——
    useEffect(() => {
        const unregister = registerKeymapHandler('noteList', () => {
            if (!inEditor) return false
            setOpenCommand((open) => !open)
            return true
        })
        return unregister
    }, [inEditor])

    // 编辑页标题：默认取便签首行，没有则显示空
    const editorTitle = selectedNote ? firstLineOfDoc(selectedNote.content) : ''

    const left = inEditor ? (
        <>
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
                    <p>返回列表</p>
                </TooltipContent>
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
                    <p>Note List</p>
                    <KbdGroup>
                        <Kbd className="text-[10px]">Ctrl</Kbd>
                        <Kbd className="text-[10px]">{KEYMAP.noteList.replace('Ctrl+', '')}</Kbd>
                    </KbdGroup>
                </TooltipContent>
            </Tooltip>
        </>
    ) : (
        <>
            <SidebarTrigger size={16} strokeWidth={1.7} />
            <Tooltip>
                <TooltipTrigger
                    render={
                        <button
                            className="size-7 rounded-lg flex items-center justify-center transition-colors hover:bg-muted"
                            onClick={() => openNewNote()}
                        >
                            <Plus size={16} strokeWidth={1.7} />
                        </button>
                    }
                />
                <TooltipContent>
                    <p>New Note</p>
                    <KbdGroup>
                        <Kbd className="min-w-4 h-4.5 text-[10px] bg-transparent border border-border text-muted-foreground! tracking-normal">
                            Ctrl
                        </Kbd>
                        <Kbd className="min-w-4 h-4.5 text-[10px] bg-transparent border border-border text-muted-foreground! tracking-normal">
                            {KEYMAP.newNote.replace('Ctrl+', '')}
                        </Kbd>
                    </KbdGroup>
                </TooltipContent>
            </Tooltip>
        </>
    )

    const title = inEditor ? editorTitle || 'New Note' : 'Raydown'

    return (
        <>
            <div
                className={cn(
                    'bg-background flex w-full h-10 min-h-10 max-h-10 items-center justify-between gap-3.5 border-b border-border pl-2 pr-0 font-interface [-webkit-app-region:drag]'
                )}
            >
                <div className="flex items-center gap-1 min-w-0">{left}</div>

                <span
                    className={cn(
                        'flex-1 min-w-0 text-center text-[13px] font-medium text-muted-foreground select-none truncate px-3',
                        inEditor && newNoteActive && 'text-foreground'
                    )}
                >
                    {title}
                </span>

                <div className="flex items-center h-full">
                    <WindowControls />
                </div>
            </div>

            {/* 编辑页：note list command palette —— 展示并切换便签 */}
            {inEditor && (
                <CommandDialog open={openCommand} onOpenChange={setOpenCommand}>
                    <CommandInput placeholder="搜索便签…" />
                    <CommandList>
                        <CommandEmpty>无匹配的便签</CommandEmpty>
                        {notes.length > 0 && (
                            <CommandGroup heading="All Notes">
                                {notes.map((note) => (
                                    <CommandItem
                                        key={note.id}
                                        value={textOf(note.content)}
                                        onSelect={() => {
                                            openEditorFor(note.id)
                                            setOpenCommand(false)
                                        }}
                                    >
                                        <FileText className="size-4 shrink-0 mr-1" />
                                        <span>{firstLineOfDoc(note.content) || 'Untitled'}</span>
                                        {selectedNote?.id === note.id && (
                                            <span className="ml-auto text-xs text-muted-foreground">
                                                current
                                            </span>
                                        )}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                    </CommandList>
                </CommandDialog>
            )}
        </>
    )
}
