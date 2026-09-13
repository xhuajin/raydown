'use client'

import { useCallback, useRef, useState } from 'react'
import type { SeparatorProps } from 'motion-panels/react'
import { Separator } from 'motion-panels/react'

import { cn } from '@renderer/lib/utils'

/**
 * 面板分隔线：命中区 8px（w-2），可见线只有 2px 贴在手柄右缘，默认全透明不占视觉。
 * hover 时在光标 Y 处画一条渐变线（向上下两端淡出），拖动时线同样跟随光标 Y、整体提亮。
 * 视觉复刻自原 shadcn 侧栏的 SidebarResizeHandle（Craft 的 PanelResizeSash 风格）；
 * 拖拽/键盘缩放逻辑由 motion-panels 的 Separator 自带，这里只负责光效。
 *
 * 注意：不能给 Separator 传 ref——它会覆盖组件内部 gripRef，导致拖拽失效。
 * 手柄元素一律从事件对象的 currentTarget 取。
 */
function PanelSeparator({ className, ...props }: SeparatorProps) {
    const isDragging = useRef(false)
    const [dragging, setDragging] = useState(false)
    /** 光标相对手柄的 Y 与手柄高度：hover 时记录，渲染期算渐变用 */
    const [hover, setHover] = useState<{ y: number; h: number } | null>(null)

    const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const el = e.currentTarget
        isDragging.current = true
        setDragging(true)

        // 拖拽期间光标 Y 走 window 监听来同步：命中区只有 8px 宽，指针横向一离开
        // 手柄，组件自身的 onPointerMove 就不再触发，光效 Y 会停在旧位置
        const syncHoverY = (clientY: number) => {
            const rect = el.getBoundingClientRect()
            setHover({ y: clientY - rect.top, h: rect.height })
        }
        syncHoverY(e.clientY)

        const onPointerMove = (ev: PointerEvent) => syncHoverY(ev.clientY)
        const finish = (ev: PointerEvent) => {
            window.removeEventListener('pointermove', onPointerMove)
            window.removeEventListener('pointerup', finish)
            window.removeEventListener('pointercancel', finish)
            isDragging.current = false
            setDragging(false)
            // 松手时指针若已不在手柄上，补一次 hover 清理，否则渐变光效停留在最后位置
            const rect = el.getBoundingClientRect()
            if (ev.clientX < rect.left || ev.clientX > rect.right) setHover(null)
        }

        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', finish)
        window.addEventListener('pointercancel', finish)
    }, [])

    // hover 只跟踪 Y（拖拽的移动走 window 监听），命中区静止时 rect 不变
    const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        setHover({ y: e.clientY - rect.top, h: rect.height })
    }, [])

    const handlePointerLeave = useCallback(() => {
        if (!isDragging.current) setHover(null)
    }, [])

    // 光标跟随渐变：线在光标处最亮，向上下两端淡出；拖动时同样跟随光标、整体提亮
    const gradientBg = (() => {
        if (!hover) return undefined
        const h = hover.h
        const cy = hover.y
        // 边缘缓冲：最亮点不贴到面板圆角
        const edge = Math.min(64, h / 2)
        const center = Math.max(edge, Math.min(h - edge, cy))
        const near = Math.max(20, edge * 0.22)
        const far = Math.max(56, edge * 0.75)
        const alphaPeak = dragging ? 0.36 : 0.24
        const alphaMid = dragging ? 0.18 : 0.12
        const alphaEdge = dragging ? 0.1 : 0.06
        return {
            background: `linear-gradient(
                to bottom,
                transparent 0px,
                color-mix(in oklch, var(--sidebar-resize-line) ${Math.round(alphaEdge * 100)}%, transparent) ${center - far}px,
                color-mix(in oklch, var(--sidebar-resize-line) ${Math.round(alphaMid * 100)}%, transparent) ${center - near}px,
                color-mix(in oklch, var(--sidebar-resize-line) ${Math.round(alphaPeak * 100)}%, transparent) ${center}px,
                color-mix(in oklch, var(--sidebar-resize-line) ${Math.round(alphaMid * 100)}%, transparent) ${center + near}px,
                color-mix(in oklch, var(--sidebar-resize-line) ${Math.round(alphaEdge * 100)}%, transparent) ${center + far}px,
                transparent ${h}px
            )`
        }
    })()

    return (
        <Separator
            data-slot="panel-separator"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            className={cn(
                'relative flex w-2 cursor-ew-resize items-stretch justify-center outline-hidden [-webkit-app-region:no-drag]',
                className
            )}
            {...props}
        >
            {/* 可见 2px 线：默认透明，hover 时显示光标处渐变，拖动时居中提亮 */}
            <div
                className="pointer-events-none absolute inset-y-0 left-1 w-0.5 transition-opacity duration-150"
                style={{
                    opacity: dragging || hover !== null ? 1 : 0,
                    ...gradientBg
                }}
            />
        </Separator>
    )
}

export { Group as PanelGroup, Panel } from 'motion-panels/react'
export { PanelSeparator }
