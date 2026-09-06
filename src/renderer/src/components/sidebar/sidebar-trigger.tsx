'use client'

import type { Transition, Variants } from 'motion/react'
import { motion, useAnimation } from 'motion/react'
import type { HTMLAttributes } from 'react'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import { useSidebar } from '@renderer/components/ui/sidebar'

export interface PanelLeftCloseIconHandle {
    startAnimation: () => void
    stopAnimation: () => void
}

interface PanelLeftCloseIconProps extends HTMLAttributes<HTMLDivElement> {
    size?: number
    strokeWidth?: number
}

const DEFAULT_TRANSITION: Transition = {
    times: [0, 0.4, 1],
    duration: 0.5
}

const PATH_VARIANTS: Variants = {
    openAnimate: { x: [0, 1.5, 1.5], y: [0, -0.8, -0.8], scaleY: [1, 1.5, 1.5] },
    closeAnimate: { x: [1.5, 0, 0], y: [-0.8, 0, 0], scaleY: [1.5, 1, 1] }
}

const SidebarTrigger = forwardRef<PanelLeftCloseIconHandle, PanelLeftCloseIconProps>(
    ({ className, size = 28, strokeWidth = 2, ...props }, ref) => {
        const controls = useAnimation()
        const isControlledRef = useRef(false)
        const { open, toggleSidebar } = useSidebar()

        useImperativeHandle(ref, () => {
            isControlledRef.current = true
            return {
                startAnimation: () => controls.start('openAnimate'),
                stopAnimation: () => controls.start('closeAnimate')
            }
        })

        useEffect(() => {
            if (open) {
                controls.start('openAnimate')
            } else {
                controls.start('closeAnimate')
            }
        }, [controls, open])

        return (
            <Button size="icon-sm" variant="ghost" onClick={toggleSidebar}>
                <div className={cn(className)} {...props}>
                    <svg
                        fill="none"
                        height={size}
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={strokeWidth}
                        viewBox="0 0 24 24"
                        width={size}
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <rect height="18" rx="2" width="18" x="3" y="3" />
                        <motion.path
                            animate={controls}
                            d="M9 7v10"
                            transition={DEFAULT_TRANSITION}
                            variants={PATH_VARIANTS}
                        />
                    </svg>
                </div>
            </Button>
        )
    }
)

SidebarTrigger.displayName = 'SidebarTrigger'

export { SidebarTrigger }
