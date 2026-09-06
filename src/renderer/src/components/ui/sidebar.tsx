import * as React from 'react'
import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Separator } from '@renderer/components/ui/separator'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { PanelLeftIcon } from 'lucide-react'

const SIDEBAR_COOKIE_NAME = 'sidebar_state'
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH = '16rem'
const SIDEBAR_WIDTH_ICON = '3rem'
const SIDEBAR_KEYBOARD_SHORTCUT = 'b'

export const SIDEBAR_MIN_WIDTH = 180
export const SIDEBAR_MAX_WIDTH = 600
const SIDEBAR_WIDTH_STORAGE_KEY = 'sidebar:width'

export function clampSidebarWidth(width: number): number {
    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width))
}

// 启动时读回持久化的侧栏宽度；缺失/损坏/越界一律回退默认 16rem
function readStoredSidebarWidth(): string {
    try {
        const raw = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
        if (!raw) return SIDEBAR_WIDTH
        const parsed = Number.parseFloat(raw)
        if (!Number.isFinite(parsed)) return SIDEBAR_WIDTH
        return `${clampSidebarWidth(parsed)}px`
    } catch {
        return SIDEBAR_WIDTH
    }
}

type SidebarContextProps = {
    state: 'expanded' | 'collapsed'
    open: boolean
    setOpen: (open: boolean) => void
    toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar() {
    const context = React.useContext(SidebarContext)
    if (!context) {
        throw new Error('useSidebar must be used within a SidebarProvider.')
    }

    return context
}

function SidebarProvider({
    defaultOpen = true,
    open: openProp,
    onOpenChange: setOpenProp,
    className,
    style,
    children,
    ...props
}: React.ComponentProps<'div'> & {
    defaultOpen?: boolean
    open?: boolean
    onOpenChange?: (open: boolean) => void
}) {
    // This is the internal state of the sidebar.
    // We use openProp and setOpenProp for control from outside the component.
    const [_open, _setOpen] = React.useState(defaultOpen)
    const open = openProp ?? _open
    const setOpen = React.useCallback(
        (value: boolean | ((value: boolean) => boolean)) => {
            const openState = typeof value === 'function' ? value(open) : value
            if (setOpenProp) {
                setOpenProp(openState)
            } else {
                _setOpen(openState)
            }

            // This sets the cookie to keep the sidebar state.
            document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
        },
        [setOpenProp, open]
    )

    // Helper to toggle the sidebar.
    const toggleSidebar = React.useCallback(() => {
        return setOpen((open) => !open)
    }, [setOpen])

    // Adds a keyboard shortcut to toggle the sidebar.
    React.useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                toggleSidebar()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [toggleSidebar])

    // We add a state so that we can do data-state="expanded" or "collapsed".
    // This makes it easier to style the sidebar with Tailwind classes.
    const state = open ? 'expanded' : 'collapsed'

    const contextValue = React.useMemo<SidebarContextProps>(
        () => ({
            state,
            open,
            setOpen,
            toggleSidebar
        }),
        [state, open, setOpen, toggleSidebar]
    )

    return (
        <SidebarContext.Provider value={contextValue}>
            <div
                data-slot="sidebar-wrapper"
                style={
                    {
                        '--sidebar-width': readStoredSidebarWidth(),
                        '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
                        ...style
                    } as React.CSSProperties
                }
                className={cn(
                    // 不透明底：container 的 border-r 是半透明色（dark 下为白 10%），
                    // 下面 gap/wrapper/body 全透明时会透出原生窗口的白底，
                    // sidebar 右缘会显示成一条白线
                    'group/sidebar-wrapper flex min-h-svh w-full bg-background has-data-[variant=inset]:bg-sidebar',
                    className
                )}
                {...props}
            >
                {children}
            </div>
        </SidebarContext.Provider>
    )
}

/**
 * 拖拽手柄：拖动时直接改写 gap / container 的 inline width，
 * 绕开 wrapper 上的继承型 CSS 变量（改它会让整个子树 style 失效重算）。
 * pointermove 经 rAF 合帧；拖拽期 data-resizing 抑制过渡（见 styles.css），
 * 松手后下一帧才把最终值提交回 --sidebar-width 并持久化。
 *
 * 分隔线效果参考 Craft 的 PanelResizeSash：
 * - 命中区 8px（w-2），可见线只有 2px（w-0.5）贴在手柄右缘，默认全透明不占视觉
 * - hover 时在光标 Y 处画一条渐变线（向上下两端淡出，transition 平滑出现/消失），
 *   拖动时线同样跟随光标 Y、整体提亮，方便看清拖拽中缝
 */
