import Database from 'better-sqlite3'

/**
 * 便签的行数据结构（与渲染层 api/notes.ts 的 Note 一致）。
 * content 为 ProseMirror 文档 JSON 的字符串形式（JSON.stringify(JSONDoc)）。
 */
export interface NoteRow {
    id: string
    content: string
    mtime: string
    ctime: string
    cursor: number
}

/**
 * 创建便签入参：id 由渲染层 createNoteId() 生成，主进程只负责 INSERT。
 */
export type CreateNoteInput = NoteRow

/** 更新便签入参：content、新的 mtime 与光标位置（渲染层已生成 mtime） */
export interface UpdateNoteInput {
    content: string
    mtime: string
    cursor: number
}

let db: Database.Database | null = null

/** 打开/初始化 SQLite 数据库。需在 app.whenReady() 之后调用。 */
export function openDatabase(dbPath: string): void {
    if (db) return
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.exec(`
        CREATE TABLE IF NOT EXISTS notes (
            id      TEXT PRIMARY KEY,
            content TEXT NOT NULL,
            mtime   TEXT NOT NULL,
            ctime   TEXT NOT NULL,
            cursor  INTEGER NOT NULL DEFAULT 0
        );
    `)
    // 兼容旧库：若已有 notes 表缺少 cursor 列则补上（不改变既有数据）
    const cols = db.prepare('PRAGMA table_info(notes)').all() as { name: string }[]
    if (!cols.some((c) => c.name === 'cursor')) {
        db.exec('ALTER TABLE notes ADD COLUMN cursor INTEGER NOT NULL DEFAULT 0')
    }
}

/** 优雅关闭数据库。在 app 退出（will-quit）时调用。 */
export function closeDatabase(): void {
    if (db) {
        db.close()
        db = null
    }
}

function requireDb(): Database.Database {
    if (!db) throw new Error('Database not initialized')
    return db
}

/** 查询全部便签，按修改时间倒序（最新在前） */
export function listNotesRows(): NoteRow[] {
    const rows = requireDb()
        .prepare('SELECT id, content, mtime, ctime, cursor FROM notes ORDER BY mtime DESC')
        .all() as NoteRow[]
    return rows
}

/** 新建便签 */
export function insertNote(input: CreateNoteInput): NoteRow {
    const stmt = requireDb().prepare(
        'INSERT INTO notes (id, content, mtime, ctime, cursor) VALUES (@id, @content, @mtime, @ctime, @cursor)'
    )
    stmt.run(input)
    return input
}

/** 更新便签 content、mtime 与 cursor；记录不存在则抛出与旧实现一致的错误 */
export function updateNoteRow(id: string, input: UpdateNoteInput): NoteRow {
    const result = requireDb()
        .prepare(
            'UPDATE notes SET content = @content, mtime = @mtime, cursor = @cursor WHERE id = @id'
        )
        .run({ id, content: input.content, mtime: input.mtime, cursor: input.cursor })
    if (result.changes === 0) throw new Error('Note not found')
    const row = requireDb()
        .prepare('SELECT id, content, mtime, ctime, cursor FROM notes WHERE id = ?')
        .get(id) as NoteRow
    return row
}

/** 删除便签 */
export function deleteNoteRow(id: string): boolean {
    const result = requireDb().prepare('DELETE FROM notes WHERE id = ?').run(id)
    return result.changes > 0
}
