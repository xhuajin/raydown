import { app, shell, BrowserWindow, ipcMain, clipboard, Tray, Menu, nativeImage } from 'electron'
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
let tray: Tray | null = null

// 标记是否为用户主动退出（托盘菜单「退出」），否则点关闭只是隐藏到后台
let isQuitting = false

function createTray(): void {
    tray = new Tray(nativeImage.createFromPath(icon))
    tray.setToolTip('RayDown')
    tray.setContextMenu(
        Menu.buildFromTemplate([
            {
                label: '显示 RayDown',
                click: () => {
                    mainWindow?.show()
                }
            },
            { type: 'separator' },
            {
                label: '退出',
                click: () => {
                    isQuitting = true
                    app.quit()
                }
            }
        ])
    )
    // 点击托盘图标重新显示窗口
    tray.on('click', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show()
            mainWindow.focus()
        } else {
            createWindow()
        }
    })
}

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

    // 🎯 点关闭时不退出应用，隐藏到后台（托盘），由托盘菜单或系统级退出才真正关闭
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault()
            mainWindow?.hide()
        }
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

    // 🎯 创建托盘图标（关闭窗口后仍可从托盘唤起）
    createTray()

    createWindow()

    app.on('activate', function () {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
        else mainWindow?.show()
    })
})

// 主动退出（isQuitting）时才允许真正关闭窗口并退出应用
app.on('before-quit', () => {
    isQuitting = true
})

// 隐藏到后台后窗口不会真正关闭，此事件仅在主动退出时触发
app.on('window-all-closed', () => {
    app.quit()
})

// 应用退出前优雅关闭数据库
app.on('will-quit', () => {
    closeDatabase()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