function SidebarResizeHandle() {
    const { state } = useSidebar()

    const isDragging = React.useRef(false)
    const containerRef = React.useRef<HTMLDivElement>(null)
    const [dragging, setDragging] = React.useState(false)
    const [hoverY, setHoverY] = React.useState<number | null>(null)

    const handlePointerDown = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const wrapper = e.currentTarget.closest('[data-slot=sidebar-wrapper]') as HTMLElement | null
        const container = wrapper?.querySelector(
            '[data-slot=sidebar-container]'
        ) as HTMLElement | null
        const gap = wrapper?.querySelector('[data-slot=sidebar-gap]') as HTMLElement | null
        if (!wrapper || !container || !gap) return

        isDragging.current = true
        setDragging(true)

        // 拖拽期间光标 Y 走 window 监听来同步：手柄只有 8px 宽，指针横向一离开
        // 手柄，组件自身的 onPointerMove 就不再触发，光效 Y 会停在旧位置
        const syncHoverY = (clientY: number) => {
            const el = containerRef.current
            if (el) {
                const rect = el.getBoundingClientRect()
                setHoverY(clientY - rect.top)
            }
        }
        syncHoverY(e.clientY)

        const startX = e.clientX
        const startWidth = container.offsetWidth
        let latestX = startX
        let rafId = 0
        let finished = false
        let finalWidth = startWidth

        // 必须先于首次宽度写入，保证该帧 recalc 时过渡已被 CSS 规则抑制
        wrapper.setAttribute('data-resizing', 'true')
        document.body.classList.add('select-none')

        const applyWidth = () => {
            rafId = 0
            const w = `${clampSidebarWidth(startWidth + latestX - startX)}px`
            gap.style.width = w
            container.style.width = w
        }

        const onPointerMove = (ev: PointerEvent) => {
            latestX = ev.clientX
            syncHoverY(ev.clientY)
            if (!rafId) rafId = requestAnimationFrame(applyWidth)
        }

        const commit = () => {
            wrapper.style.setProperty('--sidebar-width', `${finalWidth}px`)
            gap.style.width = ''
            container.style.width = ''
            wrapper.removeAttribute('data-resizing')
            localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(finalWidth))
        }

        const finish = (ev: PointerEvent) => {
            if (finished) return
            finished = true
            // 先 cancel 再 commit，否则 pending rAF 会在清理后重写 inline width
            cancelAnimationFrame(rafId)
            // 把最终值 flush 进 inline width（此帧过渡仍被抑制）
            finalWidth = clampSidebarWidth(startWidth + latestX - startX)
            const w = `${finalWidth}px`
            gap.style.width = w
            container.style.width = w
            window.removeEventListener('pointermove', onPointerMove)
            window.removeEventListener('pointerup', finish)
            window.removeEventListener('pointercancel', finish)
            document.body.classList.remove('select-none')
            isDragging.current = false
            setDragging(false)
            // 拖拽期间手柄的 pointerleave 被跳过；松手时指针若已不在手柄上，
            // 补一次 hover 清理，否则渐变光效会一直停留在最后位置
            const el = containerRef.current
            if (el) {
                const rect = el.getBoundingClientRect()
                if (
                    ev.clientX < rect.left ||
                    ev.clientX > rect.right ||
                    ev.clientY < rect.top ||
                    ev.clientY > rect.bottom
                ) {
                    setHoverY(null)
                }
            }
            // 下一帧提交：先让 final 渲染落盘一帧，随后切变量时 computed width
            // 无变化，过渡恢复不会触发一次 200ms 的收尾滑行
            requestAnimationFrame(commit)
        }

        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', finish)
        window.addEventListener('pointercancel', finish)
    }, [])

    // hover 只跟踪 Y（拖拽的 X 移动走 window 监听），命中区静止时 rect 不变
    const handlePointerMove = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect()
            setHoverY(e.clientY - rect.top)
        }
    }, [])

    const handlePointerLeave = React.useCallback(() => {
        if (!isDragging.current) setHoverY(null)
    }, [])

    // 收起时不显示
    if (state === 'collapsed') return null

    // 光标跟随渐变：线在光标处最亮，向上下两端淡出；拖动时同样跟随光标、整体提亮
    const gradientBg = (() => {
        if (hoverY === null) return undefined
        const el = containerRef.current
        if (!el) return undefined
        const h = el.getBoundingClientRect().height
        const cy = hoverY
        // 边缘缓冲：最亮点不贴到面板圆角（对应 Craft 的 64px clamp）
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
        <div
            ref={containerRef}
            role="separator"
            aria-orientation="vertical"
            aria-label="拖拽调整侧边栏宽度"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            className="absolute inset-y-0 right-0 z-20 w-2 cursor-ew-resize touch-none [-webkit-app-region:no-drag]"
        >
            {/* 可见 2px 线：默认透明，hover 时显示光标处渐变，拖动时居中提亮 */}
            <div
                className="pointer-events-none absolute inset-y-0 right-0 w-0.5 transition-opacity duration-150"
                style={{
                    opacity: dragging || hoverY !== null ? 1 : 0,
                    ...gradientBg
                }}
            />
        </div>
    )
}

