/**
 * 一次性迁移用的 JSONDoc → markdown 转换器。
 *
 * 输入是旧编辑器（Tiptap/ProseMirror）持久化的文档 JSON 字符串（旧 notes.content 列），
 * 输出等价的 markdown 源文本，交给新编辑器（CodeMirror 6）继续编辑。
 * 纯函数、无 DOM 依赖；未知节点/标记一律降级为纯文本，绝不抛错丢内容。
 */

/** 旧文档 JSON 的宽松形状（脏数据兜底，字段全部可选） */
export interface JsonNode {
    type?: string
    attrs?: Record<string, unknown> | null
    content?: JsonNode[] | null
    text?: string
    marks?: JsonMark[] | null
}

export interface JsonMark {
    type?: string
    attrs?: Record<string, unknown> | null
}

/** 行内标记的应用顺序：先内后外（code 最内，highlight 最外），link 在最后单独包 */
const WRAP_ORDER = ['code', 'underline', 'italic', 'bold', 'strike', 'highlight'] as const

/**
 * 转换入口。入参为旧 notes.content 列的原始字符串；解析失败时原样返回（不丢内容）。
 */
export function jsonDocToMarkdown(input: string | null | undefined): string {
    if (input == null || input === '') return ''
    let doc: JsonNode | null = null
    try {
        doc = JSON.parse(input) as JsonNode
    } catch {
        return input
    }
    if (!doc || !Array.isArray(doc.content)) return input
    return serializeBlocks(doc.content, '')
}

/* ---------------- 块级序列化 ---------------- */

/** 序列化一组块级节点，块间以空行分隔，整体按 indent 缩进 */
function serializeBlocks(nodes: JsonNode[] | null | undefined, indent: string): string {
    const parts: string[] = []
    for (const node of nodes ?? []) {
        const rendered = serializeBlock(node, indent)
        if (rendered !== '') parts.push(rendered)
    }
    return parts.join('\n\n')
}

function serializeBlock(node: JsonNode, indent: string): string {
    switch (node.type) {
        case 'paragraph':
            return applyIndent(serializeInline(node.content), indent)
        case 'heading': {
            const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1) || 1))
            return applyIndent('#'.repeat(level) + ' ' + serializeInline(node.content), indent)
        }
        case 'codeBlock':
            return applyIndent(serializeCodeBlock(node), indent)
        case 'blockquote':
            return applyIndent(prefixQuote(serializeBlocks(node.content, '')), indent)
        case 'bulletList':
        case 'orderedList':
        case 'taskList':
            return serializeList(node, indent)
        case 'horizontalRule':
            return indent + '---'
        case 'image':
            return indent + serializeImage(node)
        case 'mathBlock':
            return applyIndent(serializeMathBlock(node), indent)
        case 'hardBreak':
            return ''
        // listItem/taskItem 游离在列表外等异常结构：按其子块平铺
        default:
            return (
                serializeBlocks(node.content, indent) || applyIndent(jsonNodeToText(node), indent)
            )
    }
}

function serializeCodeBlock(node: JsonNode): string {
    const lang = typeof node.attrs?.language === 'string' ? node.attrs.language.trim() : ''
    const code = plainText(node.content).replace(/\n$/, '')
    let fence = '```'
    while (code.includes(fence)) fence += '`'
    return `${fence}${lang}\n${code}\n${fence}`
}

function serializeMathBlock(node: JsonNode): string {
    const tex = plainText(node.content).replace(/\n$/, '')
    return `$$\n${tex}\n$$`
}

/** 列表（bullet/ordered/task 共用）：首行带 marker，其余子块按 marker 宽度缩进续排 */
function serializeList(node: JsonNode, indent: string): string {
    const ordered = node.type === 'orderedList'
    const start = Number(node.attrs?.start ?? 1) || 1
    const lines: string[] = []
    const items = node.content ?? []
    items.forEach((item, index) => {
        const checked = item.attrs?.checked === true
        let marker: string
        if (item.type === 'taskItem') marker = checked ? '- [x] ' : '- [ ] '
        else if (ordered) marker = `${start + index}. `
        else marker = '- '
        lines.push(serializeListItem(item, marker, indent))
    })
    return lines.join('\n')
}

function serializeListItem(item: JsonNode, marker: string, indent: string): string {
    const contIndent = indent + ' '.repeat(marker.length)
    const children = item.content ?? []
    const parts: string[] = []
    children.forEach((child, idx) => {
        if (idx === 0 && child.type === 'paragraph') {
            // 首段直接挂在 marker 后；段内硬换行的续行对齐到内容列
            const inline = serializeInline(child.content).replace(/\n/g, '\n' + contIndent)
            parts.push(indent + marker + inline)
        } else {
            parts.push(serializeBlock(child, contIndent))
        }
    })
    return parts.join('\n')
}

function prefixQuote(text: string): string {
    return text
        .split('\n')
        .map((line) => (line === '' ? '>' : '> ' + line))
        .join('\n')
}

function applyIndent(text: string, indent: string): string {
    if (!indent) return text
    return text
        .split('\n')
        .map((line) => indent + line)
        .join('\n')
}

/* ---------------- 行内序列化 ---------------- */

/**
 * 行内序列化：把连续、标记集相同的 text 节点合并为一组再包裹分隔符，
 * 避免 `**foo****bar**` 这类相邻分隔符互相粘连导致解析错误。
 */
