import { useCallback } from 'react'
import { FileText } from 'lucide-react'

import { useNoteStore } from '@renderer/store/note-store'
import { firstLineOfDoc } from '@renderer/components/editor/pm/doc'
import { groupNotes } from '@renderer/api/notes'

/** 工作区分组标签：原 shadcn SidebarGroupLabel 的样式复刻 */
function NoteGroupLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-hidden [&>svg]:size-4 [&>svg]:shrink-0">
            {children}
        </div>
    )
}

/**
 * 笔记列表内容：挂在 motion-panels 的左侧 Panel 里（App.tsx）。
 * 列表项样式复刻自原 shadcn SidebarMenuButton（default variant + h-8），
 * 选中态通过 data-active 属性命中 data-active: 前缀类。
 */
export function SidebarNoteList() {
    const notes = useNoteStore((s) => s.notes)
    const selectedId = useNoteStore((s) => s.selectedId)
    const selectNote = useNoteStore((s) => s.selectNote)
    const openEditorFor = useNoteStore((s) => s.openEditorFor)
    const setActionMenuOpen = useNoteStore((s) => s.setActionMenuOpen)

    const groups = groupNotes(notes)

    const handleSelect = useCallback(
        (id: string) => {
            selectNote(id)
        },
        [selectNote]
    )

    const handleOpen = useCallback(
        (id: string) => {
            openEditorFor(id)
        },
        [openEditorFor]
    )

    // 右键列表项：先选中，再打开 bottom bar 的 action panel
    const handleContextMenu = useCallback(
        (id: string) => {
            selectNote(id)
            setActionMenuOpen(true)
        },
        [selectNote, setActionMenuOpen]
    )

    return (
        <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-0 overflow-auto">
            {groups.map((group) => (
                <div key={group.key}>
                    <NoteGroupLabel>{group.label}</NoteGroupLabel>
                    <div className="w-full text-sm">
                        <ul className="flex w-full min-w-0 flex-col gap-0.5">
                            {group.Notes.map((note) => (
                                <li key={note.id} className="relative px-1.5">
                                    <button
                                        type="button"
                                        data-active={selectedId === note.id || undefined}
                                        onClick={() => handleSelect(note.id)}
                                        onDoubleClick={() => handleOpen(note.id)}
                                        onContextMenu={(e) => {
                                            e.preventDefault()
                                            handleContextMenu(note.id)
                                        }}
                                        className="flex h-8 w-full items-center gap-2 overflow-hidden rounded-md p-2 pr-2 text-left text-sm outline-hidden transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring active:bg-sidebar-accent active:text-sidebar-accent-foreground data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground [&_svg]:shrink-0 [&>span:last-child]:truncate"
                                    >
                                        <FileText className="size-3.5!" />
                                        <span className="truncate select-none">
                                            {firstLineOfDoc(note.content)}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            ))}
        </div>
    )
}
