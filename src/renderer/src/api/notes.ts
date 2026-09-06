import dayjs from 'dayjs'
import type { JSONDoc } from '@renderer/components/editor/pm/doc'

/**
 * 便签数据结构。
 * content 为 ProseMirror 文档 JSON（doc → toJSON）。
 * 存储于主进程 SQLite（userData/raydown.db），渲染层经 IPC 访问。
 */
export interface Note {
    id: string
    content: JSONDoc
    mtime: string
    ctime: string
    /** 最近一次编辑时的光标文档位置（0 表示文档开头） */
    cursor: number
}

/** IPC 传输用的扁平结构：content 为 JSON 字符串 */
interface NoteWire {
    id: string
    content: string
    mtime: string
    ctime: string
    cursor: number
}

function toWire(note: Note): NoteWire {
    return { ...note, content: JSON.stringify(note.content), cursor: note.cursor ?? 0 }
}

function toNote(wire: NoteWire): Note {
    return { ...wire, content: JSON.parse(wire.content), cursor: wire.cursor ?? 0 }
}

/** 查询全部便签，按修改时间倒序（最新在前） */
export async function listNotes(): Promise<Note[]> {
    const wires = await window.electronAPI.notes.list()
    return wires.map(toNote)
}

export interface NoteSource {
    DESKTOP: 'desktop'
}

export const NoteSource: NoteSource = { DESKTOP: 'desktop' }

export async function createNote(content: JSONDoc, cursor = 0): Promise<Note> {
    const now = dayjs().toISOString()
    const note: Note = {
        id: createNoteId(),
        content,
        mtime: now,
        ctime: now,
        cursor
    }
    await window.electronAPI.notes.create(toWire(note))
    return note
}

export async function updateNote(
    id: string,
    { content, cursor }: { content: JSONDoc; cursor: number }
): Promise<{ newNote: Note }> {
    const mtime = dayjs().toISOString()
    const wire = await window.electronAPI.notes.update(id, {
        content: JSON.stringify(content),
        mtime,
        cursor
    })
    const newNote: Note = toNote(wire)
    return { newNote }
}

export async function deleteNote(id: string): Promise<void> {
    await window.electronAPI.notes.remove(id)
}

export function createNoteId(): string {
    return crypto.randomUUID()
}

/* ---------------- 分组 ---------------- */

export type TimeGroupKey = 'today' | 'week' | 'month' | 'older'

const GROUP_LABELS: Record<TimeGroupKey, string> = {
    today: 'Today',
    week: 'This Week',
    month: 'This Month',
    older: 'Older'
}

/**
 * 按修改时间分组：Today / This Week / This Month / Older（周一作为一周开始）
 */
export function groupNotes(notes: Note[]): {
    key: TimeGroupKey
    label: string
    Notes: Note[]
}[] {
    const now = dayjs()
    const startOfWeek = now.startOf('week').add(1, 'day') // 周一
    const startOfMonth = now.startOf('month')

    const groups: Record<TimeGroupKey, Note[]> = {
        today: [],
        week: [],
        month: [],
        older: []
    }

    for (const note of notes) {
        const d = dayjs(note.mtime)
        if (d.isSame(now, 'day')) {
            groups.today.push(note)
        } else if (d.isAfter(startOfWeek)) {
            groups.week.push(note)
        } else if (d.isAfter(startOfMonth)) {
            groups.month.push(note)
        } else {
            groups.older.push(note)
        }
    }

    return (['today', 'week', 'month', 'older'] as TimeGroupKey[])
        .map((key) => ({ key, label: GROUP_LABELS[key], Notes: groups[key] }))
        .filter((group) => group.Notes.length > 0)
}
