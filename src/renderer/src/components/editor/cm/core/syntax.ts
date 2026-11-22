/**
 * 语法树访问纪律（借鉴 reference/OpenMarkdown-editor 的 syntax.ts）：
 * 全编辑器只从这里取语法树，保证装饰层用增量树、命令前用局部完整树。
 */
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'
import type { Tree } from '@lezer/common'
import type { ViewUpdate } from '@codemirror/view'

/** 装饰层用：当前（可能只解析到视口）的语法树。树长大后由 treeChanged 触发重建 */
export function currentTree(state: EditorState): Tree {
    return syntaxTree(state)
}

/**
 * 命令用：解析到 pos 附近（限时预算），保证按键命令读到完整的局部语法树。
 * 不做无界全文档解析，长文档下按键保持跟手。
 */
export function settledTree(state: EditorState, pos: number): Tree {
    // 超时未解析到 pos 时回落到增量树（命令仍可用，只是局部结构可能不全）
    return ensureSyntaxTree(state, pos, 200) ?? syntaxTree(state)
}

/** 语法树是否在本次 update 中长大了（增量解析推进） */
export function treeChanged(update: ViewUpdate): boolean {
    return syntaxTree(update.startState) !== syntaxTree(update.state)
}

/** 从 pos 向上找最近的指定类型祖先节点（找不到返回 null） */
export function ancestorAt(
    tree: Tree,
    pos: number,
    names: readonly string[]
): { name: string; from: number; to: number } | null {
    let node = tree.resolveInner(pos, -1)
    while (node) {
        if (names.includes(node.name)) {
            return { name: node.name, from: node.from, to: node.to }
        }
        if (!node.parent) return null
        node = node.parent
    }
    return null
}
