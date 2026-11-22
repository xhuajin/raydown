/**
 * 可插拔 markdown 编辑器的核心类型。
 *
 * 设计原则（同 Obsidian live preview）：编辑对象永远是 markdown 源文本，
 * 渲染只是 Decoration/Widget 覆盖层，绝不改写文档结构。
 * 每个功能（标题/列表/公式/…）是一个 MarkdownPlugin，可在设置页独立开关：
 * 关闭后对应语法不再被渲染（显示纯文本源码），其命令快捷键同步失效。
 */
import type { EditorState, Extension } from '@codemirror/state'
import type { EditorView, WidgetType } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import type { MarkdownConfig } from '@lezer/markdown'
import type { LanguageDescription } from '@codemirror/language'

/**
 * live-preview 引擎传给渲染器的构建上下文。
 * 渲染器只通过这里的方法产出装饰，隐藏范围由引擎统一收集并交给
 * atomicRanges（光标无法落入隐藏文本）。
 */
export interface NodeRenderContext {
    view: EditorView
    state: EditorState
    /** 选区是否触碰 [from, to]：触碰时渲染器应露出源码（不再 conceal） */
    touches(from: number, to: number): boolean
    /** marker 专用：零宽光标须落在 [from, to) 内才算触碰（终点边界不算），
     *  避免光标停在紧随 marker 的文本前时源码提前露出；选区仍按重叠判定 */
    touchesInner(from: number, to: number): boolean
    /** 同 conceal，但安全网用 touchesInner（配套 marker 的严格露出判定） */
    concealInner(from: number, to: number, widget?: WidgetType): void
    /** 用零宽替换装饰隐藏 [from, to]；可带 widget；自动纳入 atomicRanges。
     *  force: 跳过"选区触碰即露出"的安全网——用于原子范围内的前缀占位
     *  （如列表缩进），光标无法进入其中，边界位置的触碰不应让它消失 */
    conceal(from: number, to: number, widget?: WidgetType, options?: { force?: boolean }): void
    /** 行内 mark 装饰（着色/字体等样式）；style 可选，用于固定宽度的 marker 盒等 */
    mark(from: number, to: number, className: string, style?: string): void
    /** 点位 widget（不替换文本，插在 pos 旁） */
    widget(pos: number, side: number, widget: WidgetType): void
    /** 行装饰：解析 pos 所在行并加 class/内联样式 */
    line(pos: number, className: string, style?: string): void
}

/**
 * 渲染器：接管某类语法节点的展示。
 * render 返回 false 表示不深入子节点（整体替换时用）。
 */
export interface NodeRenderer {
    /** 要接管的语法树节点名（如 'StrongEmphasis'、'ListMark'） */
    nodeTypes: readonly string[]
    render(ctx: NodeRenderContext, node: SyntaxNode): boolean | void
}

/** 插件分类：设置页按此分组 */
export type PluginCategory = 'node' | 'mark' | 'command'

/**
 * 一个可开关的编辑器功能。assemble 阶段按启用集合拼装：
 * - parse：markdown 方言扩展（影响语法树结构，如 ==高亮==、$公式$ 的解析规则）
 * - codeLanguages：围栏代码块内要加载的嵌套语言（惰性加载）
 * - extensions：普通 CM 扩展（keymap、StateField、ViewPlugin、HighlightStyle 等）
 * - renderers：注册到 live-preview 引擎的渲染器
 */
export interface MarkdownPlugin {
    id: string
    title: string
    description?: string
    category: PluginCategory
    defaultEnabled: boolean
    parse?: MarkdownConfig
    codeLanguages?: readonly LanguageDescription[]
    extensions?: Extension | readonly Extension[]
    renderers?: readonly NodeRenderer[]
}

/** 组装结果：方言部分进 markdown() 配置，其余直接进 EditorState */
export interface PluginBundle {
    parse: MarkdownConfig[]
    codeLanguages: readonly LanguageDescription[]
    extensions: Extension[]
}

export interface EditorHost {
    /** 文档变化回调（markdown 全文） */
    onChange?(markdown: string): void
    /** 光标移动回调（CodeMirror 文档位移） */
    onCursorChange?(position: number): void
}
