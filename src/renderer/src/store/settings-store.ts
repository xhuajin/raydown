import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark' | 'system'

export interface SettingsStore {
    themeMode: ThemeMode
    setThemeMode: (mode: ThemeMode) => void
    themeFamily: string
    setThemeFamily: (family: string) => void
    /** 编辑器插件开关表：id → 是否启用；缺省项回退插件 defaultEnabled */
    plugins: Record<string, boolean>
    setPluginEnabled: (id: string, enabled: boolean) => void
}

export const useSettingsStore = create<SettingsStore>()(
    persist(
        (set) => ({
            themeMode: 'system',
            setThemeMode: (themeMode) => set({ themeMode }),
            themeFamily: 'default',
            setThemeFamily: (themeFamily) => set({ themeFamily }),
            plugins: {},
            setPluginEnabled: (id, enabled) =>
                set((s) => ({ plugins: { ...s.plugins, [id]: enabled } }))
        }),
        { name: 'settings' }
    )
)
