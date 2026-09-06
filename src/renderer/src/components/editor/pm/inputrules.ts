import {
    InputRule,
    inputRules,
    textblockTypeInputRule,
    wrappingInputRule
} from 'prosemirror-inputrules'
import { createMathInlineInputRule } from 'prosemirror-math'
import { pmSchema } from './schema'

/** `# [/## /### ` + 空格 → 标题 */
const headingRule = (level: number): InputRule =>
    textblockTypeInputRule(new RegExp(`^(#{1,${level}})\\s$`), pmSchema.nodes.heading, (match) => ({
        level: match[1].length
    }))

/** `- ` / `* ` / `+ ` → 无序列表 */
const bulletListRule: InputRule = wrappingInputRule(/^\s*([-+*])\s$/, pmSchema.nodes.bullet_list)

/** `1. ` → 有序列表 */
const orderedListRule: InputRule = wrappingInputRule(
    /^(\d+)\.\s$/,
    pmSchema.nodes.ordered_list,
    (match) => ({ order: +match[1] })
)

/** `> ` → 引用 */
const blockquoteRule: InputRule = wrappingInputRule(/^\s*>\s$/, pmSchema.nodes.blockquote)

/** ``` → 代码块 */
const codeBlockRule: InputRule = textblockTypeInputRule(/^```$/, pmSchema.nodes.code_block)

/**
 * 在列表项首段开头输入 `[ ] ` / `[x] ` → 转为任务列表项。
 * 与 `bulletListRule` 组合即得到完整的 `- [ ] ` 输入体验。
 */
const taskItemRule: InputRule = new InputRule(/^\[([ xX])\]\s$/, (state, match, start, end) => {
    const { $from } = state.selection
    // 只在段落最前面触发
    if (start !== $from.start()) return null
    let itemDepth = -1
    for (let depth = $from.depth; depth > 0; depth--) {
        if ($from.node(depth).type === pmSchema.nodes.list_item) {
            itemDepth = depth
            break
        }
    }
    // 必须是列表项的首段（第一块）
    if (itemDepth < 0 || $from.start(itemDepth + 1) !== start) return null
    return state.tr
        .setNodeMarkup($from.before(itemDepth), null, { checked: match[1] !== ' ' })
        .delete(start, end)
})

export function inputRulesPlugin() {
    return inputRules({
        rules: [
            headingRule(1),
            headingRule(2),
            headingRule(3),
            bulletListRule,
            orderedListRule,
            blockquoteRule,
            codeBlockRule,
            taskItemRule,
            // `$x^2$` / `$$x^2$$` → 行内公式（`$$` + Enter 生成数学块的规则在 plugins.ts）
            createMathInlineInputRule('mathInline')
        ]
    })
}
