import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark' | 'system'

export interface SettingsStore {
    themeMode: ThemeMode
    setThemeMode: (mode: ThemeMode) => void
    themeFamily: string
    setThemeFamily: (family: string) => void
}

export const useSettingsStore = create<SettingsStore>()(
    persist(
        (set) => ({
            themeMode: 'system',
            setThemeMode: (themeMode) => set({ themeMode }),
            themeFamily: 'default',
            setThemeFamily: (themeFamily) => set({ themeFamily })
        }),
        { name: 'settings' }
    )
)
