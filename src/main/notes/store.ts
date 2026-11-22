/**
 * 笔记服务层：notes_meta 元数据表 + notes/ 目录 markdown 文件的组合操作。
 * IPC handlers 只与本模块对话，不直接触碰 db/files。
 * 标题为独立字段：文件名由标题派生（sanitize + 去重），与正文内容解耦。
 */
import {
    getNoteMetaRow,
    insertNoteMetaRow,
    listNoteFilenames,
    listNoteMetaRows,
    deleteNoteMetaRow,
    updateNoteMetaRow,
    type NoteMetaRow
} from '../db'
import {
    dedupeFilename,
    deleteNoteFile,
    readNoteFile,
    renameNoteFile,
    sanitizeFilename,
    writeNoteFile
} from './files'

/** 返回给渲染层的笔记行（与 preload NoteApi 一致；content 为 markdown 源文本） */
export interface NoteRow {
    id: string
    title: string
    content: string
    mtime: string
    ctime: string
    cursor: number
    workspace_id: string | null
}

/** 渲染层创建笔记入参（id/时间由渲染层生成；title 为空时主进程兜底 Untitled） */
export interface CreateNoteInput {
    id: string
    title: string
    content: string
    mtime: string
    ctime: string
    cursor: number
    workspace_id?: string | null
}

/** 查询全部笔记：读元数据 + 逐个读文件内容。文件缺失兜底为空字符串，不白屏 */
export function listNotes(): NoteRow[] {
    return listNoteMetaRows().map((meta) => toNoteRow(meta, readNoteFile(meta.filename) ?? ''))
}

export function createNote(input: CreateNoteInput): NoteRow {
    const title = input.title.trim() || 'Untitled'
    const filename = allocateFilename(title)
    writeNoteFile(filename, input.content)
    const meta = insertNoteMetaRow({
        id: input.id,
        title,
        filename,
        mtime: input.mtime,
        ctime: input.ctime,
        cursor: input.cursor ?? 0,
        workspace_id: input.workspace_id ?? null,
        legacy_id: null
    })
    return toNoteRow(meta, input.content)
}

/**
 * 更新笔记：写文件（原子写）；标题变化时自动按新标题改名（重名加后缀）。
 */
export function updateNote(
    id: string,
    input: { title: string; content: string; mtime: string; cursor: number }
): NoteRow {
    const meta = getNoteMetaRow(id)
    if (!meta) throw new Error('Note not found')
    const title = input.title.trim() || 'Untitled'
    const filename = allocateFilename(title, meta)
    if (filename !== meta.filename) renameNoteFile(meta.filename, filename)
    writeNoteFile(filename, input.content)
    const next = updateNoteMetaRow(id, {
        title,
        filename,
        mtime: input.mtime,
        cursor: input.cursor
    })
    return toNoteRow(next, input.content)
}

export function deleteNote(id: string): boolean {
    const meta = getNoteMetaRow(id)
    if (!meta) return false
    deleteNoteFile(meta.filename)
    return deleteNoteMetaRow(id)
}

/** 把便签移入指定工作区（workspaceId 为 null 表示默认工作区） */
export function moveNoteToWorkspace(id: string, workspaceId: string | null): NoteRow {
    const next = updateNoteMetaRow(id, { workspace_id: workspaceId ?? null })
    return toNoteRow(next, readNoteFile(next.filename) ?? '')
}

/**
 * 由独立标题字段推导唯一文件名（含 .md）。
 * taken 取自全部元数据行（大小写不敏感比较）；self 传入时排除自身当前文件名，
 * 标题未变时返回原名（不触发改名）。迁移模块也用它分配文件名。
 */
export function allocateFilename(title: string, self?: NoteMetaRow): string {
    const taken = new Set(listNoteFilenames().map((f) => f.toLowerCase()))
    if (self) taken.delete(self.filename.toLowerCase())
    const base = sanitizeFilename(title.trim() || 'Untitled')
    return dedupeFilename(base, taken) + '.md'
}

function toNoteRow(meta: NoteMetaRow, content: string): NoteRow {
    return {
        id: meta.id,
        title: meta.title,
        content,
        mtime: meta.mtime,
        ctime: meta.ctime,
        cursor: meta.cursor,
        workspace_id: meta.workspace_id ?? null
    }
}
