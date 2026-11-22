import Database from 'better-sqlite3'

/**
 * 旧编辑器（Tiptap JSON）的行结构。
 * 编辑器换成 CodeMirror 6 后内容持久化已迁移到 markdown 文件（见 notes/files.ts），
 * 本表仅作为一次性迁移的数据源与历史备份保留，除迁移外应用不再读写。
 */
export interface LegacyNoteRow {
    id: string
    content: string
    mtime: string
    ctime: string
    cursor: number
    workspace_id?: string | null
}

/**
 * markdown 笔记元数据行。笔记正文存 userData/notes/<filename> 文件，
 * 本表只存元数据（稳定 uuid、标题、文件名、时间、光标、工作区归属）。
 * 标题为独立字段（不再取自正文首行）；legacy_id 记录迁移来源的旧 JSON 笔记 id，
 * 用于保证迁移幂等。
 */
export interface NoteMetaRow {
    id: string
    title: string
    filename: string
    mtime: string
    ctime: string
    cursor: number
    workspace_id?: string | null
    legacy_id?: string | null
}

/** 创建笔记元数据入参：id 为渲染层 createNoteId() 生成，主进程只负责 INSERT */
export type CreateNoteMetaInput = NoteMetaRow

/** 更新笔记元数据入参：仅更新给出的字段 */
export interface UpdateNoteMetaInput {
    title?: string
    filename?: string
    mtime?: string
    cursor?: number
    workspace_id?: string | null
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

    // markdown 笔记的元数据表（正文在文件系统；legacy_id 支撑迁移幂等）
    db.exec(`
        CREATE TABLE IF NOT EXISTS notes_meta (
            id           TEXT PRIMARY KEY,
            title        TEXT NOT NULL DEFAULT '',
            filename     TEXT NOT NULL UNIQUE,
            mtime        TEXT NOT NULL,
            ctime        TEXT NOT NULL,
            cursor       INTEGER NOT NULL DEFAULT 0,
            workspace_id TEXT,
            legacy_id    TEXT
        );
    `)
    // 兼容旧库：独立标题列（v2 迁移填充，见 migrate/legacy-notes.ts）
    const metaCols = db.prepare('PRAGMA table_info(notes_meta)').all() as { name: string }[]
    if (!metaCols.some((c) => c.name === 'title')) {
        db.exec("ALTER TABLE notes_meta ADD COLUMN title TEXT NOT NULL DEFAULT ''")
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

/* ---------------- user_version（迁移门控） ---------------- */

export function getUserVersion(): number {
    return requireDb().pragma('user_version', { simple: true }) as number
}

export function setUserVersion(version: number): void {
    requireDb().pragma(`user_version = ${version}`)
}

/* ---------------- 旧 JSON 笔记（迁移数据源，只读） ---------------- */

/** 查询全部旧 JSON 笔记行（仅一次性迁移使用） */
export function listLegacyNoteRows(): LegacyNoteRow[] {
    return requireDb()
        .prepare(
            'SELECT id, content, mtime, ctime, cursor, workspace_id FROM notes ORDER BY mtime DESC'
        )
        .all() as LegacyNoteRow[]
}

/* ---------------- notes_meta 元数据 CRUD ---------------- */

/** 查询全部笔记元数据，按修改时间倒序（最新在前） */
export function listNoteMetaRows(): NoteMetaRow[] {
    return requireDb()
        .prepare(
            'SELECT id, title, filename, mtime, ctime, cursor, workspace_id, legacy_id FROM notes_meta ORDER BY mtime DESC'
        )
        .all() as NoteMetaRow[]
}

export function getNoteMetaRow(id: string): NoteMetaRow | undefined {
    return requireDb()
        .prepare(
            'SELECT id, title, filename, mtime, ctime, cursor, workspace_id, legacy_id FROM notes_meta WHERE id = ?'
        )
        .get(id) as NoteMetaRow | undefined
}

/** 迁移幂等检查：某条旧 JSON 笔记是否已迁移过 */
export function getNoteMetaByLegacyId(legacyId: string): NoteMetaRow | undefined {
    return requireDb()
        .prepare(
            'SELECT id, title, filename, mtime, ctime, cursor, workspace_id, legacy_id FROM notes_meta WHERE legacy_id = ?'
        )
        .get(legacyId) as NoteMetaRow | undefined
}

/** 查询全部已占用的文件名（去重比较用） */
export function listNoteFilenames(): string[] {
    return (
        requireDb().prepare('SELECT filename FROM notes_meta').all() as { filename: string }[]
    ).map((row) => row.filename)
}

export function insertNoteMetaRow(input: CreateNoteMetaInput): NoteMetaRow {
    requireDb()
        .prepare(
            'INSERT INTO notes_meta (id, title, filename, mtime, ctime, cursor, workspace_id, legacy_id) VALUES (@id, @title, @filename, @mtime, @ctime, @cursor, @workspace_id, @legacy_id)'
        )
        .run({
            ...input,
            title: input.title ?? '',
            workspace_id: input.workspace_id ?? null,
            legacy_id: input.legacy_id ?? null
        })
    return input
}

export function updateNoteMetaRow(id: string, input: UpdateNoteMetaInput): NoteMetaRow {
    const current = getNoteMetaRow(id)
    if (!current) throw new Error('Note not found')
    const next: NoteMetaRow = {
        ...current,
        title: input.title ?? current.title,
        filename: input.filename ?? current.filename,
        mtime: input.mtime ?? current.mtime,
        cursor: input.cursor ?? current.cursor,
        workspace_id: input.workspace_id !== undefined ? input.workspace_id : current.workspace_id
    }
    requireDb()
        .prepare(
            'UPDATE notes_meta SET title = @title, filename = @filename, mtime = @mtime, cursor = @cursor, workspace_id = @workspace_id WHERE id = @id'
        )
        .run({ ...next, workspace_id: next.workspace_id ?? null, title: next.title ?? '' })
    return next
}

/** 删除笔记元数据 */
export function deleteNoteMetaRow(id: string): boolean {
    const result = requireDb().prepare('DELETE FROM notes_meta WHERE id = ?').run(id)
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
        requireDb()
            .prepare('UPDATE notes_meta SET workspace_id = NULL WHERE workspace_id = ?')
            .run(id)
        return requireDb().prepare('DELETE FROM workspaces WHERE id = ?').run(id).changes > 0
    })
    return tx()
}
