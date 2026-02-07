import { useMemo, useCallback, useRef, useEffect } from "react";
import type { StreamMessage } from "../types";
import type { ClientEvent } from "../types";
import { useAppStore } from "../store/useAppStore";

export interface IndexedMessage {
    originalIndex: number;
    message: StreamMessage;
}

export interface MessageWindowState {
    visibleMessages: IndexedMessage[];
    hasMoreHistory: boolean;
    isLoadingHistory: boolean;
    isAtBeginning: boolean;
    loadMoreMessages: () => void;
    totalMessages: number;
}

export function useMessageWindow(
    sendEvent: (event: ClientEvent) => void,
    activeSessionId: string | null,
): MessageWindowState {
    const session = useAppStore((s) => activeSessionId ? s.sessions[activeSessionId] : undefined);
    const setLoadingPage = useAppStore((s) => s.setLoadingPage);
    const prevSessionIdRef = useRef<string | null>(null);

    // Reset on session change
    useEffect(() => {
        prevSessionIdRef.current = activeSessionId;
    }, [activeSessionId]);

    // Combine rest + stream messages for display
    const displayMessages = useMemo((): IndexedMessage[] => {
        if (!session) return [];
        const all = [...session.restMessages, ...session.streamMessages];
        return all.map((message, idx) => ({ originalIndex: idx, message }));
    }, [session?.restMessages, session?.streamMessages]);

    const hasMoreHistory = session?.hasMore ?? false;
    const isLoadingHistory = session?.isLoadingPage ?? false;

    const loadMoreMessages = useCallback(() => {
        if (!activeSessionId || !session?.cursor || !hasMoreHistory || isLoadingHistory) return;
        setLoadingPage(activeSessionId, true);
        sendEvent({
            type: "session.history",
            payload: { sessionId: activeSessionId, before: session.cursor },
        });
    }, [activeSessionId, session?.cursor, hasMoreHistory, isLoadingHistory, sendEvent, setLoadingPage]);

    return {
        visibleMessages: displayMessages,
        hasMoreHistory,
        isLoadingHistory,
        isAtBeginning: !hasMoreHistory && displayMessages.length > 0,
        loadMoreMessages,
        totalMessages: displayMessages.length,
    };
}
