/**
 * 公共 WidgetType 集合。要点（来自 reference 的踩坑记录）：
 * - 需要自己处理事件的 widget 必须 ignoreEvent() 返回 true，否则 CM 会把事件当编辑行为
 * - widget 的 mousedown 默认会被 CM 处理成光标定位，需要拦截的（公式、勾选框）要 preventDefault
 */
import { EditorView, WidgetType } from '@codemirror/view'
import katex from 'katex'
import { canEdit } from './readonly'

/**
 * 列表行首缩进占位（cm-indent）：宽度 = 父项文本列的实测像素宽。
 * 放在 marker 盒子之前（同 Obsidian 的 cm-hmd-list-indent 结构），
 * 使 marker 前的缩进也是固定宽度元素。
 * 内部渲染隐藏的源码缩进文本（visibility:hidden 保留行盒），
 * 撑起与正文一致的行高与基线，使相邻光标高度正常。
 * editable 必须为 false：否则 DOM 不被 contenteditable=false 保护，
 * 空占位会被浏览器的编辑规范化折叠、光标也可能进入盒子内部。
 */
export class IndentWidget extends WidgetType {
    readonly editable = false

    constructor(
        readonly widthPx: number,
        /** 源码缩进空白文本（隐藏渲染，撑行高用） */
        readonly hiddenText: string
    ) {
        super()
    }

    eq(other: IndentWidget): boolean {
        return other.widthPx === this.widthPx && other.hiddenText === this.hiddenText
    }

    toDOM(): HTMLElement {
        const span = document.createElement('span')
        span.className = 'cm-indent'
        span.style.width = `${this.widthPx}px`
        const fill = document.createElement('span')
        fill.className = 'cm-indent-fill'
        fill.textContent = this.hiddenText
        span.appendChild(fill)
        return span
    }
}

/** 构建任务勾选框 input：点击只改写 [ ]↔[x] 括号内那一个字符 */
function createCheckbox(view: EditorView, checked: boolean, taskFrom: number): HTMLInputElement {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = checked
    input.className = 'cm-task-checkbox'
    input.setAttribute('aria-label', '切换任务状态')
    input.addEventListener('mousedown', (e) => e.stopPropagation())
    input.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!canEdit(view)) return // 预览模式：勾选不可交互
        const next = input.checked ? 'x' : ' '
        view.dispatch({
            changes: { from: taskFrom + 1, to: taskFrom + 2, insert: next },
            userEvent: 'input.taskToggle'
        })
    })
    return input
}

/**
 * 列表 marker 固定宽度盒子：隐藏态（widget）与显示态（源码 mark）都是
 * 同宽的 inline-flex 盒（宽度 = marker 前缀源码实测宽），光标移入移出
 * marker 时文本零位移（同 Obsidian 的 cm-formatting-list 结构）。
 * editable = false：CM 会加 contentEditable=false 保护并在周围插入
 * widgetBuffer，防止光标进入 inline-flex 盒内部（Chromium 不渲染其中的光标）。
 */
export class ListMarkerBoxWidget extends WidgetType {
    readonly editable = false

    constructor(
        readonly widthPx: number,
        readonly kind: 'bullet' | 'task',
        readonly checked = false,
        readonly taskFrom = 0
    ) {
        super()
    }

    eq(other: ListMarkerBoxWidget): boolean {
        return (
            other.widthPx === this.widthPx &&
            other.kind === this.kind &&
            other.checked === this.checked &&
            other.taskFrom === this.taskFrom
        )
    }

    toDOM(view: EditorView): HTMLElement {
        const box = document.createElement('span')
        // widget 态专属类：内部无光标（contenteditable=false）
        box.className = 'cm-marker-box cm-marker-box-widget'
        box.style.width = `${this.widthPx}px`
        if (this.kind === 'task') {
            box.appendChild(createCheckbox(view, this.checked, this.taskFrom))
        } else {
            // bullet 字形在前（盒子起始 = 源码 dash 位置），
            // 隐藏的源码 dash 文本随后撑起行盒高度与基线（相邻光标高度与正文一致）
            const bullet = document.createElement('span')
            bullet.className = 'cm-bullet'
            bullet.textContent = '•'
            box.appendChild(bullet)
            const dash = document.createElement('span')
            dash.className = 'cm-dash-fill'
            dash.textContent = '-'
            box.appendChild(dash)
        }
        return box
    }