function Sidebar({
    side = 'left',
    variant = 'sidebar',
    collapsible = 'offcanvas',
    className,
    children,
    ...props
}: React.ComponentProps<'div'> & {
    side?: 'left' | 'right'
    variant?: 'sidebar' | 'floating' | 'inset'
    collapsible?: 'offcanvas' | 'icon' | 'none'
}) {
    const { state } = useSidebar()

    if (collapsible === 'none') {
        return (
            <div
                data-slot="sidebar"
                className={cn(
                    'flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground',
                    className
                )}
                {...props}
            >
                {children}
            </div>
        )
    }

    return (
        <div
            className="group peer block text-sidebar-foreground"
            data-state={state}
            data-collapsible={state === 'collapsed' ? collapsible : ''}
            data-variant={variant}
            data-side={side}
            data-slot="sidebar"
        >
            {/* This is what handles the sidebar gap on desktop */}
            <div
                data-slot="sidebar-gap"
                className={cn(
                    'relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear',
                    'group-data-[collapsible=offcanvas]:w-0',
                    'group-data-[side=right]:rotate-180',
                    variant === 'floating' || variant === 'inset'
                        ? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]'
                        : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)'
                )}
            />
            <div
                data-slot="sidebar-container"
                data-side={side}
                className={cn(
                    'fixed top-10 bottom-0 z-10 flex h-[calc(100vh-80px)] w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear data-[side=left]:left-0 data-[side=left]:group-data-[collapsible=offcanvas]:-left-(--sidebar-width) data-[side=right]:right-0 data-[side=right]:group-data-[collapsible=offcanvas]:-right-(--sidebar-width)',
                    // Adjust the padding for floating and inset variants.
                    variant === 'floating' || variant === 'inset'
                        ? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]'
                        : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l',
                    className
                )}
                {...props}
            >
                <div
                    data-sidebar="sidebar"
                    data-slot="sidebar-inner"
                    className="flex size-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-sm group-data-[variant=floating]:ring-1 group-data-[variant=floating]:ring-sidebar-border"
                >
                    {children}
                </div>
                <SidebarResizeHandle />
            </div>
        </div>
    )
}

function SidebarTrigger({ className, onClick, ...props }: React.ComponentProps<typeof Button>) {
    const { toggleSidebar } = useSidebar()

    return (
        <Button
            data-sidebar="trigger"
            data-slot="sidebar-trigger"
            variant="ghost"
            size="icon-sm"
            className={cn(className)}
            onClick={(event) => {
                onClick?.(event)
                toggleSidebar()
            }}
            {...props}
        >
            <PanelLeftIcon />
            <span className="sr-only">Toggle Sidebar</span>
        </Button>
    )
}

function SidebarRail({ className, ...props }: React.ComponentProps<'button'>) {
    const { toggleSidebar } = useSidebar()

    return (
        <button
            data-sidebar="rail"
            data-slot="sidebar-rail"
            aria-label="Toggle Sidebar"
            tabIndex={-1}
            onClick={toggleSidebar}
            title="Toggle Sidebar"
            className={cn(
                'absolute inset-y-0 z-20 hidden w-4 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:inset-1/2 after:w-0.5 hover:after:bg-sidebar-border sm:flex ltr:-translate-x-1/2 rtl:-translate-x-1/2',
                'in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize',
                '[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize',
                'group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full hover:group-data-[collapsible=offcanvas]:bg-sidebar',
                '[[data-side=left][data-collapsible=offcanvas]_&]:-right-2',
                '[[data-side=right][data-collapsible=offcanvas]_&]:-left-2',
                className
            )}
            {...props}
        />
    )
}

