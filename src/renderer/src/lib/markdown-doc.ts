/**
 * markdown 文档辅助函数（编辑器外的轻量消费：标题推导、纯文本提取、空文档判断）。
 * 只做正则级剥离，不引入 CodeMirror 解析器，保证列表/标题等 UI 消费零开销。
 */

/** 判断 markdown 内容是否为空（全空白视为空文档） */
export function isEmptyMarkdown(markdown: string | null | undefined): boolean {
    return !markdown || markdown.trim() === ''
}

/** 剥离常见行内标记符（加粗/斜体/删除线/高亮/行内代码的包裹符号） */
function stripInlineMarks(line: string): string {
    return line
        .replace(/(\*\*|__)(.*?)\1/g, '$2')
        .replace(/(\*|_)(.*?)\1/g, '$2')
        .replace(/(~~)(.*?)\1/g, '$2')
        .replace(/(==)(.*?)\1/g, '$2')
        .replace(/`([^`]*)`/g, '$1')
}

/**
 * 提取全文纯文本（复制、删除确认预览用）：剥离块级前缀与行内标记符，
 * 保留块与块之间的换行结构。
 */
export function plainTextOfMarkdown(markdown: string | null | undefined): string {
    if (!markdown) return ''
    const lines: string[] = []
    let inFence = false
    for (const raw of markdown.split(/\r?\n/)) {
        const fenceMatch = raw.match(/^\s*(`{3,}|~{3,})/)
        if (fenceMatch) {
            inFence = !inFence
            lines.push('')
            continue
        }
        if (inFence) {
            lines.push(raw.replace(/^\s{0,3}/, ''))
            continue
        }
        const line = stripInlineMarks(
            raw
                .replace(/^\s*#{1,6}\s+/, '')
                .replace(/^\s*>\s?/, '')
                .replace(/^\s*([-*+]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s+)?/, '')
                .replace(/^\s*(---+|\*\*\*+|___+)\s*$/, '')
                .replace(/^\s*\$\$([^$]*)\$\$\s*$/, '$1')
        )
        lines.push(line)
    }
    return lines
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}
