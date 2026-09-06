import { DOMParser as PMDOMParser, Slice } from 'prosemirror-model'
import { MarkdownParser, MarkdownSerializer, defaultMarkdownSerializer } from 'prosemirror-markdown'
import MarkdownIt from 'markdown-it'
import katexPlugin from '@vscode/markdown-it-katex'

import { pmSchema } from './schema'

/**
 * Markdown ⇆ ProseMirror 的双向转换。
 *
 * - 解析（粘贴）用官方 prosemirror-markdown：内部是 markdown-it，
 *   把 markdown-it 的 token 直接映射到本项目的自定义 schema，不需要 remark。
 * - 序列化（复制）直接从文档生成 markdown，比 turndown（HTML→MD）更保真。
 * - 公式 token 由 @vscode/markdown-it-katex 提供（math_inline / math_block）。
 */

/* ---------------- markdown-it 实例 ---------------- */

export const markdownIt = MarkdownIt({ html: false, linkify: false, breaks: false })
markdownIt.use(katexPlugin)

/**
 * 任务列表语法：`- [ ] 待办` / `- [x] 已完成`。
 * markdown-it 不认识 `[ ]`，这里在 core 阶段把它从列表项首段文本中剥离，
 * 并以 data-checked 属性挂到 list_item_open token 上（由下方 parser 映射为 checked attr）。
 */
markdownIt.core.ruler.after('inline', 'raydown_tasklist', (state) => {
    const tokens = state.tokens
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type !== 'list_item_open') continue
        // 找列表项的首个 inline token（跨过 paragraph_open 等）；遇到嵌套列表则无任务标记
        let j = i + 1
        while (j < tokens.length && tokens[j].type !== 'list_item_close') {
            const type = tokens[j].type
            if (type === 'inline') break
            if (
                type === 'bullet_list_open' ||
                type === 'ordered_list_open' ||
                type === 'list_item_open'
            )
                break
            j++
        }
        const inline = tokens[j]
        if (!inline || inline.type !== 'inline' || !inline.children?.length) continue
        const first = inline.children[0]
        if (first.type !== 'text') continue
        const match = /^\[([ xX])\](?:\s+|$)/.exec(first.content)
        if (!match) continue
        tokens[i].attrSet('data-checked', match[1] === ' ' ? 'false' : 'true')
        first.content = first.content.slice(match[0].length)
        if (!first.content) inline.children.splice(0, 1)
    }
})

/* ---------------- Markdown → ProseMirror ---------------- */

/**
 * token → schema 映射。math_inline / math_block 是单 token（无 _open/_close），
 * 走 noCloseToken 的 block 处理器：openNode + addText(content) + closeNode，
 * 对行内 mathInline 同样成立（节点最终会落入当前段落的内容里）。
 */
const parseSpecs = {
    blockquote: { block: 'blockquote' },
    paragraph: { block: 'paragraph' },
    list_item: {
        block: 'list_item',
        getAttrs: (tok) => {
            const checked = tok.attrGet('data-checked')
            return checked === null ? null : { checked: checked === 'true' }
        }
    },
    bullet_list: { block: 'bullet_list' },
    ordered_list: {
        block: 'ordered_list',
        getAttrs: (tok) => ({ order: Number(tok.attrGet('start')) || 1 })
    },
    heading: { block: 'heading', getAttrs: (tok) => ({ level: Number(tok.tag.slice(1)) }) },
    code_block: { block: 'code_block', noCloseToken: true },
    fence: {
        block: 'code_block',
        getAttrs: (tok) => ({ language: tok.info.trim().split(/\s+/)[0] || null }),
        noCloseToken: true
    },
    hardbreak: { node: 'hard_break' },
    math_inline: { block: 'mathInline', noCloseToken: true },
    math_block: { block: 'mathBlock', noCloseToken: true },
    em: { mark: 'em' },
    strong: { mark: 'strong' },
    s: { mark: 'strike' },
    link: {
        mark: 'link',
        getAttrs: (tok) => ({
            href: tok.attrGet('href') ?? '',
            title: tok.attrGet('title') ?? null
        })
    },
    code_inline: { mark: 'code', noCloseToken: true }
}

export const markdownParser = new MarkdownParser(pmSchema, markdownIt, parseSpecs)

/* ---------------- ProseMirror → Markdown ---------------- */

const { nodes: defaultNodes, marks: defaultMarks } = defaultMarkdownSerializer

