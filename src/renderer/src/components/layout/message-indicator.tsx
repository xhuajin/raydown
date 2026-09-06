import { cn } from '@renderer/lib/utils'
import { useMessage, type MessageType } from '../../contexts/MessageContext'

// 有消息时整条底栏的状态色向右渐隐背景（同色系，透明度低，不干扰右侧操作）
const BG_GRADIENT: Record<MessageType, string> = {
    success: 'bg-gradient-to-r from-emerald-500/20 to-transparent',
    error: 'bg-gradient-to-r from-red-500/20 to-transparent',
    warning: 'bg-gradient-to-r from-amber-500/20 to-transparent',
    info: 'bg-gradient-to-r from-sky-500/20 to-transparent'
}

// 各状态语义色（固定，不随主题切换）。背景/文字/圆点/光圈同一状态同色系。
const STATUS: Record<MessageType, Record<string, string>> = {
    success: {
        bg: 'bg-emerald-400',
        text: 'text-emerald-600 dark:text-emerald-400',
        dot: 'bg-emerald-500',
        ring: 'shadow-emerald-500'
    },
    error: {
        bg: 'bg-red-400',
        text: 'text-red-600 dark:text-red-400',
        dot: 'bg-red-500',
        ring: 'shadow-red-300'
    },
    warning: {
        bg: 'bg-amber-400',
        text: 'text-amber-600 dark:text-amber-400',
        dot: 'bg-amber-500',
        ring: 'shadow-amber-300'
    },
    info: {
        bg: 'bg-sky-400',
        text: 'text-sky-600 dark:text-sky-400',
        dot: 'bg-sky-500',
        ring: 'shadow-sky-300'
    }
} as const

export function MessageIndicator() {
    const { activeMessage } = useMessage()
    if (!activeMessage) return null

    const type = activeMessage?.type ?? 'info'
    const status = STATUS[type]

    return (
        <button
            type="button"
            title={activeMessage?.text}
            className={cn(
                'w-full h-10 flex items-center justify-start gap-2.5 z-10',
                BG_GRADIENT[type]
            )}
        >
            {/* 信号灯圆点 + 衍射光圈 */}
            <span className="relative flex size-1 ml-3.5 shrink-0 select-none">
                <span
                    className={cn(
                        'absolute inline-flex h-full w-full rounded-full opacity-60 shadow-[0_0_14px_6px]',
                        status.ring
                    )}
                />
                <span className={cn('relative inline-flex size-1 rounded-full', status.dot)} />
            </span>
            {/* 提示文字 */}
            <span
                className={cn('flex text-start line-clamp-1 w-full max-w-44 text-xs', status.text)}
            >
                {activeMessage?.text ?? '暂无消息'}
            </span>
        </button>
    )
}
