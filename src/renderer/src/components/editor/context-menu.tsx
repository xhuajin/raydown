import { Fragment, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Kbd, KbdGroup } from '@renderer/components/ui/kbd'

export interface ContextMenuState {
    x: number
    y: number
    /** 当前编辑器里是否选中文本 */
    hasSelection: boolean
    /** 只读模式（预览）：菜单只保留复制/全选 */
    readonly: boolean
}

export interface ContextMenuItem {
    label: string
    /** 右侧展示的快捷键提示，如 "Ctrl+C" */
    hint?: string
    disabled?: boolean
    onSelect: () => void
}

/** 分隔线占位 */
export const MENU_SEPARATOR = 'separator'

/* 快捷键提示键，样式对齐 bottom-bar.tsx 的 Kbd 用法 */
function kbdKey(label: string): React.ReactElement {
    return (
        <Kbd className="min-w-4 w-4.5 h-4.5 text-[10px] bg-transparent border border-border text-muted-foreground">
            {label}
        </Kbd>
    )
}

function kbdModifier(label: string): React.ReactElement {
    return (
        <Kbd className="min-w-4 h-4.5 text-[10px] bg-transparent border border-border text-muted-foreground tracking-normal">
            {label}
        </Kbd>
    )
}

/** "Ctrl+Shift+X" → Ctrl / Shift / X 三枚 Kbd */
function kbdHint(hint: string): React.ReactElement {
    const parts = hint.split('+')
    const key = parts.pop() ?? ''
    return (
        <KbdGroup>
            {parts.map((modifier) => (
                <Fragment key={modifier}>{kbdModifier(modifier)}</Fragment>
            ))}
            {kbdKey(key)}
        </KbdGroup>
    )
}

/**
 * 编辑器右键菜单。
 * 职责只有渲染与关闭（外点 / Escape / 滚动），菜单项由 note-editor 按状态组装。
 */
export function EditorContextMenu({
    menu,
    items,
    onClose
}: {
    menu: ContextMenuState
    items: (ContextMenuItem | typeof MENU_SEPARATOR)[]
    onClose: () => void
}): React.ReactElement {
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        // 捕获阶段监听：抢先于全局 keymap，Escape 只关菜单、不触发「返回列表」
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                onClose()
            }
        }
        const onMouseDown = (event: MouseEvent): void => {
            if (!ref.current?.contains(event.target as Node)) onClose()
        }
        const onScroll = (): void => onClose()
        document.addEventListener('mousedown', onMouseDown, true)
        document.addEventListener('keydown', onKey, true)
        window.addEventListener('scroll', onScroll, true)
        return () => {
            document.removeEventListener('mousedown', onMouseDown, true)
            document.removeEventListener('keydown', onKey, true)
            window.removeEventListener('scroll', onScroll, true)
        }
    }, [onClose])

    // 视口内收敛，避免菜单溢出屏幕
    const estimatedHeight = items.length * 30 + 8
    const x = Math.max(4, Math.min(menu.x, window.innerWidth - 190))
    const y = Math.max(4, Math.min(menu.y, window.innerHeight - estimatedHeight))

    return createPortal(
        <div
            ref={ref}
            role="menu"
            style={{ left: x, top: y }}
            className="fixed z-50 min-w-44 rounded-md border border-border bg-popover p-1 shadow-md"
        >
            {items.map((item, index) =>
                item === MENU_SEPARATOR ? (
                    <div key={index} className="my-1 h-px bg-border" />
                ) : (
                    <button
                        key={index}
                        type="button"
                        role="menuitem"
                        disabled={item.disabled}
                        // 不让菜单按钮抢走编辑器焦点（复制/剪切依赖编辑器选区）
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                            item.onSelect()
                            onClose()
                        }}
                        className="flex w-full items-center justify-between gap-6 rounded-sm px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
                    >
                        <span>{item.label}</span>
                        {item.hint ? kbdHint(item.hint) : null}
                    </button>
                )
            )}
        </div>,
        document.body
    )
}