export const markdownSerializer = new MarkdownSerializer(
    {
        ...defaultNodes,
        bullet_list(state, node) {
            // 默认实现用 `*`，统一输出 `- `
            state.renderList(node, '  ', () => '- ')
        },
        code_block(state, node) {
            // 围栏长度需要长于内容中出现的任意反引号串
            const backticks = node.textContent.match(/`{3,}/gm)
            const fence = backticks ? backticks.sort().slice(-1)[0] + '`' : '```'
            state.write(fence + (node.attrs.language || '') + '\n')
            state.text(node.textContent, false)
            state.write('\n')
            state.write(fence)
            state.closeBlock(node)
        },
        list_item(state, node) {
            // 任务项：在列表标记（`- ` / `1. `）后补 `[ ] ` / `[x] `
            if (node.attrs.checked !== null) state.write(node.attrs.checked ? '[x] ' : '[ ] ')
            state.renderContent(node)
        },
        mathInline(state, node) {
            state.write(`$${node.textContent.trim()}$`)
        },
        mathBlock(state, node) {
            state.write('$$\n')
            state.text(node.textContent.trim(), false)
            state.ensureNewLine()
            state.write('$$')
            state.closeBlock(node)
        }
    },
    {
        ...defaultMarks,
        strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true }
    }
)

/** 选区内容 → markdown 文本（复制/剪切时写入剪贴板的 text/plain） */
export function sliceToMarkdown(slice: Slice): string {
    // serialize 的类型只写了 Node，但实现（renderContent）同样接受 Fragment
    const content = slice.content as unknown as Parameters<typeof markdownSerializer.serialize>[0]
    return markdownSerializer.serialize(content, { tightLists: true }).trim()
}

/* ---------------- 粘贴辅助 ---------------- */

/**
 * 粗略判断纯文本是否“看起来像 markdown”。
 * 打分制：围栏代码块 / ATX 标题 / 任务列表 / $$ 公式块权重高，
 * 列表、粗体、链接、引用、行内公式等次之；达到阈值才按 markdown 解析，
 * 避免把普通句子（如价格 "$100 - $200"）误判成公式或列表。
 */
export function looksLikeMarkdown(text: string): boolean {
    if (!text) return false
    let score = 0
    if (/^(```|~~~)/m.test(text)) score += 3 // 围栏代码块
    if (/^#{1,6}\s+\S/m.test(text)) score += 3 // ATX 标题
    if (/^\s*[-*+]\s+\[[ xX]\]\s/m.test(text)) score += 3 // 任务列表
    if (/\$\$[\s\S]+\$\$/.test(text)) score += 3 // 公式块
    if (/^\s*[-*+]\s+\S/m.test(text)) score += 2 // 无序列表
    if (/^\s*\d+[.)]\s+\S/m.test(text)) score += 2 // 有序列表
    if (/\*\*[^*\n]+\*\*/.test(text) || /(^|\s)__[^_\n]+__/.test(text)) score += 2 // 粗体
    if (/\[[^\]\n]+\]\([^)\n]+\)/.test(text)) score += 2 // 链接
    if (/^\s*>\s+\S/m.test(text)) score += 1 // 引用
    if (/`[^`\n]+`/.test(text)) score += 1 // 行内代码
    // 行内公式：要求结束 $ 后面是边界字符，避开 "$100 - $200" 这类文本
    if (/(^|\s)\$[^\s$][^$\n]*\$(?=\s|$|[.,;!?）)])/m.test(text)) score += 1
    return score >= 2
}

/**
 * markdown 文本 → 可插入的 Slice。
 * 单段落 / 首尾是段落时让对应端“开口”，粘贴时能自然并入当前段落；
 * 其余（列表、标题、代码块等）作为闭合块插入（会拆开当前段落）。
 */
export function markdownToSlice(text: string): Slice {
    const doc = markdownParser.parse(text)
    let openStart = 0
    let openEnd = 0
    if (doc.firstChild?.type === pmSchema.nodes.paragraph) openStart = 1
    if (doc.lastChild?.type === pmSchema.nodes.paragraph) openEnd = 1
    return new Slice(doc.content, openStart, openEnd)
}

/** HTML 片段 → Slice（右键菜单粘贴网页等富文本来源时用），解析失败返回 null */
export function htmlToSlice(html: string): Slice | null {
    const dom = document.createElement('div')
    dom.innerHTML = html
    try {
        return PMDOMParser.fromSchema(pmSchema).parseSlice(dom)
    } catch {
        return null
    }
}
