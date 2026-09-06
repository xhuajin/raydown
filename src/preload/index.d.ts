// eslint-disable-next-line @typescript-eslint/no-empty-interface
export {}

declare global {
    interface Window {
        electronAPI: {
            minimize: () => void
            maximize: () => void
            close: () => void
            isMaximized: () => Promise<boolean>
            togglePin: () => Promise<boolean>
            onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void
            notes: {
                list: () => Promise<
                    { id: string; content: string; mtime: string; ctime: string; cursor: number }[]
                >
                create: (note: {
                    id: string
                    content: string
                    mtime: string
                    ctime: string
                    cursor: number
                }) => Promise<{
                    id: string
                    content: string
                    mtime: string
                    ctime: string
                    cursor: number
                }>
                update: (
                    id: string,
                    payload: { content: string; mtime: string; cursor: number }
                ) => Promise<{
                    id: string
                    content: string
                    mtime: string
                    ctime: string
                    cursor: number
                }>
                remove: (id: string) => Promise<boolean>
            }
            clipboard: {
                readText: () => Promise<string>
                readHTML: () => Promise<string>
            }
        }
    }
}
