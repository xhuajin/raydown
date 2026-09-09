import { getSchema, type JSONContent } from '@tiptap/core'
import { Node } from 'prosemirror-model'
import { buildExtensions } from '../extensions'

/**
 * 笔记的存储形式：Tiptap/ProseMirror 文档 JSON。
 * 迁移到 Tiptap 后节点采用其 camelCase 命名（paragraph / bulletList / orderedList /
 * listItem / taskList / taskItem / codeBlock / hardBreak / mathInline / mathBlock）。
 */
export type JSONDoc = { type: 'doc'; content: JSONContent[] }

// schema 与应用级编辑器共用 buildExtensions，保证解析与编辑一致。
// 此处缓存在模块内（getSchema 每次调用会重建，成本略高；调用频率不高，可省去）。
const tiptapSchema = getSchema(buildExtensions())

/** 空的笔记文档（一个空段落） */
export function emptyDocJson(): JSONDoc {
    return { type: 'doc', content: [{ type: 'paragraph', content: [] }] }
}

/**
 * JSON → ProseMirror/Tiptap 文档节点。解析失败（脏数据等）回落空文档，绝不抛错白屏。
 */
export function jsonToDoc(json: unknown): Node {
    try {
        return Node.fromJSON(tiptapSchema, json as never)
    } catch {
        return Node.fromJSON(tiptapSchema, emptyDocJson())
    }
}

export function docToJson(doc: Node): JSONDoc {
    return doc.toJSON() as JSONDoc
}

/** 是否空文档（无段落内容或没有任何文本）——用于保存按钮禁用判断 */
export function isEmptyDoc(doc: JSONDoc | null | undefined): boolean {
    if (!doc || !Array.isArray(doc.content) || doc.content.length === 0) return true
    return textOf(doc).trim().length === 0
}

/** 全文纯文本（块间以 \n 分隔、标记内以空格连接）——预览/命令面板/搜索 */
export function textOf(json: unknown): string {
    try {
        const doc = jsonToDoc(json)
        // to 用文档内容长度（不能用 1e9 / Infinity：prosemirror-model 会越界抛错）
        return doc.textBetween(0, doc.content.size, '\n', ' ') ?? ''
    } catch {
        return ''
    }
}

/** 首行纯文本（驱动标题） */
export function firstLineOfDoc(json: unknown): string {
    return textOf(json).trim().split('\n')[0] ?? ''
}
