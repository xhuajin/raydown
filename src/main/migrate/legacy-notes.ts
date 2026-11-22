/**
 * 笔记数据迁移（user_version 门控，逐版本递增）。
 *
 * v1：旧 JSON 笔记 → markdown 文件。编辑器换成 CodeMirror 6 后，内容持久化改为
 * userData/notes/ 下的 markdown 文件（元数据在 notes_meta 表）。本模块把旧 notes 表
 * （Tiptap JSON）的每行转换为 .md 文件并登记元数据；旧表本身原封不动保留作备份。
 *
 * v2：独立标题字段。标题不再取自正文首行，迁移把每条笔记的首行提取为 notes_meta 的
 * title 字段并从内容文件中移除该行（含其标题标记），剩余部分作为正文。
 *
 * 幂等性：user_version 门控 + legacy_id 去重。中途崩溃后重启不会产生重复笔记——
 * 已迁移过的行跳过，若对应文件意外缺失还会用旧内容补写（自愈）。
 */
import { randomUUID } from 'crypto'
import {
    getNoteMetaByLegacyId,
    getUserVersion,
    insertNoteMetaRow,
    listLegacyNoteRows,
    listNoteMetaRows,
    setUserVersion,
    updateNoteMetaRow
} from '../db'
import { noteFileExists, readNoteFile, titleFromMarkdown, writeNoteFile } from '../notes/files'
import { allocateFilename } from '../notes/store'
import { jsonDocToMarkdown } from './jsondoc-to-markdown'

/** 打开数据库、确保笔记目录之后调用（app ready 阶段） */
export function migrateLegacyNotes(): void {
    migrateV1JsonToMarkdownFiles()
    migrateV2ExtractTitles()
}

/** v1：旧 JSON 笔记 → markdown 文件（仅历史数据源，处理完即被 v2 提取标题） */
function migrateV1JsonToMarkdownFiles(): void {
    if (getUserVersion() >= 1) return

    for (const row of listLegacyNoteRows()) {
        const existing = getNoteMetaByLegacyId(row.id)
        if (existing) {
            // 自愈：元数据已登记但文件缺失（上次迁移中断），用旧内容补写
            if (!noteFileExists(existing.filename)) {
                writeNoteFile(existing.filename, jsonDocToMarkdown(row.content))
            }
            continue
        }
        const markdown = jsonDocToMarkdown(row.content)
        const filename = allocateFilename(markdown)
        writeNoteFile(filename, markdown)
        // 光标不迁移：旧值为 ProseMirror 位移，与 CodeMirror 位移语义不同，归零重计
        insertNoteMetaRow({
            id: randomUUID(),
            title: '',
            filename,
            mtime: row.mtime,
            ctime: row.ctime,
            cursor: 0,
            workspace_id: row.workspace_id ?? null,
            legacy_id: row.id
        })
    }

    setUserVersion(1)
}

/**
 * 从内容中提取首行为标题：标题取首个非空行（剥离标题标记等），
 * 内容移除该行及其前导空行。首行为代码围栏时视为内容、不提取（标题留空）。
 */
function extractTitleFromContent(content: string): { title: string; content: string } {
    const lines = content.split(/\r?\n/)
    let idx = 0
    while (idx < lines.length && !lines[idx].trim()) idx++
    if (idx >= lines.length) return { title: '', content }
    if (/^\s*`{3,}/.test(lines[idx])) return { title: '', content } // 首行是代码围栏：不提取
    const title = titleFromMarkdown(lines[idx])
    const rest = lines.slice(idx + 1)
    while (rest.length && !rest[0].trim()) rest.shift()
    return { title, content: rest.join('\n') }
}

/** v2：独立标题字段——提取每条笔记首行为 title 并从内容文件移除该行 */
function migrateV2ExtractTitles(): void {
    if (getUserVersion() >= 2) return

    for (const row of listNoteMetaRows()) {
        const content = readNoteFile(row.filename)
        if (content == null) continue
        const { title, content: newContent } = extractTitleFromContent(content)
        if (newContent !== content) writeNoteFile(row.filename, newContent)
        if (title !== row.title) updateNoteMetaRow(row.id, { title })
    }

    setUserVersion(2)
}
