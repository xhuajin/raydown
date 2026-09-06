/**
 * 主题色板：每种主题给出浅/深两枚色点用于菜单预览。
 * 深色值只在 color-scheme 下区分，这里仅做展示用。
 */
export const COLOR_THEME = [
    { id: 'default', label: 'Default', light: 'oklch(0.262 0 0)', dark: 'oklch(0.985 0.001 106)' },
    {
        id: 'github',
        label: 'GitHub',
        light: 'oklch(0.54 0.191 257.5)',
        dark: 'oklch(0.569 0.202 259.7)'
    },
    {
        id: 'rose-pine',
        label: 'Rose Pine',
        light: 'oklch(0.696 0.106 23)',
        dark: 'oklch(0.836 0.054 21.1)'
    },
    {
        id: 'tokyo-night',
        label: 'Tokyo Night',
        light: 'oklch(0.476 0.14 260.2)',
        dark: 'oklch(0.719 0.132 264.2)'
    },
    {
        id: 'everforest',
        label: 'Everforest',
        light: 'oklch(0.72 0.122 125.2)',
        dark: 'oklch(0.773 0.091 125.8)'
    },
    {
        id: 'nord',
        label: 'Nord',
        light: 'oklch(0.594 0.077 254)',
        dark: 'oklch(0.775 0.062 217.5)'
    },
    {
        id: 'kanagawa',
        label: 'Kanagawa',
        light: 'oklch(0.521 0.086 261.5)',
        dark: 'oklch(0.694 0.095 263.7)'
    },
    {
        id: 'night-owl',
        label: 'Night Owl',
        light: 'oklch(0.582 0.156 263.2)',
        dark: 'oklch(0.744 0.131 264.3)'
    },
    {
        id: 'poimandres',
        label: 'Poimandres',
        light: 'oklch(0.528 0.096 248.8)',
        dark: 'oklch(0.863 0.071 247.4)'
    },
    {
        id: 'vesper',
        label: 'Vesper',
        light: 'oklch(0.638 0.12 59.5)',
        dark: 'oklch(0.869 0.088 60.7)'
    },
    {
        id: 'horizon',
        label: 'Horizon',
        light: 'oklch(0.567 0.222 18.8)',
        dark: 'oklch(0.653 0.186 9)'
    },
    {
        id: 'synthwave84',
        label: "Synthwave '84",
        light: 'oklch(0.56 0.183 333.8)',
        dark: 'oklch(0.769 0.189 339.1)'
    }
] as const
