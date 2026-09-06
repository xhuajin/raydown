import { useCallback } from 'react'
import { FileText } from 'lucide-react'

import {
    Sidebar,
    SidebarContent,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem
} from '@renderer/components/ui/sidebar'
import { useNoteStore } from '@renderer/store/note-store'
import { firstLineOfDoc } from '@renderer/components/editor/pm/doc'
import { groupNotes } from '@renderer/api/notes'

export function SidebarContainer() {
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
        <Sidebar className="font-interface [-webkit-app-region:drag]">
            <SidebarContent>
                {groups.map((group) => (
                    <div key={group.key}>
                        <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu className="gap-0.5">
                                {group.Notes.map((note) => (
                                    <SidebarMenuItem key={note.id} className="px-1.5">
                                        <SidebarMenuButton
                                            isActive={selectedId === note.id}
                                            onClick={() => handleSelect(note.id)}
                                            onDoubleClick={() => handleOpen(note.id)}
                                            onContextMenu={(e) => {
                                                e.preventDefault()
                                                handleContextMenu(note.id)
                                            }}
                                            className="gap-2 pr-2 flex items-center"
                                        >
                                            <FileText className="size-3.5! shrink-0" />
                                            <span className="truncate select-none">
                                                {firstLineOfDoc(note.content)}
                                            </span>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </div>
                ))}
            </SidebarContent>
        </Sidebar>
    )
}
