/**
 * markdown 笔记文件存储（userData/notes/）。
 *
 * 内容持久化从 SQLite 迁移到磁盘文件：一个笔记 = 一个 <标题>.md 文件。
 * 文件名由正文首个非空行推导（见 titleFromMarkdown），经 Windows 非法字符净化，
 * 重名自动追加 " (2)"、" (3)" 后缀。所有 IO 都在主进程，渲染层不直接接触文件系统。
 */
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

/** 笔记目录句柄（openDatabase 成功后由 initNotesDir 注入） */
let notesDir: string | null = null

/** 初始化并确保笔记目录存在（app ready 之后、任何文件操作之前调用） */
export function initNotesDir(dir: string): void {
    mkdirSync(dir, { recursive: true })
    notesDir = dir
}

function requireNotesDir(): string {
    if (!notesDir) throw new Error('Notes dir not initialized')
    return notesDir
}

/** 防路径穿越：文件名必须是单层合法名称 */
function assertSafeFilename(filename: string): void {
    if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
        throw new Error(`Illegal note filename: ${filename}`)
    }
}

/* ---------------- 文件名推导 ---------------- */

// eslint-disable-next-line no-control-regex -- 文件名本就要剥离控制字符
const ILLEGAL_CHARS = /[\\/:*?"<>|\x00-\x1f]/g
// Windows 保留名（不区分大小写，含带扩展名形式）
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i
const MAX_NAME_LENGTH = 100
// 空/不可用标题的兜底名（与编辑器内的 Untitled 默认标题一致）
const FALLBACK_NAME = 'Untitled'

/**
 * 从 markdown 文本提取标题文本：首个非空行，剥离标题/引用/列表/任务前缀与常见行内标记符。
 * 迁移提取首行 + 文件名兜底共用。
 */
export function titleFromMarkdown(markdown: string): string {
    for (const raw of markdown.split(/\r?\n/)) {
        const line = raw.trim()
        if (!line) continue
        const stripped = line
            .replace(/^#{1,6}\s+/, '')
            .replace(/^>\s?/, '')
            .replace(/^([-*+]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s+)?/, '')
            .replace(/\*\*|__|~~|==|`/g, '')
            .trim()
        return stripped || FALLBACK_NAME
    }
    return FALLBACK_NAME
}

/** 净化为合法的 Windows/macOS/Linux 通用文件名（不含扩展名） */
export function sanitizeFilename(title: string): string {
    let name = String(title ?? '')
        .replace(ILLEGAL_CHARS, ' ')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/g, '')
    if (name.length > MAX_NAME_LENGTH) {
        name = name.slice(0, MAX_NAME_LENGTH).replace(/[. ]+$/g, '')
    }
    if (!name) name = FALLBACK_NAME
    if (RESERVED_NAMES.test(name)) name = 'note-' + name
    return name
}

/**
 * 去重：base 已被占用时追加 " (2)"、" (3)"…
 * taken 里的名字应统一 toLowerCase（Windows 文件名大小写不敏感）
 */
export function dedupeFilename(base: string, taken: Set<string>): string {
    const key = base.toLowerCase()
    if (!taken.has(key)) return base
    for (let i = 2; i < 10000; i++) {
        const candidate = `${base} (${i})`
        if (!taken.has(candidate.toLowerCase())) return candidate
    }
    return `${base} (${randomUUID().slice(0, 8)})`
}

/* ---------------- 文件 IO ---------------- */

function notePath(filename: string): string {
    assertSafeFilename(filename)
    return join(requireNotesDir(), filename)
}

/** 读取笔记内容；文件不存在返回 null（由调用方兜底为空字符串，不白屏） */
export function readNoteFile(filename: string): string | null {
    const path = notePath(filename)
    if (!existsSync(path)) return null
    try {
        return readFileSync(path, 'utf-8')
    } catch {
        return null
    }
}

export function noteFileExists(filename: string): boolean {
    return existsSync(notePath(filename))
}

/**
 * 原子写入：先写临时文件再改名覆盖，避免中断留下半截内容。
 * Windows 上 rename 不能覆盖已存在文件，故先移除目标。
 */
export function writeNoteFile(filename: string, content: string): void {
    const path = notePath(filename)
    const tmpPath = path + '.tmp-' + randomUUID().slice(0, 8)
    writeFileSync(tmpPath, content, 'utf-8')
    try {
        if (existsSync(path)) rmSync(path, { force: true })
        renameSync(tmpPath, path)
    } catch (error) {
        try {
            rmSync(tmpPath, { force: true })
        } catch {
            /* 清理失败忽略 */
        }
        throw error
    }
}

export function renameNoteFile(oldName: string, newName: string): void {
    if (oldName === newName) return
    renameSync(notePath(oldName), notePath(newName))
}

/** 删除笔记文件；文件已不存在视为成功（幂等） */
export function deleteNoteFile(filename: string): void {
    const path = notePath(filename)
    if (existsSync(path)) rmSync(path, { force: true })
}
