import type { ThemeMode } from '@renderer/store/settings-store'
import { useSettingsStore } from '@renderer/store/settings-store'
import { Button } from '@renderer/components/ui/button'

export function ModeToggle() {
    const themeMode = useSettingsStore((s) => s.themeMode)
    const setThemeMode = useSettingsStore((s) => s.setThemeMode)

    const handleToggleTheme = () => {
        const next: ThemeMode =
            themeMode === 'dark' ? 'light' : themeMode === 'light' ? 'system' : 'dark'
        setThemeMode(next)
    }

    return (
        <Button variant="ghost" size="icon" onClick={handleToggleTheme} className="p-0 ml-1.5">
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4 text-foreground/80"
            >
                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"></path>
                <path d="M12 3l0 18"></path>
                <path d="M12 9l4.65 -4.65"></path>
                <path d="M12 14.3l7.37 -7.37"></path>
                <path d="M12 19.6l8.85 -8.85"></path>
            </svg>
        </Button>
    )
}
