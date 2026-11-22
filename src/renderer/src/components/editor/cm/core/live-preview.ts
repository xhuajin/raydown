/**
 * live-preview 渲染引擎（借鉴 reference/OpenMarkdown-editor 的 livePreview.ts）：
 *
 * - 一个 ViewPlugin 遍历 visibleRanges 内的语法树，按节点名分发给已启用插件的
 *   NodeRenderer（通过 rendererFacet 注入，插件开关即换装）
 * - 隐藏（replace）范围统一进 atomicRanges，光标无法落入被隐藏的源码内部
 * - 触发重建：doc / 选区 / 视口 / 语法树 / 插件集合 变化；IME 组合期间只 map 不重建
 */
import {
    EditorView,
    ViewPlugin,
    Decoration,
    type DecorationSet,
    type ViewUpdate
} from '@codemirror/view'
import { Facet } from '@codemirror/state'
import type { NodeRenderer } from './types'
import { DecorationBuilder } from './conceal'
import { currentTree, treeChanged } from './syntax'

/**
 * 渲染器注入口：registry 按启用插件拼装进来。
 * combine 拍平所有插件的渲染器数组，state.facet 拿到的是扁平 NodeRenderer 列表。
 */
export const rendererFacet = Facet.define<NodeRenderer[], NodeRenderer[]>({
    combine: (inputs) => inputs.flat()
})

class LivePreviewEngine {
    decorations: DecorationSet = Decoration.none
    atomic: DecorationSet = Decoration.none

    constructor(private readonly view: EditorView) {
        this.build()
    }

    update(update: ViewUpdate): void {
        // IME 组合期间不重建：CM 会自动 map 现有装饰，重建会打断候选词
        if (update.view.composing) return
        const renderersChanged =
            update.startState.facet(rendererFacet) !== update.state.facet(rendererFacet)
        if (
            update.docChanged ||
            update.selectionSet ||
            update.viewportChanged ||
            treeChanged(update) ||
            renderersChanged
        ) {
            this.build()
        }
    }

    private build(): void {
        const view = this.view
        const renderers = view.state.facet(rendererFacet)
        if (renderers.length === 0) {
            this.decorations = Decoration.none
            this.atomic = Decoration.none
            return
        }

        const byType = new Map<string, NodeRenderer[]>()
        for (const renderer of renderers) {
            for (const type of renderer.nodeTypes) {
                const list = byType.get(type)
                if (list) list.push(renderer)
                else byType.set(type, [renderer])
            }
        }

        const builder = new DecorationBuilder(view.state, view)
        const tree = currentTree(view.state)
        for (const { from, to } of view.visibleRanges) {
            tree.iterate({
                from,
                to,
                enter: (node) => {
                    const list = byType.get(node.name)
                    if (!list) return true
                    // 任一渲染器返回 false 即不深入子节点（整体替换型渲染）
                    let descend = true
                    for (const renderer of list) {
                        if (renderer.render(builder, node.node) === false) descend = false
                    }
                    return descend
                }
            })
        }

        this.decorations = builder.finish()
        this.atomic = builder.finishAtomic()
    }
}

export const livePreview = ViewPlugin.fromClass(LivePreviewEngine, {
    decorations: (v) => v.decorations,
    provide: (plugin) =>
        EditorView.atomicRanges.of((view): DecorationSet => {
            const instance = view.plugin(plugin)
            return instance ? instance.atomic : Decoration.none
        })
})
