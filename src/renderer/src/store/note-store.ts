import { create } from 'zustand'
import { createNote, deleteNote, listNotes, updateNote, type Note } from '@renderer/api/notes'
import { emptyDocJson, isEmptyDoc, type JSONDoc } from '@renderer/components/editor/pm/doc'

export type Page = 'list' | 'editor'

/** 自动保存的防抖间隔（ms）：停止输入一段时间后落盘 */
const AUTOSAVE_DELAY = 600

interface NoteStore {
    // 数据
    notes: Note[]
    isFetching: boolean
    isFetchingNextPage: boolean
    hasNextPage: boolean
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
    /** 编辑器光标文档位置（0 表示文档开头），随草稿一起落库 */
    cursor: number
    /** 自动保存目标 id：编辑既有便为 selectedId；新建便签在首次落库后赋值 */
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

    /** 把当前草稿写入 draftId 指向的便签；新建便签首次写入时先建行拿到 id */
    async function persistDraft(): Promise<void> {
        const s = get()
        const { draft } = s
        if (!draft || isEmptyDoc(draft)) return

        if (s.newNoteActive) {
            if (!s.draftId) {
                // 还没落库：先创建一条便签（获得稳定 id），后续更新即可
                const note = await createNote(draft, get().cursor)
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

        flushSave: () => flushSaveLogged(),

        clearSaveError: () => set({ saveError: null }),

        openNewNote: () =>
            set({
                page: 'editor',
                newNoteActive: true,
                editingActive: false,
                selectedNote: null,
                draft: emptyDocJson(),
                cursor: 0,
                draftId: null
            }),

        openSelectedNote: () => {
            const { selectedNote } = get()
            if (!selectedNote) return
            set({
                page: 'editor',
                newNoteActive: false,
                editingActive: true,
                draft: selectedNote.content ?? emptyDocJson(),
                cursor: selectedNote.cursor ?? 0,
                draftId: selectedNote.id
            })
        },

        openEditorFor: (id) =>
            set((s) => {
                const note = s.notes.find((n) => n.id === id) ?? null
                return {
                    selectedId: id,
                    selectedNote: note,
                    page: 'editor',
                    newNoteActive: false,
                    editingActive: true,
                    draft: note?.content ?? emptyDocJson(),
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
            void flushSaveLogged()
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
            const notes = await listNotes()
            set((s) => {
                // 未选中且存在便签时，默认选中列表第一条（最近编辑的）便签
                const selectedId =
                    s.selectedId != null && notes.some((n) => n.id === s.selectedId)
                        ? s.selectedId
                        : (notes[0]?.id ?? null)
                const selectedNote =
                    selectedId != null ? (notes.find((n) => n.id === selectedId) ?? null) : null
                return { notes, selectedId, selectedNote, isFetching: false }
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
