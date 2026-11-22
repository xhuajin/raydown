import { ALL_PLUGINS } from '@renderer/components/editor/cm/core/registry'
import { useSettingsStore } from '@renderer/store/settings-store'
import { cn } from '@renderer/lib/utils'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@renderer/components/ui/dialog'
import { Switch } from '@renderer/components/ui/switch'

/** 插件分类的展示顺序与标签 */
const CATEGORY_LABELS = {
    node: '节点渲染',
    mark: '行内样式',
    command: '命令与功能'
} as const

function PluginRow({ id }: { id: string }): React.ReactElement | null {
    const plugin = ALL_PLUGINS.find((p) => p.id === id)
    const plugins = useSettingsStore((s) => s.plugins)
    const setPluginEnabled = useSettingsStore((s) => s.setPluginEnabled)
    if (!plugin) return null
    // 缺省项回退插件默认值
    const enabled = plugins[plugin.id] ?? plugin.defaultEnabled

    return (
        <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60">
            <div className="min-w-0 flex-1">
                <div className="text-sm font-medium select-none">{plugin.title}</div>
                {plugin.description && (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground select-none">
                        {plugin.description}
                    </div>
                )}
            </div>
            <Switch
                checked={enabled}
                onCheckedChange={(checked) => setPluginEnabled(plugin.id, checked)}
            />
        </label>
    )
}

/**
 * 设置对话框：编辑器插件开关（可插拔测试页）。
 * 开关即时生效——编辑器监听 settings-store，经 compartment 重装扩展。
 */
export function SettingsDialog({
    open,
    onOpenChange
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
}): React.ReactElement {
    const categories = ['node', 'mark', 'command'] as const

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[70vh] overflow-y-auto sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>设置</DialogTitle>
                    <DialogDescription>开关编辑器插件，更改即时生效</DialogDescription>
                </DialogHeader>
                <div className={cn('flex flex-col gap-1 pb-2')}>
                    {categories.map((category) => {
                        const list = ALL_PLUGINS.filter((p) => p.category === category)
                        if (list.length === 0) return null
                        return (
                            <section key={category} className="mt-2 first:mt-0">
                                <h3 className="mb-1 px-2 text-xs font-medium text-muted-foreground select-none">
                                    {CATEGORY_LABELS[category]}
                                </h3>
                                {list.map((plugin) => (
                                    <PluginRow key={plugin.id} id={plugin.id} />
                                ))}
                            </section>
                        )
                    })}
                </div>
            </DialogContent>
        </Dialog>
    )
}
