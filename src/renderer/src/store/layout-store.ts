import { create } from 'zustand'

/** 面板宽度边界与旧 shadcn 侧栏一致 */
export const PANEL_MIN_WIDTH = 180
export const PANEL_MAX_WIDTH = 600

export function clampPanelWidth(width: number): number {
    return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, width))
}

// 与旧 shadcn 侧栏共用一个键，老用户的面板宽度无缝继承
const PANEL_WIDTH_STORAGE_KEY = 'sidebar:width'
const PANEL_OPEN_STORAGE_KEY = 'layout:panel-open'

/** 启动时读回持久化的面板宽度；缺失/损坏/越界一律回退默认 256 */
function readStoredPanelWidth(): number {
    try {
        const raw = localStorage.getItem(PANEL_WIDTH_STORAGE_KEY)
        const parsed = raw ? Number.parseFloat(raw) : NaN
        if (Number.isFinite(parsed)) return clampPanelWidth(parsed)
    } catch {
        // localStorage 不可用时走默认值
    }
    return clampPanelWidth(256)
}

/** 启动时读回面板展开状态；缺失/损坏回退展开 */
function readStoredPanelOpen(): boolean {
    try {
        return localStorage.getItem(PANEL_OPEN_STORAGE_KEY) !== '0'
    } catch {
        return true
    }
}

interface LayoutStore {
    /** 列表页左侧面板展开状态（top-bar 按钮 / Ctrl+B / 分隔线拖拽折叠共用） */
    panelOpen: boolean
    /** 列表页左侧面板宽度（px） */
    panelWidth: number
    setPanelOpen: (open: boolean) => void
    togglePanel: () => void
    setPanelWidth: (width: number) => void
}

export const useLayoutStore = create<LayoutStore>((set, get) => {
    /** 宽度持久化防抖：拖拽期间 onSizeChange 每帧触发，停止后才写 localStorage */
    let widthTimer: ReturnType<typeof setTimeout> | null = null
    const WIDTH_PERSIST_DELAY = 300

    return {
        panelOpen: readStoredPanelOpen(),
        panelWidth: readStoredPanelWidth(),

        setPanelOpen: (open) => {
            set({ panelOpen: open })
            try {
                localStorage.setItem(PANEL_OPEN_STORAGE_KEY, open ? '1' : '0')
            } catch {
                // 忽略持久化失败
            }
        },

        togglePanel: () => get().setPanelOpen(!get().panelOpen),

        setPanelWidth: (width) => {
            const clamped = clampPanelWidth(width)
            set({ panelWidth: clamped })
            if (widthTimer) clearTimeout(widthTimer)
            widthTimer = setTimeout(() => {
                try {
                    localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(clamped))
                } catch {
                    // 忽略持久化失败
                }
            }, WIDTH_PERSIST_DELAY)
        }
    }
})
