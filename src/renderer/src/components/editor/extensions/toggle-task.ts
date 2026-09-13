import { Extension } from '@tiptap/core'

/**
 * Ctrl/Cmd+L 任务状态三段循环（只在三种状态间切换，不会退出任务）：
 * 非任务节点 → 未完成任务 → 已完成任务 → 未完成任务 → …
 *
 * - 光标在 taskItem 内：直接翻转当前项的 checked 属性；
 * - 光标在其他块（段落/标题/列表项等）：用官方 toggleTaskList 把当前块包成
 *   taskList > taskItem（默认未完成），与工具栏「任务列表」按钮同一命令；
 * - 代码块/只读预览不响应。
 */
export const ToggleTask = Extension.create({
    name: 'toggleTask',

    addKeyboardShortcuts() {
        return {
            'Mod-l': () => {
                const { editor } = this
                if (!editor.isEditable) return false
                if (editor.isActive('codeBlock')) return true

                if (editor.isActive('taskItem')) {
                    const checked = editor.getAttributes('taskItem').checked
                    return editor.commands.updateAttributes('taskItem', { checked: !checked })
                }
                return editor.commands.toggleTaskList()
            }
        }
    }
})
