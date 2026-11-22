'use client'

import * as React from 'react'
import { Switch as SwitchPrimitive } from '@base-ui/react/switch'

import { cn } from '@renderer/lib/utils'

/** shadcn 风格的 Switch（@base-ui/react Switch 封装） */
function Switch({ className, ...props }: SwitchPrimitive.Root.Props): React.ReactElement {
    return (
        <SwitchPrimitive.Root
            data-slot="switch"
            className={cn(
                'peer data-checked:bg-primary data-unchecked:bg-input focus-visible:ring-ring/50 inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
                className
            )}
            {...props}
        >
            <SwitchPrimitive.Thumb
                data-slot="switch-thumb"
                className={cn(
                    'bg-background pointer-events-none block size-4 rounded-full ring-0 shadow-sm transition-transform data-checked:translate-x-[calc(100%-2px)] data-unchecked:translate-x-0'
                )}
            />
        </SwitchPrimitive.Root>
    )
}

export { Switch }
