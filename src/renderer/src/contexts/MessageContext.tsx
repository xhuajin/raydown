import React, {
    createContext,
    useContext,
    useCallback,
    useRef,
    useState,
} from "react";

export type MessageType = "success" | "error" | "warning" | "info";

export interface AppMessage {
    id: number;
    text: string;
    type: MessageType;
}

interface MessageContextType {
    /** 当前唯一活跃的消息，无则为 null */
    activeMessage: AppMessage | null;
    /** 全局展示一条消息，覆盖当前消息，并在 durationMs 后自动消失 */
    pushMessage: (text: string, type?: MessageType, durationMs?: number) => void;
    /** 立即清除当前消息 */
    dismissMessage: () => void;
}

const MessageContext = createContext<MessageContextType | undefined>(undefined);

const DEFAULT_DURATION = 4000;

export function MessageProvider({ children }: { children: React.ReactNode }) {
    const [activeMessage, setActiveMessage] = useState<AppMessage | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const idRef = useRef(0);

    const clearTimer = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const dismissMessage = useCallback(() => {
        clearTimer();
        setActiveMessage(null);
    }, [clearTimer]);

    const pushMessage = useCallback(
        (
            text: string,
            type: MessageType = "info",
            durationMs = DEFAULT_DURATION,
        ) => {
            clearTimer(); // 新消息覆盖旧的，重置计时
            const message: AppMessage = { id: ++idRef.current, text, type };
            setActiveMessage(message);
            // 仅当仍是这条消息时才清除，避免被更新一条（更新前的）消息误清
            timerRef.current = setTimeout(
                () =>
                    setActiveMessage((cur) =>
                        cur?.id === message.id ? null : cur,
                    ),
                durationMs,
            );
        },
        [clearTimer],
    );

    return (
        <MessageContext.Provider
            value={{ activeMessage, pushMessage, dismissMessage }}
        >
            {children}
        </MessageContext.Provider>
    );
}

export function useMessage(): MessageContextType {
    const ctx = useContext(MessageContext);
    if (!ctx) throw new Error("useMessage 必须在 MessageProvider 内部使用");
    return ctx;
}