function SidebarInset({ className, ...props }: React.ComponentProps<'main'>) {
    return (
        <main
            data-slot="sidebar-inset"
            className={cn(
                'relative flex w-full flex-1 flex-col bg-background md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2',
                className
            )}
            {...props}
        />
    )
}

function SidebarInput({ className, ...props }: React.ComponentProps<typeof Input>) {
    return (
        <Input
            data-slot="sidebar-input"
            data-sidebar="input"
            className={cn('h-8 w-full bg-background shadow-none', className)}
            {...props}
        />
    )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="sidebar-header"
            data-sidebar="header"
            className={cn('flex flex-col gap-2 p-2', className)}
            {...props}
        />
    )
}

function SidebarFooter({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="sidebar-footer"
            data-sidebar="footer"
            className={cn('flex flex-col gap-2 p-2', className)}
            {...props}
        />
    )
}

function SidebarSeparator({ className, ...props }: React.ComponentProps<typeof Separator>) {
    return (
        <Separator
            data-slot="sidebar-separator"
            data-sidebar="separator"
            className={cn('mx-2 w-auto bg-sidebar-border', className)}
            {...props}
        />
    )
}

function SidebarContent({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="sidebar-content"
            data-sidebar="content"
            className={cn(
                'no-scrollbar flex min-h-0 flex-1 flex-col gap-0 overflow-auto group-data-[collapsible=icon]:overflow-hidden',
                className
            )}
            {...props}
        />
    )
}

function SidebarGroup({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="sidebar-group"
            data-sidebar="group"
            className={cn('relative flex w-full min-w-0 flex-col p-2', className)}
            {...props}
        />
    )
}

function SidebarGroupLabel({
    className,
    render,
    ...props
}: useRender.ComponentProps<'div'> & React.ComponentProps<'div'>) {
    return useRender({
        defaultTagName: 'div',
        props: mergeProps<'div'>(
            {
                className: cn(
                    'flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-[margin,opacity] duration-200 ease-linear group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
                    className
                )
            },
            props
        ),
        render,
        state: {
            slot: 'sidebar-group-label',
            sidebar: 'group-label'
        }
    })
}

function SidebarGroupAction({
    className,
    render,
    ...props
}: useRender.ComponentProps<'button'> & React.ComponentProps<'button'>) {
    return useRender({
        defaultTagName: 'button',
        props: mergeProps<'button'>(
            {
                className: cn(
                    'absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform group-data-[collapsible=icon]:hidden after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0',
                    className
                )
            },
            props
        ),
        render,
        state: {
            slot: 'sidebar-group-action',
            sidebar: 'group-action'
        }
    })
}

function SidebarGroupContent({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="sidebar-group-content"
            data-sidebar="group-content"
            className={cn('w-full text-sm', className)}
            {...props}
        />
    )
}

function SidebarMenu({ className, ...props }: React.ComponentProps<'ul'>) {
    return (
        <ul
            data-slot="sidebar-menu"
            data-sidebar="menu"
            className={cn('flex w-full min-w-0 flex-col gap-0', className)}
            {...props}
        />
    )
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<'li'>) {
    return (
        <li
            data-slot="sidebar-menu-item"
            data-sidebar="menu-item"
            className={cn('group/menu-item relative', className)}
            {...props}
        />
    )
}

const sidebarMenuButtonVariants = cva(
    'peer/menu-button group/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm ring-sidebar-ring outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-open:hover:bg-sidebar-accent data-open:hover:text-sidebar-accent-foreground data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate',
    {
        variants: {
            variant: {
                default: 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                outline:
                    'bg-background shadow-[0_0_0_1px_var(--sidebar-border)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_var(--sidebar-accent)]'
            },
            size: {
                default: 'h-8 text-sm',
                sm: 'h-7 text-xs',
                lg: 'h-12 text-sm group-data-[collapsible=icon]:p-0!'
            }
        },
        defaultVariants: {
            variant: 'default',
            size: 'default'
        }
    }
)

