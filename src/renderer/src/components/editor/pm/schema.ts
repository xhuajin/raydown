import { Schema } from 'prosemirror-model'
import { mathBlockSpec, mathInlineSpec } from 'prosemirror-math'

/**
 * 便签使用的 ProseMirror Schema。
 * 保存的数据类型 = 该 schema 下的文档 JSON（doc → toJSON）。
 *
 * 数学节点命名必须是 mathInline / mathBlock：prosemirror-math 的
 * mathBlockEnterRule / createMathInlineInputRule 按这两个名字查找节点类型。
 */
export const pmSchema = new Schema({
    nodes: {
        doc: { content: 'block+' },
        paragraph: {
            content: 'inline*',
            group: 'block',
            parseDOM: [{ tag: 'p' }],
            toDOM: () => ['p', 0]
        },
        text: { group: 'inline' },
        hard_break: {
            inline: true,
            group: 'inline',
            selectable: false,
            parseDOM: [{ tag: 'br' }],
            toDOM: () => ['br']
        },
        heading: {
            content: 'inline*',
            group: 'block',
            defining: true,
            attrs: { level: { default: 1 } },
            parseDOM: [
                { tag: 'h1', attrs: { level: 1 } },
                { tag: 'h2', attrs: { level: 2 } },
                { tag: 'h3', attrs: { level: 3 } }
            ],
            toDOM: (node) => ['h' + node.attrs.level, 0]
        },
        bullet_list: {
            content: 'list_item+',
            group: 'block',
            parseDOM: [{ tag: 'ul' }],
            toDOM: () => ['ul', 0]
        },
        ordered_list: {
            content: 'list_item+',
            group: 'block',
            attrs: { order: { default: 1 } },
            parseDOM: [{ tag: 'ol' }],
            toDOM: () => ['ol', 0]
        },
        list_item: {
            content: 'paragraph block*',
            group: 'block',
            // checked: null = 普通列表项；true/false = 任务列表项（markdown 的 `- [ ] `）
            attrs: { checked: { default: null } },
            parseDOM: [
                {
                    tag: 'li',
                    getAttrs: (dom) => {
                        const checked = (dom as HTMLElement).getAttribute('data-checked')
                        return checked === null ? {} : { checked: checked === 'true' }
                    }
                }
            ],
            toDOM: (node) => {
                if (node.attrs.checked === null) return ['li', 0]
                // checkbox 用 span 绘制（真实 input 的原生选中行为会和 attr 状态打架）。
                // 内容必须包一层 div：PM 要求内容孔 0 是其父元素唯一的子元素。
                return [
                    'li',
                    { 'data-checked': String(node.attrs.checked) },
                    ['span', { class: 'task-checkbox', contenteditable: 'false' }],
                    ['div', { class: 'task-item-content' }, 0]
                ]
            }
        },
        blockquote: {
            content: 'block+',
            group: 'block',
            parseDOM: [{ tag: 'blockquote' }],
            toDOM: () => ['blockquote', 0]
        },
        code_block: {
            content: 'text*',
            group: 'block',
            attrs: { language: { default: null } },
            parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
            toDOM: () => ['pre', ['code', 0]]
        },
        // ── 数学公式（渲染与编辑行为由 prosemirror-math 的 NodeView 提供）──
        mathInline: { ...mathInlineSpec },
        mathBlock: { ...mathBlockSpec }
    },
    marks: {
        strong: {
            parseDOM: [{ tag: 'strong' }, { tag: 'b' }, { style: 'font-weight=bold' }],
            toDOM: () => ['strong', 0]
        },
        em: {
            parseDOM: [{ tag: 'em' }, { tag: 'i' }],
            toDOM: () => ['em', 0]
        },
        strike: {
            parseDOM: [{ tag: 'strike' }, { tag: 's' }, { style: 'text-decoration=strikethrough' }],
            toDOM: () => ['s', 0]
        },
        code: {
            parseDOM: [{ tag: 'code' }],
            toDOM: () => ['code', 0],
            excludes: 'code'
        },
        link: {
            attrs: { href: { default: '' }, title: { default: null } },
            inclusive: false,
            parseDOM: [
                {
                    tag: 'a[href]',
                    getAttrs: (dom) => {
                        const el = dom as HTMLElement
                        return {
                            href: el.getAttribute('href') ?? '',
                            title: el.getAttribute('title')
                        }
                    }
                }
            ],
            toDOM: (node) => ['a', { href: node.attrs.href, title: node.attrs.title }, 0]
        }
    }
})
