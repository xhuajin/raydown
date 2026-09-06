import { Node } from 'prosemirror-model'
import { pmSchema } from './schema'

/** 便签的存储形式：ProseMirror 文档 JSON */
export type JSONDoc = { type: 'doc'; content: unknown[] }

/** 空的便签文档（一个空段落） */
export function emptyDocJson(): JSONDoc {
    return { type: 'doc', content: [{ type: 'paragraph', content: [] }] }
}

export function jsonToDoc(json: unknown): Node {
    return Node.fromJSON(pmSchema, json)
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
