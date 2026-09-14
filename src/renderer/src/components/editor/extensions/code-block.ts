import { CodeBlock } from '@tiptap/extension-code-block'
import type { CommandProps, SingleCommands } from '@tiptap/core'
import type { Node as PMNode, NodeType } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'

/**
 * 代码块（基于官方 CodeBlock，重写 toggleCodeBlock 修正多行选区语义）。
 *
 * 官方 toggleCodeBlock 底层是 PM 的 setBlockType，对跨块选区逐块转换——选中 3 个
 * 段落点「代码块」会得到 3 个独立代码块。这里按选区形态分流：
 *
 * - 开·合并：非空选区横跨多个块 → 收集每个被选中文本块的选中行（\n 分行），
 *   合并为单个 codeBlock。insertContentAt 替换选区，首尾半截段落的残留文本由
 *   PM 拆分后保留在代码块外，与 VS Code/Notion 的行为一致。
 * - 关·拆分：光标在代码块内，或选区完全落在代码块里 → 每个代码块按 \n 拆回
 *   多个段落（空行 → 空段落）。官方默认是整块变一个段落、行结构丢失，这里与合并对称。
 * - 单块/光标场景：交回官方 toggleNode（当前块整体转代码块），与 H1 按钮语义一致。
 *
 * 已知取舍：合并时选区内的图片等原子块会被丢弃（仅保留文本行）。
 */

/** 选区分析：收集每个「被选中内容」的 textblock 的选中行，及其是否全为代码块 */
function analyzeSelection(
    doc: PMNode,
    from: number,
    to: number,
    codeBlockType: NodeType
): { lines: string[]; count: number; allCodeBlock: boolean } {
    const lines: string[] = []
    let count = 0
    let allCodeBlock = true

    doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isTextblock) return true // 继续下钻（blockquote/listItem 里的段落）
        const start = pos + 1
        // 选区只是擦过块边界、未选中任何内容的块不计入
        if (start >= to || start + node.content.size <= from) return false

        count += 1
        if (node.type !== codeBlockType) allCodeBlock = false

        // 相对块内容起点的选区范围；hardBreak 视为换行，保持行结构
        const relFrom = Math.max(from, start) - start
        const relTo = Math.min(to, start + node.content.size) - start
        lines.push(
            node.textBetween(relFrom, relTo, '\n', (leaf) =>
                leaf.type.name === 'hardBreak' ? '\n' : ''
            )
        )
        return false
    })

    return { lines, count, allCodeBlock }
}

/**
 * 「关」：把选区内命中的每个代码块整体按 \n 拆成多个段落（单事务，倒序替换）。
 * 空行 → 空段落；替换后选区由 PM 映射，光标落在拆出的段落里。
 */
function splitCodeBlocksToParagraphs(
    state: EditorState,
    commands: SingleCommands,
    codeBlockType: NodeType,
    paragraphType: NodeType
): boolean {
    const { from, to } = state.selection
    const blocks: Array<{ from: number; to: number; text: string }> = []

    state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type !== codeBlockType) return true
        blocks.push({ from: pos, to: pos + node.nodeSize, text: node.textContent })
        return false
    })
    if (!blocks.length) return false

    return commands.command(({ tr, dispatch }) => {
        if (dispatch) {
            for (let i = blocks.length - 1; i >= 0; i -= 1) {
                const block = blocks[i]
                const paragraphs = block.text
                    .split('\n')
                    .map((line) =>
                        paragraphType.create(null, line ? [state.schema.text(line)] : null)
                    )
                tr.replaceWith(block.from, block.to, paragraphs)
            }
            dispatch(tr.scrollIntoView())
        }
        return true
    })
}

export const MergedCodeBlock = CodeBlock.extend({
    addCommands() {
        return {
            ...this.parent?.(),
            toggleCodeBlock:
                (attributes) =>
                ({ state, commands }: CommandProps) => {
                    const codeBlockType = state.schema.nodes.codeBlock
                    const paragraphType = state.schema.nodes.paragraph
                    if (!codeBlockType || !paragraphType) return false

                    const { selection } = state
                    const { from, to, empty } = selection

                    // 空选区：光标在代码块内 → 拆回段落；否则官方默认（当前块整体转换）
                    if (empty) {
                        if (selection.$from.parent.type === codeBlockType) {
                            return splitCodeBlocksToParagraphs(
                                state,
                                commands,
                                codeBlockType,
                                paragraphType
                            )
                        }
                        return commands.toggleNode(codeBlockType, paragraphType, attributes)
                    }

                    const { lines, count, allCodeBlock } = analyzeSelection(
                        state.doc,
                        from,
                        to,
                        codeBlockType
                    )

                    // 选区完全落在代码块里 → 关：每个代码块拆回段落
                    if (count > 0 && allCodeBlock) {
                        return splitCodeBlocksToParagraphs(
                            state,
                            commands,
                            codeBlockType,
                            paragraphType
                        )
                    }
                    // 单个非代码块被选中（部分/全部）→ 官方语义：整块转换为代码块
                    if (count <= 1) {
                        return commands.toggleNode(codeBlockType, paragraphType, attributes)
                    }

                    // 跨多个块 → 开·合并为单个代码块
                    const text = lines.join('\n')
                    const codeBlock = codeBlockType.create(
                        attributes,
                        text ? [state.schema.text(text)] : null
                    )
                    return commands.insertContentAt({ from, to }, codeBlock, {
                        updateSelection: true
                    })
                }
        }
    }
})
