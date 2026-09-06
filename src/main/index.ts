import { app, shell, BrowserWindow, ipcMain, clipboard } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
    closeDatabase,
    deleteNoteRow,
    insertNote,
    listNotesRows,
    openDatabase,
    updateNoteRow
} from './db'

// 保存主窗口引用
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: 728,
        height: 450,
        minWidth: 728,
        minHeight: 450,
        show: false,
        frame: false, // 已经隐藏了标题栏
        transparent: false,
        autoHideMenuBar: true,
        icon,
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false
        }
    })

    mainWindow.on('ready-to-show', () => {
        mainWindow?.show()
    })

    // 🎯 监听窗口最大化/还原事件，通知渲染进程
    mainWindow.on('maximize', () => {
        mainWindow?.webContents.send('window-maximized-changed', true)
    })

    mainWindow.on('unmaximize', () => {
        mainWindow?.webContents.send('window-maximized-changed', false)
    })

    // 窗口关闭时清空引用
    mainWindow.on('closed', () => {
        mainWindow = null
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
    })

    // HMR for renderer base on electron-vite cli.
    // Load the remote URL for development or the local html file for production.
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.electron.app')

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
    })

    // 🎯 注册 IPC 监听器 - 窗口控制
    ipcMain.on('window-minimize', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.minimize()
        }
    })

    ipcMain.on('window-maximize', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMaximized()) {
                mainWindow.unmaximize()
            } else {
                mainWindow.maximize()
            }
        }
    })

    ipcMain.on('window-close', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.close()
        }
    })

    // 🎯 使用 invoke 返回当前最大化状态
    ipcMain.handle('window-is-maximized', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            return mainWindow.isMaximized()
        }
        return false
    })

    // 🎯 切换窗口置顶（pin），返回切换后的置顶状态
    ipcMain.handle('window-toggle-pin', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            const pinned = !mainWindow.isAlwaysOnTop()
            mainWindow.setAlwaysOnTop(pinned)
            return pinned
        }
        return false
    })

    // 原有的 IPC 测试保留
    ipcMain.on('ping', () => console.log('pong'))

    // 🎯 注册便签数据 IPC
    ipcMain.handle('notes:list', () => listNotesRows())
    ipcMain.handle('notes:create', (_event, input) => insertNote(input))
    ipcMain.handle(
        'notes:update',
        (_event, id: string, payload: { content: string; mtime: string; cursor: number }) =>
            updateNoteRow(id, payload)
    )
    ipcMain.handle('notes:delete', (_event, id: string) => deleteNoteRow(id))

    // 🎯 剪贴板读取（编辑器右键菜单「粘贴」用；渲染层的 navigator.clipboard 需要额外授权）
    ipcMain.handle('clipboard:read-text', () => clipboard.readText())
    ipcMain.handle('clipboard:read-html', () => clipboard.readHTML())

    // 🎯 打开 SQLite 数据库（数据存 userData/raydown.db）
    openDatabase(join(app.getPath('userData'), 'raydown.db'))

    createWindow()

    app.on('activate', function () {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

// 应用退出前优雅关闭数据库
app.on('will-quit', () => {
    closeDatabase()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
