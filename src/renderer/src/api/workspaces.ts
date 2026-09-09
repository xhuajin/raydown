/**
 * 工作区数据结构。
 * 存储于主进程 SQLite（userData/raydown.db）的 workspaces 表，渲染层经 IPC 访问。
 * 无展示排序字段：命令面板的展示顺序由便签修改时间计算（默认工作区始终置顶）。
 */
export interface Workspace {
    id: string
    name: string
}

/** 默认工作区的固定 id：workspace_id 为空/NULL 的便签归入此工作区 */
export const DEFAULT_WORKSPACE_ID = 'default'

/** 查询全部工作区（顺序由渲染层在 refetch 中按便签修改时间重排） */
export async function listWorkspaces(): Promise<Workspace[]> {
    const wires = await window.electronAPI.workspaces.list()
    return wires.map((w) => ({ ...w }))
}

/** 新建工作区（id 由渲染层生成） */
export async function createWorkspace(name: string): Promise<Workspace> {
    const id = crypto.randomUUID()
    const workspace: Workspace = { id, name }
    await window.electronAPI.workspaces.create(workspace)
    return workspace
}

/** 重命名工作区 */
export async function renameWorkspace(id: string, name: string): Promise<Workspace> {
    return await window.electronAPI.workspaces.rename(id, name)
}

/** 删除工作区（默认工作区不可删除，返回 false） */
export async function deleteWorkspace(id: string): Promise<boolean> {
    return await window.electronAPI.workspaces.remove(id)
}
