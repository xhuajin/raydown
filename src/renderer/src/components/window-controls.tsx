import { Minus, Pin, X } from 'lucide-react'
import { memo, useCallback, useMemo, useState } from 'react'

import { cn } from '@renderer/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@renderer/components/ui/tooltip'

const { electronAPI } = window

function WindowControls() {
    const [pinned, setPinned] = useState(false)

    const togglePin = useCallback(async () => {
        setPinned(await electronAPI.togglePin())
    }, [])

    const minimize = useCallback(() => electronAPI.minimize(), [])
    // const maximize = useCallback(() => electronAPI.maximize(), [])
    const close = useCallback(() => electronAPI.close(), [])

    const pinButton = useMemo(
        () => ({
            title: pinned ? '取消置顶' : '置顶',
            className: cn(
                'h-full w-10 flex items-center justify-center transition-colors hover:bg-foreground/10',
                pinned ? 'text-foreground/75' : 'text-foreground/40'
            ),
            iconClassName: pinned ? 'fill-current' : ''
        }),
        [pinned]
    )

    return (
        <div className="flex h-full">
            <Tooltip>
                <TooltipTrigger
                    render={
                        <button
                            className={pinButton.className}
                            title={pinButton.title}
                            onClick={togglePin}
                        >
                            <Pin size={14} className={pinButton.iconClassName} />
                        </button>
                    }
                />
                <TooltipContent>
                    <p>{pinButton.title}</p>
                </TooltipContent>
            </Tooltip>

            <button
                className="h-full w-10 flex items-center justify-center transition-colors text-foreground/40 hover:bg-foreground/10"
                onClick={minimize}
            >
                <Minus size={16} />
            </button>

            {/* <button
                className="h-full w-10 flex items-center justify-center transition-colors text-foreground/40 hover:bg-foreground/10"
                onClick={maximize}
            >
                <Square size={14} />
            </button> */}

            <button
                className="h-full w-10 flex items-center justify-center transition-colors text-foreground/40 hover:bg-red-700 hover:text-white"
                onClick={close}
            >
                <X size={16} />
            </button>
        </div>
    )
}

export default memo(WindowControls)
