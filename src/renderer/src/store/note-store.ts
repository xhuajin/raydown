import { create } from 'zustand'
import {
    createNote,
    deleteNote,
    listNotes,
    moveNoteToWorkspace,
    updateNote,
    type Note
} from '@renderer/api/notes'
import {
    createWorkspace as apiCreateWorkspace,
    deleteWorkspace as apiDeleteWorkspace,
    DEFAULT_WORKSPACE_ID,
    listWorkspaces,
    renameWorkspace as apiRenameWorkspace,
    type Workspace
} from '@renderer/api/workspaces'
import { emptyDocJson, isEmptyDoc, type JSONDoc } from '@renderer/components/editor/pm/doc'

export type Page = 'list' | 'editor'

/** 自动保存的防抖间隔（ms）：停止输入一段时间后落盘 */
const AUTOSAVE_DELAY = 600

/** 判断某条笔记是否属于指定工作区：空/NULL/默认 id 均归默认工作区 */
function noteInWorkspace(note: Note, workspaceId: string): boolean {
    if (workspaceId === DEFAULT_WORKSPACE_ID) {
        return !note.workspace_id || note.workspace_id === DEFAULT_WORKSPACE_ID
    }
    return note.workspace_id === workspaceId
}

/** 笔记归属的工作区 id：空/NULL 归默认工作区 */
function workspaceIdOf(note: Note): string {
    return note.workspace_id ?? DEFAULT_WORKSPACE_ID
}