function SidebarMenuButton({
    render,
    isActive = false,
    variant = 'default',
    size = 'default',
    tooltip,
    className,
    ...props
}: useRender.ComponentProps<'button'> &
    React.ComponentProps<'button'> & {
        isActive?: boolean
        tooltip?: string | React.ComponentProps<typeof TooltipContent>
    } & VariantProps<typeof sidebarMenuButtonVariants>) {
    const { state } = useSidebar()
    const comp = useRender({
        defaultTagName: 'button',
        props: mergeProps<'button'>(
            {
                className: cn(sidebarMenuButtonVariants({ variant, size }), className)
            },
            props
        ),
        render,
        state: {
            slot: 'sidebar-menu-button',
            sidebar: 'menu-button',
            size,
            active: isActive
        }
    })

    if (!tooltip) {
        return comp
    }

    if (typeof tooltip === 'string') {
        tooltip = {
            children: tooltip
        }
    }

    return (
        <Tooltip>
            <TooltipTrigger>{comp}</TooltipTrigger>
            <TooltipContent
                side="right"
                align="center"
                hidden={state !== 'collapsed'}
                {...tooltip}
            />
        </Tooltip>
    )
}

const SidebarMenuAction = React.forwardRef(function SidebarMenuAction(
    {
        className,
        render,
        showOnHover = false,
        ...props
    }: useRender.ComponentProps<'button'> &
        React.ComponentProps<'button'> & {
            showOnHover?: boolean
        },
    ref: React.Ref<HTMLButtonElement>
) {
    return useRender({
        defaultTagName: 'button',
        props: mergeProps<'button'>(
            {
                className: cn(
                    'absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform group-data-[collapsible=icon]:hidden peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0',
                    showOnHover &&
                        'group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-active/menu-button:text-sidebar-accent-foreground aria-expanded:opacity-100 md:opacity-0',
                    className
                )
            },
            props
        ),
        render,
        state: {
            slot: 'sidebar-menu-action',
            sidebar: 'menu-action'
        },
        ref
    })
})

function SidebarMenuBadge({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="sidebar-menu-badge"
            data-sidebar="menu-badge"
            className={cn(
                'pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium text-sidebar-foreground tabular-nums select-none group-data-[collapsible=icon]:hidden peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 peer-data-active/menu-button:text-sidebar-accent-foreground',
                className
            )}
            {...props}
        />
    )
}

function SidebarMenuSkeleton({
    className,
    showIcon = false,
    ...props
}: React.ComponentProps<'div'> & {
    showIcon?: boolean
}) {
    // Random width between 50 to 90%.
    const [width] = React.useState(() => {
        return `${Math.floor(Math.random() * 40) + 50}%`
    })

    return (
        <div
            data-slot="sidebar-menu-skeleton"
            data-sidebar="menu-skeleton"
            className={cn('flex h-8 items-center gap-2 rounded-md px-2', className)}
            {...props}
        >
            {showIcon && (
                <Skeleton className="size-4 rounded-md" data-sidebar="menu-skeleton-icon" />
            )}
            <Skeleton
                className="h-4 max-w-(--skeleton-width) flex-1"
                data-sidebar="menu-skeleton-text"
                style={
                    {
                        '--skeleton-width': width
                    } as React.CSSProperties
                }
            />
        </div>
    )
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<'ul'>) {
    return (
        <ul
            data-slot="sidebar-menu-sub"
            data-sidebar="menu-sub"
            className={cn(
                'mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5 group-data-[collapsible=icon]:hidden',
                className
            )}
            {...props}
        />
    )
}

function SidebarMenuSubItem({ className, ...props }: React.ComponentProps<'li'>) {
    return (
        <li
            data-slot="sidebar-menu-sub-item"
            data-sidebar="menu-sub-item"
            className={cn('group/menu-sub-item relative', className)}
            {...props}
        />
    )
}

function SidebarMenuSubButton({
    render,
    size = 'md',
    isActive = false,
    className,
    ...props
}: useRender.ComponentProps<'a'> &
    React.ComponentProps<'a'> & {
        size?: 'sm' | 'md'
        isActive?: boolean
    }) {
    return useRender({
        defaultTagName: 'a',
        props: mergeProps<'a'>(
            {
                className: cn(
                    'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden group-data-[collapsible=icon]:hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[size=md]:text-sm data-[size=sm]:text-xs data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground',
                    className
                )
            },
            props
        ),
        render,
        state: {
            slot: 'sidebar-menu-sub-button',
            sidebar: 'menu-sub-button',
            size,
            active: isActive
        }
    })
}

export {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupAction,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarInput,
    SidebarInset,
    SidebarMenu,
    SidebarMenuAction,
    SidebarMenuBadge,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSkeleton,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
    SidebarProvider,
    SidebarRail,
    SidebarSeparator,
    SidebarTrigger,
    useSidebar
}