    ignoreEvent(): boolean {
        return this.kind === 'task' // checkbox 需要原生 input 事件
    }
}

/**
 * 代码块语言标注：显示在隐藏态围栏行的右上角。
 * 默认显示语言名；hover 显示背景与 Copy 文案；点击复制整个代码块内容。
 * （纯展示+复制交互，不参与编辑）
 */
export class FenceLabelWidget extends WidgetType {
    constructor(
        readonly lang: string,
        /** 代码块文档范围（点击复制用） */
        readonly from: number,
        readonly to: number
    ) {
        super()
    }

    eq(other: FenceLabelWidget): boolean {
        return other.lang === this.lang && other.from === this.from && other.to === this.to
    }

    toDOM(view: EditorView): HTMLElement {
        const span = document.createElement('span')
        span.className = 'cm-lang-label'
        span.setAttribute('aria-label', '复制代码块')
        const name = document.createElement('span')
        name.className = 'cm-lang-name'
        name.textContent = this.lang
        const copy = document.createElement('span')
        copy.className = 'cm-copy-text'
        copy.textContent = 'Copy'
        span.appendChild(name)
        span.appendChild(copy)
        span.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
            if (span.classList.contains('cm-copied')) return
            void navigator.clipboard
                .writeText(view.state.sliceDoc(this.from, this.to))
                .then(() => {
                    span.classList.add('cm-copied')
                    copy.textContent = '已复制'
                    setTimeout(() => {
                        span.classList.remove('cm-copied')
                        copy.textContent = 'Copy'
                    }, 1200)
                })
                .catch(() => {})
        })
        return span
    }

    ignoreEvent(): boolean {
        return true
    }
}

/** 分割线：整行替换为水平线 */
export class HorizontalRuleWidget extends WidgetType {
    toDOM(): HTMLElement {
        const wrap = document.createElement('span')
        wrap.className = 'cm-hr-widget'
        wrap.appendChild(document.createElement('hr'))
        return wrap
    }

    ignoreEvent(): boolean {
        return true
    }
}

/** 数学公式（KaTeX 渲染）。点击 = 光标落到公式源码起点，从而露出源码进入编辑 */
export class MathWidget extends WidgetType {
    constructor(
        readonly tex: string,
        readonly displayMode: boolean,
        /** 源码范围起点（点击回跳用） */
        readonly from: number
    ) {
        super()
    }

    eq(other: MathWidget): boolean {
        return other.tex === this.tex && other.displayMode === this.displayMode
    }

    toDOM(view: EditorView): HTMLElement {
        const span = document.createElement('span')
        span.className = this.displayMode ? 'cm-math-block' : 'cm-math-inline'
        try {
            katex.render(this.tex, span, {
                displayMode: this.displayMode,
                throwOnError: false,
                strict: false
            })
        } catch {
            // KaTeX 解析失败：保留源码显示并标记错误样式
            span.classList.add('cm-math-error')
            span.textContent = this.tex
        }
        span.addEventListener('mousedown', (e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!canEdit(view)) return // 预览模式：点击公式不移动光标
            view.dispatch({ selection: { anchor: this.from }, userEvent: 'select.math' })
        })
        return span
    }

    ignoreEvent(): boolean {
        return true
    }
}

/** 行内图片：替换 ![alt](src) 为真实 <img> */
export class ImageWidget extends WidgetType {
    constructor(
        readonly src: string,
        readonly alt: string
    ) {
        super()
    }

    eq(other: ImageWidget): boolean {
        return other.src === this.src && other.alt === this.alt
    }

    toDOM(): HTMLElement {
        const img = document.createElement('img')
        img.className = 'cm-image'
        img.src = this.src
        img.alt = this.alt
        img.draggable = false
        return img
    }

    ignoreEvent(): boolean {
        return true
    }
}
