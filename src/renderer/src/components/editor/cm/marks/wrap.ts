/**
 * toggle 命令共用：在选区两侧包裹/解除成对语法符（Mod-b/i/h）。
 * 判定基于相邻字符（选区前后是否已是该符号），无语法树依赖，行为可预期。
 */
import { EditorSelection } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { canEdit } from '../core/readonly'

export function toggleWrap(view: EditorView, mark: string): boolean {
    if (!canEdit(view)) return false // 预览模式不改写
    const { state } = view
    const tr = state.changeByRange((range) => {
        const before = state.sliceDoc(range.from - mark.length, range.from)
        const after = state.sliceDoc(range.to, range.to + mark.length)
        if (before === mark && after === mark) {
            // 已包裹：解除（选区/光标同步内移）
            const inner = state.sliceDoc(range.from, range.to)
            return {
                changes: {
                    from: range.from - mark.length,
                    to: range.to + mark.length,
                    insert: inner
                },
                range: EditorSelection.range(range.from - mark.length, range.to - mark.length)
            }
        }
        if (!range.empty) {
            // 包裹选区
            return {
                changes: [
                    { from: range.from, insert: mark },
                    { from: range.to, insert: mark }
                ],
                range: EditorSelection.range(range.from + mark.length, range.to + mark.length)
            }
        }
        // 空选区：插入成对符号，光标落在中间
        return {
            changes: { from: range.from, insert: mark + mark },
            range: EditorSelection.cursor(range.from + mark.length)
        }
    })
    view.dispatch(tr, { scrollIntoView: true, userEvent: 'input.toggleWrap' })
    return true
}
