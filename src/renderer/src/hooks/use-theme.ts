import { useSettingsStore } from '@renderer/store/settings-store'
import { useEffect } from 'react'

/** 把主题设置同步到 <html>：data-theme-family 选配色，.dark 控制深浅，system 时跟随系统。 */
function useTheme() {
    const themeMode = useSettingsStore((s) => s.themeMode)
    const themeFamily = useSettingsStore((s) => s.themeFamily)

    useEffect(() => {
        const root = document.documentElement
        root.dataset.themeFamily = themeFamily

        const media = window.matchMedia('(prefers-color-scheme: dark)')
        const apply = () => {
            const isDark = themeMode === 'dark' || (themeMode === 'system' && media.matches)
            root.classList.toggle('dark', isDark)
        }
        apply()
        if (themeMode !== 'system') return
        media.addEventListener('change', apply)
        return () => media.removeEventListener('change', apply)
    }, [themeMode, themeFamily])
}

export default useTheme
