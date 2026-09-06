import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// 便签数据结构（与渲染层 api/notes.ts 的 Note 一致，content 为 JSON 字符串）
export interface NoteApi {
    id: string
    content: string
    mtime: string
    ctime: string
    cursor: number
}

// 定义 API 类型
export interface ElectronAPI {
    minimize: () => void
    maximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
    togglePin: () => Promise<boolean>
    onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void
    notes: {
        list: () => Promise<NoteApi[]>
        create: (note: NoteApi) => Promise<NoteApi>
        update: (
            id: string,
            payload: { content: string; mtime: string; cursor: number }
        ) => Promise<NoteApi>
        remove: (id: string) => Promise<boolean>
    }
    clipboard: {
        readText: () => Promise<string>
        readHTML: () => Promise<string>
    }
}

// 暴露 API
const api: ElectronAPI = {
    minimize: () => ipcRenderer.send('window-minimize'),

    maximize: () => ipcRenderer.send('window-maximize'),

    close: () => ipcRenderer.send('window-close'),

    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),

    togglePin: () => ipcRenderer.invoke('window-toggle-pin'),

    onMaximizedChange: (callback: (isMaximized: boolean) => void) => {
        const handler = (_event: any, isMaximized: boolean) => {
            callback(isMaximized)
        }
        ipcRenderer.on('window-maximized-changed', handler)

        return () => {
            ipcRenderer.removeListener('window-maximized-changed', handler)
        }
    },

    notes: {
        list: () => ipcRenderer.invoke('notes:list'),
        create: (note) => ipcRenderer.invoke('notes:create', note),
        update: (id, payload) => ipcRenderer.invoke('notes:update', id, payload),
        remove: (id) => ipcRenderer.invoke('notes:delete', id)
    },

    clipboard: {
        readText: () => ipcRenderer.invoke('clipboard:read-text'),
        readHTML: () => ipcRenderer.invoke('clipboard:read-html')
    }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
    try {
        contextBridge.exposeInMainWorld('electron', electronAPI)
        contextBridge.exposeInMainWorld('electronAPI', api)
    } catch (error) {
        console.error(error)
    }
} else {
    // @ts-ignore (define in dts)
    window.electron = electronAPI
    // @ts-ignore (define in dts)
    window.electronAPI = api
}
