/**
 * 插件注册表：全部 MarkdownPlugin 的单一来源。
 * 设置页按此渲染开关列表，编辑器按启用集合组装扩展。
 */
import { rendererFacet } from './live-preview'
import type { Extension } from '@codemirror/state'
import type { MarkdownPlugin, PluginBundle } from './types'
import { headingPlugin } from '../nodes/heading'
import { listPlugin } from '../nodes/list'
import { taskListPlugin } from '../nodes/task-list'
import { codeBlockPlugin } from '../nodes/code-block'
import { mathPlugin } from '../nodes/math'
import { blockquotePlugin } from '../nodes/blockquote'
import { horizontalRulePlugin } from '../nodes/horizontal-rule'
import { imagePlugin } from '../nodes/image'
import { linkPlugin } from '../nodes/link'
import { boldPlugin } from '../marks/bold'
import { italicPlugin } from '../marks/italic'
import { strikethroughPlugin } from '../marks/strikethrough'
import { inlineCodePlugin } from '../marks/inline-code'
import { highlightPlugin } from '../marks/highlight'
import { cutLinePlugin } from '../commands/cut-line'
import { moveLinePlugin } from '../commands/move-line'
import { selectCodeBlockPlugin } from '../commands/select-code-block'
import { clipboardPlugin } from '../commands/clipboard'

/** 顺序即设置页展示顺序 */
export const ALL_PLUGINS: readonly MarkdownPlugin[] = [
    headingPlugin,
    listPlugin,
    taskListPlugin,
    codeBlockPlugin,
    mathPlugin,
    blockquotePlugin,
    horizontalRulePlugin,
    imagePlugin,
    linkPlugin,
    boldPlugin,
    italicPlugin,
    strikethroughPlugin,
    inlineCodePlugin,
    highlightPlugin,
    cutLinePlugin,
    moveLinePlugin,
    selectCodeBlockPlugin,
    clipboardPlugin
]

export function getPlugin(id: string): MarkdownPlugin | undefined {
    return ALL_PLUGINS.find((p) => p.id === id)
}

/** 按启用集合组装插件贡献：方言进 markdown() 配置，其余进 EditorState */
export function buildPluginBundle(enabledIds: ReadonlySet<string>): PluginBundle {
    const enabled = ALL_PLUGINS.filter((p) => enabledIds.has(p.id))
    const extensions: Extension[] = []
    // 渲染器 facet 必须在（即使为空）：关闭全部渲染插件时清空装饰
    extensions.push(rendererFacet.of(enabled.flatMap((p) => p.renderers ?? [])))
    for (const plugin of enabled) {
        if (!plugin.extensions) continue
        if (Array.isArray(plugin.extensions)) extensions.push(...plugin.extensions)
        else extensions.push(plugin.extensions)
    }
    return {
        parse: enabled.map((p) => p.parse).filter((p) => !!p),
        codeLanguages: enabled.flatMap((p) => p.codeLanguages ?? []),
        extensions
    }
}

/** 全部插件按 defaultEnabled 生成默认启用集合 */
export function defaultEnabledIds(): Set<string> {
    return new Set(ALL_PLUGINS.filter((p) => p.defaultEnabled).map((p) => p.id))
}

/**
 * 由设置页的开关表解析实际启用集合：
 * 开关表缺省的插件回退到其 defaultEnabled（新插件天然继承默认值）。
 */
export function resolveEnabledPlugins(overrides: Record<string, boolean> | undefined): Set<string> {
    const enabled = new Set<string>()
    for (const plugin of ALL_PLUGINS) {
        const value = overrides?.[plugin.id]
        if (value === undefined ? plugin.defaultEnabled : value) enabled.add(plugin.id)
    }
    return enabled
}
