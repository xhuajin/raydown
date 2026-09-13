export const KEYMAP = {
    newNote: 'Ctrl+N',
    openNote: 'Enter',
    actionsMenu: 'Ctrl+K',
    toggleToolbar: 'Ctrl+T',
    commandPanel: 'Ctrl+P',
    copyNote: 'Ctrl+C',
    // Ctrl+S 两个页面共用：编辑页手动保存（saveNote），列表页分享（shareNote）
    saveNote: 'Ctrl+S',
    shareNote: 'Ctrl+S',
    deleteNote: 'Delete',
    escape: 'Escape',
    moveNoteUp: 'ArrowUp',
    moveNoteDown: 'ArrowDown'
} as const

export type KeymapCommand = keyof typeof KEYMAP
export type KeymapHandler = (event: KeyboardEvent) => boolean | void

const handlers = new Map<KeymapCommand, Set<KeymapHandler>>()

function matchesShortcut(event: KeyboardEvent, shortcut: string) {
    const [modifier, key] = shortcut.includes('+') ? shortcut.split('+') : [null, shortcut]
    const keyMatches =
        event.key.toLowerCase() === key.toLowerCase() ||
        event.code.toLowerCase() === `key${key.toLowerCase()}`
    if (!keyMatches) return false
    if (modifier === 'Ctrl') {
        return event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey
    }
    return !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey
}

function isEditableTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false
    if (target.isContentEditable) return true
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

export function registerKeymapHandler(command: KeymapCommand, handler: KeymapHandler) {
    const commandHandlers = handlers.get(command) ?? new Set<KeymapHandler>()
    commandHandlers.add(handler)
    handlers.set(command, commandHandlers)

    return () => {
        commandHandlers.delete(handler)
        if (commandHandlers.size === 0) handlers.delete(command)
    }
}

/**
 * 把键盘事件分发到对应命令的所有 handler：任一 handler 返回 true 即视为“认领”，
 * 事件会被 preventDefault + stopPropagation，不再下发给编辑器 / 菜单等组件。
 * 必须挂在 window 的捕获阶段调用（见 App.tsx）：ProseMirror 会对 Escape 等
 * 按键 preventDefault、base-ui 菜单触发按钮会拦截方向键，冒泡阶段分发会漏掉它们。
 *
 * 多个命令可能共用同一快捷键（如编辑页 saveNote / 列表页 shareNote 都是 Ctrl+S）：
 * 按 KEYMAP 顺序逐个尝试，某个命令的 handler 认领后停止；没认领则继续尝试下一个
 * 命令，全部未认领时事件照常下发给组件。
 */
export function dispatchKeymapEvent(event: KeyboardEvent): boolean {
    const isArrowCommand = (id: KeymapCommand): boolean =>
        id === 'moveNoteUp' || id === 'moveNoteDown'
    const isEnterCommand = (id: KeymapCommand): boolean => id === 'openNote'

    let handled = false
    for (const id of Object.keys(KEYMAP) as KeymapCommand[]) {
        if (!matchesShortcut(event, KEYMAP[id])) continue
        if (isArrowCommand(id) && isEditableTarget(event.target)) continue
        if (isEnterCommand(id) && isEditableTarget(event.target)) continue

        for (const handler of handlers.get(id) ?? []) {
            handled = handler(event) === true || handled
        }
        if (handled) break
    }
    if (handled) {
        event.preventDefault()
        event.stopPropagation()
    }
    return handled
}
