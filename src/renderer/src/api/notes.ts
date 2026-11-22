import dayjs from 'dayjs'

/**
 * 笔记数据结构。标题为独立字段（不取自正文）；content 为 markdown 源文本。
 * 正文持久化在主进程 userData/notes/<标题>.md 文件（文件名由标题派生），
 * 元数据（含标题）存 SQLite notes_meta 表，渲染层经 IPC 访问。
 */
export interface Note {
    id: string
    title: string
    content: string
    mtime: string
    ctime: string
    /** 最近一次编辑时的光标文档位置（0 表示文档开头） */
    cursor: number
    /** 所属工作区 id；空/NULL 表示默认工作区 */
    workspace_id: string | null
}

/** 查询全部笔记，按修改时间倒序（最新在前） */
export async function listNotes(): Promise<Note[]> {
    return window.electronAPI.notes.list()
}

export interface NoteSource {
    DESKTOP: 'desktop'
}

export const NoteSource: NoteSource = { DESKTOP: 'desktop' }

export async function createNote(
    title: string,
    content: string,
    cursor = 0,
    workspaceId: string | null = null
): Promise<Note> {
    const now = dayjs().toISOString()
    const note: Note = {
        id: createNoteId(),
        title: title.trim() || 'Untitled',
        content,
        mtime: now,
        ctime: now,
        cursor,
        workspace_id: workspaceId
    }
    await window.electronAPI.notes.create(note)
    return note
}

export async function updateNote(
    id: string,
    { title, content, cursor }: { title: string; content: string; cursor: number }
): Promise<{ newNote: Note }> {
    const mtime = dayjs().toISOString()
    const newNote = await window.electronAPI.notes.update(id, {
        title: title.trim() || 'Untitled',
        content,
        mtime,
        cursor
    })
    return { newNote }
}

export async function deleteNote(id: string): Promise<void> {
    await window.electronAPI.notes.remove(id)
}

/** 把便签移入指定工作区（workspaceId 为 null 表示默认工作区） */
export async function moveNoteToWorkspace(id: string, workspaceId: string | null): Promise<Note> {
    return window.electronAPI.notes.moveWorkspace(id, workspaceId)
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
