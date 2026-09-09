import Database from 'better-sqlite3'

/**
 * 笔记的行数据结构（与渲染层 api/notes.ts 的 Note 一致）。
 * content 为 ProseMirror 文档 JSON 的字符串形式（JSON.stringify(JSONDoc)）。
 * workspace_id 为空/NULL 表示归入默认工作区（见 DEFAULT_WORKSPACE_ID）。
 */
export interface NoteRow {
    id: string
    content: string
    mtime: string
    ctime: string
    cursor: number
    workspace_id?: string | null
}

/**
 * 创建笔记入参：id 为渲染层 createNoteId() 生成，主进程只负责 INSERT。
 */
export type CreateNoteInput = NoteRow

/** 更新笔记入参：content、新的 mtime 与光标位置（渲染层已生成 mtime） */
export interface UpdateNoteInput {
    content: string
    mtime: string
    cursor: number
}

/** 工作区默认行的固定 id（空 workspace_id 的笔记归入它；可改名但不可删除） */
export const DEFAULT_WORKSPACE_ID = 'default'

/** 工作区行结构：无展示顺序字段，排序由渲染层按便签修改时间计算 */
export interface WorkspaceRow {
    id: string
    name: string
}

/** 创建工作区入参：id 由渲染层生成，主进程只负责 INSERT */
export type CreateWorkspaceInput = WorkspaceRow

let db: Database.Database | null = null

/** 打开/初始化 SQLite 数据库。需在 app.whenReady() 之后调用。 */
export function openDatabase(dbPath: string): void {
    if (db) return
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.exec(`
        CREATE TABLE IF NOT EXISTS notes (
            id            TEXT PRIMARY KEY,
            content       TEXT NOT NULL,
            mtime         TEXT NOT NULL,
            ctime         TEXT NOT NULL,
            cursor        INTEGER NOT NULL DEFAULT 0,
            workspace_id  TEXT
        );
    `)
    // 兼容旧库：若已有 notes 表缺少 cursor 列则补上（不改变既有数据）
    const cols = db.prepare('PRAGMA table_info(notes)').all() as { name: string }[]
    if (!cols.some((c) => c.name === 'cursor')) {
        db.exec('ALTER TABLE notes ADD COLUMN cursor INTEGER NOT NULL DEFAULT 0')
    }
    // 兼容旧库：若已有 notes 表缺少 workspace_id 列则补上（空/NULL 归默认工作区）
    if (!cols.some((c) => c.name === 'workspace_id')) {
        db.exec('ALTER TABLE notes ADD COLUMN workspace_id TEXT')
    }

    // 工作区表 + 播种默认工作区：保证 listWorkspaces() 恒有「全部笔记」行
    // 注意：排序不再由 sort 列决定，改由渲染层按便签修改时间计算（默认始终置顶）。
    // 因此这里不再定义 sort 列；旧库若已有该列也无妨，各查询不再引用它。
    db.exec(`
        CREATE TABLE IF NOT EXISTS workspaces (
            id    TEXT PRIMARY KEY,
            name  TEXT NOT NULL
        );
    `)
    db.prepare('INSERT OR IGNORE INTO workspaces (id, name) VALUES (?, ?)').run(
        DEFAULT_WORKSPACE_ID,
        '全部笔记'
    )
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

/** 查询全部笔记，按修改时间倒序（最新在前） */
export function listNotesRows(): NoteRow[] {
    const rows = requireDb()
        .prepare(
            'SELECT id, content, mtime, ctime, cursor, workspace_id FROM notes ORDER BY mtime DESC'
        )
        .all() as NoteRow[]
    return rows
}

/** 新建笔记 */
export function insertNote(input: CreateNoteInput): NoteRow {
    const stmt = requireDb().prepare(
        'INSERT INTO notes (id, content, mtime, ctime, cursor, workspace_id) VALUES (@id, @content, @mtime, @ctime, @cursor, @workspace_id)'
    )
    stmt.run({ ...input, workspace_id: input.workspace_id ?? null })
    return input
}

/** 更新笔记 content、mtime 与 cursor；记录不存在则抛出与旧实现一致的错误 */
export function updateNoteRow(id: string, input: UpdateNoteInput): NoteRow {
    // 编辑内容不改变工作区归属（workspace_id 只在创建/删除工作区时设定）
    const result = requireDb()
        .prepare(
            'UPDATE notes SET content = @content, mtime = @mtime, cursor = @cursor WHERE id = @id'
        )
        .run({ id, content: input.content, mtime: input.mtime, cursor: input.cursor })
    if (result.changes === 0) throw new Error('Note not found')
    const row = requireDb()
        .prepare('SELECT id, content, mtime, ctime, cursor, workspace_id FROM notes WHERE id = ?')
        .get(id) as NoteRow
    return row
}

/** 删除笔记 */
export function deleteNoteRow(id: string): boolean {
    const result = requireDb().prepare('DELETE FROM notes WHERE id = ?').run(id)
    return result.changes > 0
}

/* ---------------- 工作区（workspaces）CRUD ---------------- */

/** 查询全部工作区（按 rowid 即创建顺序兜底；最终顺序由渲染层按便签修改时间计算） */
export function listWorkspaceRows(): WorkspaceRow[] {
    const rows = requireDb()
        .prepare('SELECT id, name FROM workspaces ORDER BY rowid ASC')
        .all() as WorkspaceRow[]
    return rows
}

/** 新建工作区 */
export function insertWorkspace(input: CreateWorkspaceInput): WorkspaceRow {
    const stmt = requireDb().prepare('INSERT INTO workspaces (id, name) VALUES (@id, @name)')
    stmt.run(input)
    return input
}

/** 重命名工作区 */
export function renameWorkspaceRow(id: string, name: string): WorkspaceRow {
    const result = requireDb().prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(name, id)
    if (result.changes === 0) throw new Error('Workspace not found')
    const row = requireDb()
        .prepare('SELECT id, name FROM workspaces WHERE id = ?')
        .get(id) as WorkspaceRow
    return row
}

/**
 * 删除工作区 + 其下所有笔记移到默认工作区。
 * 默认工作区（DEFAULT_WORKSPACE_ID）不可删除。
 */
export function deleteWorkspaceRow(id: string): boolean {
    if (id === DEFAULT_WORKSPACE_ID) return false
    const tx = requireDb().transaction(() => {
        requireDb().prepare('UPDATE notes SET workspace_id = NULL WHERE workspace_id = ?').run(id)
        return requireDb().prepare('DELETE FROM workspaces WHERE id = ?').run(id).changes > 0
    })
    return tx()
}

/** 把指定笔记移入某工作区（workspace_id 为空/NULL 表示归入默认工作区） */
export function moveNoteToWorkspace(id: string, workspaceId: string | null): NoteRow {
    const result = requireDb()
        .prepare('UPDATE notes SET workspace_id = ? WHERE id = ?')
        .run(workspaceId ?? null, id)
    if (result.changes === 0) throw new Error('Note not found')
    const row = requireDb()
        .prepare('SELECT id, content, mtime, ctime, cursor, workspace_id FROM notes WHERE id = ?')
        .get(id) as NoteRow
    return row
}