/** 判断两份 JSONDoc 内容是否一致：用于「打开后未修改就退出则不保存」的判断 */
function docsEqual(a: JSONDoc | null, b: JSONDoc | null): boolean {
    if (a === b) return true
    if (!a || !b) return false
    return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * 对工作区列表按便签修改时间排序（供命令面板展示用）：
 * 默认工作区始终置顶，其余按各自最近编辑的便签 mtime 倒序。
 * 注：默认工作区的 mtime 取其下最早与最晚编辑便签中较新的那条，保证置顶的同时
 * 在其它工作区改动后仍能稳定排位。
 */
function sortWorkspacesByMtime(base: Workspace[], notes: Note[]): Workspace[] {
    // 计算每个工作区最近一次编辑便签的时间（无笔记则为空字符串，排最后）
    const latest = new Map<string, string>()
    for (const note of notes) {
        const id = workspaceIdOf(note)
        const prev = latest.get(id) ?? ''
        if (note.mtime > prev) latest.set(id, note.mtime)
    }
    return [...base].sort((a, b) => {
        const aDefault = a.id === DEFAULT_WORKSPACE_ID
        const bDefault = b.id === DEFAULT_WORKSPACE_ID
        if (aDefault !== bDefault) return aDefault ? -1 : 1
        return (latest.get(b.id) ?? '').localeCompare(latest.get(a.id) ?? '')
    })
}

interface NoteStore {
    // 数据
    notes: Note[]
    isFetching: boolean
    isFetchingNextPage: boolean
    hasNextPage: boolean
    // 工作区
    workspaces: Workspace[]
    workspacesReady: boolean
    /** 当前激活的工作区 id（笔记列表与新建笔记归属都依据它） */
    activeWorkspaceId: string
    loadWorkspaces: () => Promise<void>
    setActiveWorkspace: (id: string) => void
    createWorkspace: (name: string) => Promise<void>
    renameWorkspace: (id: string, name: string) => Promise<void>
    deleteWorkspace: (id: string) => Promise<void>
    /** 把当前选中的便签移入指定工作区（null 表示默认工作区） */
    moveSelectedToWorkspace: (workspaceId: string | null) => Promise<void>
    // 选中/预览
    selectedId: string | null
    selectedNote: Note | null
    /** BottomBar 的 action panel 开关：sidebar 右键 / Ctrl+K 共用 */
    actionMenuOpen: boolean
    setActionMenuOpen: (open: boolean) => void
    /** 编辑器工具栏显隐：Ctrl+T / BottomBar 按钮切换，默认隐藏 */
    toolbarVisible: boolean
    toggleToolbar: () => void
    // Page1 侧栏预览动作
    selectNote: (id: string) => void
    // Page2 编辑/新建
    page: Page
    newNoteActive: boolean
    editingActive: boolean
    draft: JSONDoc | null
    /** 打开编辑器时的初始草稿快照：退出时作为「是否修改过」的比对基准 */
    mountDraft: JSONDoc | null
    /** 编辑器光标文档位置（0 表示文档开头），随草稿一起落库 */
    cursor: number
    /** 自动保存目标 id：编辑既有便为 selectedId；新建笔记在首次落库后赋值 */
    draftId: string | null
    setDraft: (draft: JSONDoc | null) => void
    setCursor: (cursor: number) => void
    openNewNote: () => void
    openSelectedNote: () => void
    openEditorFor: (id: string) => void
    closeEditor: () => void
    // CRUD
    refetch: () => Promise<void>
    /** 立即把当前草稿落库（退出编辑器 / 手动触发用） */
    flushSave: () => Promise<void>
    /** 最近一次自动保存失败原因；null 表示当前没有失败（供 UI 提示用） */
    saveError: string | null
    clearSaveError: () => void
    remove: (id: string) => Promise<void>
}

export const useNoteStore = create<NoteStore>((set, get) => {
    let saveTimer: ReturnType<typeof setTimeout> | null = null

    /** 把当前草稿写入 draftId 指向的笔记；新建笔记首次写入时先建行拿到 id */
    async function persistDraft(): Promise<void> {
        const s = get()
        const { draft } = s
        if (!draft || isEmptyDoc(draft)) return

        if (s.newNoteActive) {
            if (!s.draftId) {
                // 还没落库：先创建一条笔记（获得稳定 id），归属当前工作区
                const workspaceId = s.activeWorkspaceId ?? DEFAULT_WORKSPACE_ID
                const note = await createNote(draft, get().cursor, workspaceId)
                set({ draftId: note.id, selectedId: note.id, selectedNote: note })
            } else {
                await updateNote(s.draftId, { content: draft, cursor: get().cursor })
            }
        } else if (s.editingActive && s.selectedId) {
            await updateNote(s.selectedId, { content: draft, cursor: get().cursor })
        } else {
            return
        }
        await get().refetch()
    }

    /** 自动保存入口：成功静默，失败记录到 saveError 供 UI 提示，并保留一行终端日志 */
    async function flushSaveLogged(): Promise<void> {
        try {
            await persistDraft()
            set({ saveError: null })
        } catch (err) {
            console.error('[auto-save] 保存失败:', err)
            set({ saveError: '保存失败：内容未能保存' })
        }
    }

    return {
        notes: [],
        isFetching: false,
        isFetchingNextPage: false,
        hasNextPage: false,

        workspaces: [],
        workspacesReady: false,
        activeWorkspaceId: DEFAULT_WORKSPACE_ID,

        selectedId: null,
        selectedNote: null,
        actionMenuOpen: false,
        setActionMenuOpen: (open) => set({ actionMenuOpen: open }),

        toolbarVisible: false,
        toggleToolbar: () => set((s) => ({ toolbarVisible: !s.toolbarVisible })),

        page: 'list',
        newNoteActive: false,
        editingActive: false,
        draft: null,
        mountDraft: null,
        cursor: 0,
        draftId: null,
        saveError: null,
        selectNote: (id) =>
            set((s) => {
                const note = s.notes.find((n) => n.id === id) ?? null
                return { selectedId: id, selectedNote: note }
            }),

        setDraft: (draft) => {
            set({ draft })
            // 每次改动重置防抖计时：停止输入后才真正落盘
            if (saveTimer) clearTimeout(saveTimer)
            saveTimer = setTimeout(() => void get().flushSave(), AUTOSAVE_DELAY)
        },

        setCursor: (cursor) => set({ cursor }),

        flushSave: () => {
            // 手动保存后取消待触发的防抖，避免 600ms 后对同样内容重复落库
            if (saveTimer) {
                clearTimeout(saveTimer)
                saveTimer = null
            }
            return flushSaveLogged()
        },

        clearSaveError: () => set({ saveError: null }),

        loadWorkspaces: async () => {
            const workspaces = await listWorkspaces()
            set((s) => {
                // 保持当前激活工作区；若其已被移除则回落到默认
                const activeStillExists =
                    workspaces.some((w) => w.id === s.activeWorkspaceId) ||
                    s.activeWorkspaceId === DEFAULT_WORKSPACE_ID
                return {
                    workspaces,
                    workspacesReady: true,
                    activeWorkspaceId: activeStillExists
                        ? s.activeWorkspaceId
                        : DEFAULT_WORKSPACE_ID
                }
            })
            await get().refetch()
        },

        setActiveWorkspace: (id) => {
            set({ activeWorkspaceId: id, selectedId: null, selectedNote: null, draftId: null })
            void get().refetch()
        },

        createWorkspace: async (name) => {
            const workspace = await apiCreateWorkspace(name)
            await get().loadWorkspaces()
            set({ activeWorkspaceId: workspace.id })
            await get().refetch()
        },

        renameWorkspace: async (id, name) => {
            await apiRenameWorkspace(id, name)
            await get().loadWorkspaces()
        },

        moveSelectedToWorkspace: async (workspaceId: string | null) => {
            const id = get().selectedId
            if (!id) return
            await moveNoteToWorkspace(id, workspaceId ?? DEFAULT_WORKSPACE_ID)
            await get().refetch()
        },

        deleteWorkspace: async (id) => {
            await apiDeleteWorkspace(id)
            if (get().activeWorkspaceId === id) set({ activeWorkspaceId: DEFAULT_WORKSPACE_ID })
            await get().loadWorkspaces()
        },

        openNewNote: () =>
            set({
                page: 'editor',
                newNoteActive: true,
                editingActive: false,
                selectedNote: null,
                draft: emptyDocJson(),
                mountDraft: emptyDocJson(),
                cursor: 0,
                draftId: null
            }),

        openSelectedNote: () => {
            const { selectedNote } = get()
            if (!selectedNote) return
            const draft = selectedNote.content ?? emptyDocJson()
            set({
                page: 'editor',
                newNoteActive: false,
                editingActive: true,
                draft,
                mountDraft: draft,
                cursor: selectedNote.cursor ?? 0,
                draftId: selectedNote.id
            })
        },

        openEditorFor: (id) =>
            set((s) => {
                const note = s.notes.find((n) => n.id === id) ?? null
                const draft = note?.content ?? emptyDocJson()
                return {
                    selectedId: id,
                    selectedNote: note,
                    page: 'editor',
                    newNoteActive: false,
                    editingActive: true,
                    draft,
                    mountDraft: draft,
                    cursor: note?.cursor ?? 0,
                    draftId: id
                }
            }),

        closeEditor: () => {
            // 回到列表前先清掉计时器并强制落盘未保存的改动
            if (saveTimer) {
                clearTimeout(saveTimer)
                saveTimer = null
            }
            const { draft, mountDraft } = get()
            // 打开后内容没有实质修改（含新建空笔记直接退出）→ 不触发保存；
            // 否则兜底落盘（覆盖最后防抖窗口内的改动）
            if (draft && !docsEqual(draft, mountDraft)) {
                void flushSaveLogged()
            }
            set({
                page: 'list',
                newNoteActive: false,
                editingActive: false,
                draftId: null,
                selectedNote: get().notes[0] ?? null
            })
        },

        refetch: async () => {
            set({ isFetching: true })
            const all = await listNotes()
            // 只保留当前工作区下的笔记：空/NULL/默认 id 归默认工作区
            const activeWorkspaceId = get().activeWorkspaceId ?? DEFAULT_WORKSPACE_ID
            const notes = all.filter((n) => noteInWorkspace(n, activeWorkspaceId))
            // 顺手按便签修改时间重排工作区（默认置顶），供命令面板展示
            const workspaces = sortWorkspacesByMtime(get().workspaces, all)
            set((s) => {
                // 未选中且存在笔记时，默认选中列表第一条（最近编辑的）笔记
                const selectedId =
                    s.selectedId != null && notes.some((n) => n.id === s.selectedId)
                        ? s.selectedId
                        : (notes[0]?.id ?? null)
                const selectedNote =
                    selectedId != null ? (notes.find((n) => n.id === selectedId) ?? null) : null
                return { notes, workspaces, selectedId, selectedNote, isFetching: false }
            })
        },

        remove: async (id) => {
            await deleteNote(id)
            if (get().selectedId === id) {
                set({ selectedId: null, selectedNote: null, draftId: null })
            }
            await get().refetch()
        }
    }
})