function serializeInline(nodes: JsonNode[] | null | undefined): string {
    interface Group {
        sig: string
        marks: JsonMark[]
        parts: string[]
        isText: boolean
    }
    const groups: Group[] = []
    for (const node of nodes ?? []) {
        if (node.type === 'hardBreak') {
            const last = groups[groups.length - 1]
            if (last && last.isText) {
                last.parts.push('  \n')
                continue
            }
            groups.push({ sig: ':br', marks: [], parts: ['  \n'], isText: false })
            continue
        }
        if (node.type === 'text') {
            const sig = (node.marks ?? []).map((m) => m.type ?? '').join('|')
            const last = groups[groups.length - 1]
            if (last && last.isText && last.sig === sig) {
                last.parts.push(node.text ?? '')
            } else {
                groups.push({
                    sig,
                    marks: node.marks ?? [],
                    parts: [node.text ?? ''],
                    isText: true
                })
            }
            continue
        }
        // mathInline / image / 未知内联节点：独立成组
        groups.push({
            sig: `:${node.type ?? 'unknown'}:${groups.length}`,
            marks: [],
            parts: [serializeInlineItem(node)],
            isText: false
        })
    }
    return groups.map((g) => serializeTextGroup(g.parts.join(''), g.marks)).join('')
}

function serializeInlineItem(node: JsonNode): string {
    switch (node.type) {
        case 'mathInline':
            return '$' + plainText(node.content) + '$'
        case 'image':
            return serializeImage(node)
        default:
            return jsonNodeToText(node)
    }
}

function serializeTextGroup(text: string, marks: JsonMark[]): string {
    const link = marks.find((m) => m.type === 'link')
    const rest = [...marks]
        .filter((m) => m.type !== 'link')
        .sort((a, b) => WRAP_ORDER.indexOf(a.type as never) - WRAP_ORDER.indexOf(b.type as never))
    let inner = text
    for (const mark of rest) inner = applyMarkWrap(inner, mark)
    if (link) {
        const href = typeof link.attrs?.href === 'string' ? link.attrs.href : ''
        if (!href) return inner
        // URL 含空格/括号时用尖括号形式，避免提前闭合链接目标
        const target = /[\s()<>]/.test(href) ? `<${href.replace(/>/g, '%3E')}>` : href
        return `[${inner || href}](${target})`
    }
    return inner
}

function applyMarkWrap(inner: string, mark: JsonMark): string {
    switch (mark.type) {
        case 'bold':
            return wrapEmphasis(inner, '**', '__', 'strong')
        case 'italic':
            return wrapEmphasis(inner, '*', '_', 'em')
        case 'strike': {
            if (inner.includes('~~')) return `<s>${inner}</s>`
            if (inner.includes('~')) return wrapDelim(inner, '~~')
            return '~~' + inner + '~~'
        }
        case 'highlight': {
            if (inner.includes('==')) return `<mark>${inner}</mark>`
            if (inner.includes('=')) return wrapDelim(inner, '==')
            return '==' + inner + '=='
        }
        case 'underline':
            return `<u>${inner}</u>`
        case 'code':
            return wrapCode(inner)
        default:
            return inner
    }
}

/**
 * 强调包裹：首选分隔符与内容冲突时换备选分隔符（如加粗内容里已有 * 或首尾紧贴 * 时用 __），
 * 两者都冲突时退化为 HTML 标签，保证语义不丢失。
 */
function wrapEmphasis(inner: string, delim: string, alt: string, tag: string): string {
    const conflicts = (delim: string): boolean =>
        inner.includes(delim) ||
        // 内容与分隔符紧贴会形成更长的星号/下划线串，破坏嵌套解析
        inner.startsWith(delim.charAt(0)) ||
        inner.endsWith(delim.charAt(0))
    if (!conflicts(delim)) return delim + inner + delim
    if (!conflicts(alt)) return alt + inner + alt
    return `<${tag}>${inner}</${tag}>`
}

/** 内容里出现分隔符字符时逐字符反斜杠转义（~~ / == 用） */
function wrapDelim(inner: string, delim: string): string {
    const escaped = inner.replace(
        new RegExp(escapeRegExp(delim.charAt(0)), 'g'),
        '\\' + delim.charAt(0)
    )
    return delim + escaped + delim
}

function wrapCode(inner: string): string {
    // 代码段内无法转义反引号，按内容中最长反引号串决定围栏长度
    const runs = inner.match(/`+/g) ?? []
    const longest = runs.reduce((max, r) => Math.max(max, r.length), 0)
    const fence = '`'.repeat(longest + 1)
    // 内容以反引号开头/结尾时，围栏与内容之间补空格（CommonMark 规则）
    const pad = inner.startsWith('`') || inner.endsWith('`') ? ' ' : ''
    return `${fence}${pad}${inner}${pad}${fence}`
}

function serializeImage(node: JsonNode): string {
    const src = typeof node.attrs?.src === 'string' ? node.attrs.src : ''
    if (!src) return ''
    const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : ''
    const title = typeof node.attrs?.title === 'string' ? node.attrs.title : ''
    const target = /[\s()<>]/.test(src) ? `<${src.replace(/>/g, '%3E')}>` : src
    return `![${alt}](${target}${title ? ` "${title.replace(/"/g, '')}"` : ''})`
}

/* ---------------- 兜底工具 ---------------- */

/** 递归抽取纯文本（未知结构降级用，块结构信息丢失但内容保留） */
function jsonNodeToText(node: JsonNode | null | undefined): string {
    if (!node) return ''
    if (typeof node.text === 'string') return node.text
    return (node.content ?? []).map(jsonNodeToText).join('')
}

/** 取节点 content 里的全部纯文本（代码块/数学块正文用） */
function plainText(nodes: JsonNode[] | null | undefined): string {
    return (nodes ?? []).map(jsonNodeToText).join('')
}

function escapeRegExp(char: string): string {
    return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
