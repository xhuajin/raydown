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
                    {
                        id: string
                        content: string
                        mtime: string
                        ctime: string
                        cursor: number
                        workspace_id: string | null
                    }[]
                >
                create: (note: {
                    id: string
                    content: string
                    mtime: string
                    ctime: string
                    cursor: number
                    workspace_id: string | null
                }) => Promise<{
                    id: string
                    content: string
                    mtime: string
                    ctime: string
                    cursor: number
                    workspace_id: string | null
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
                    workspace_id: string | null
                }>
                remove: (id: string) => Promise<boolean>
                moveWorkspace: (
                    id: string,
                    workspaceId: string | null
                ) => Promise<{
                    id: string
                    content: string
                    mtime: string
                    ctime: string
                    cursor: number
                    workspace_id: string | null
                }>
            }
            workspaces: {
                list: () => Promise<{ id: string; name: string }[]>
                create: (workspace: { id: string; name: string }) => Promise<{
                    id: string
                    name: string
                }>
                rename: (id: string, name: string) => Promise<{ id: string; name: string }>
                remove: (id: string) => Promise<boolean>
            }
            clipboard: {
                readText: () => Promise<string>
                readHTML: () => Promise<string>
            }
            images: {
                save: (data: Uint8Array, ext: string) => Promise<string>
            }
        }
    }
}
