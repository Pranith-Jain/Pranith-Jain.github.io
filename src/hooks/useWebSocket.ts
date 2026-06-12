import { useState, useEffect, useCallback, useRef } from 'react';

export type WebSocketState = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface UseWebSocketOptions<T> {
  onMessage?: (data: T) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (e: Event) => void;
  reconnect?: boolean;
  reconnectIntervalMs?: number;
  maxReconnectAttempts?: number;
  protocols?: string | string[];
}

export interface UseWebSocketReturn<T> {
  socket: WebSocket | null;
  send: (data: unknown) => void;
  readyState: number;
  state: WebSocketState;
  connected: boolean;
  reconnect: () => void;
  lastMessage: T | null;
}

export function useWebSocket<T = unknown>(
  url: string | null,
  options: UseWebSocketOptions<T> = {}
): UseWebSocketReturn<T> {
  const {
    onMessage,
    onOpen,
    onClose,
    onError,
    reconnect = true,
    reconnectIntervalMs = 1000,
    maxReconnectAttempts = 10,
    protocols,
  } = options;

  const [state, setState] = useState<WebSocketState>(url ? 'connecting' : 'closed');
  const [lastMessage, setLastMessage] = useState<T | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const callbacksRef = useRef({ onMessage, onOpen, onClose, onError });
  callbacksRef.current = { onMessage, onOpen, onClose, onError };

  const cleanup = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (socketRef.current) {
      socketRef.current.onopen = null;
      socketRef.current.onmessage = null;
      socketRef.current.onclose = null;
      socketRef.current.onerror = null;
      if (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING) {
        socketRef.current.close();
      }
      socketRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!url || !mountedRef.current) return;
    cleanup();

    setState(reconnectAttempts.current > 0 ? 'reconnecting' : 'connecting');

    const ws = protocols ? new WebSocket(url, protocols) : new WebSocket(url);
    socketRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      reconnectAttempts.current = 0;
      setState('open');
      callbacksRef.current.onOpen?.();
    };

    ws.onmessage = (e) => {
      if (!mountedRef.current) return;
      let parsed: T;
      try {
        parsed = JSON.parse(e.data) as T;
      } catch {
        parsed = e.data as T;
      }
      setLastMessage(parsed);
      callbacksRef.current.onMessage?.(parsed);
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setState('closed');
      callbacksRef.current.onClose?.();

      if (reconnect && reconnectAttempts.current < maxReconnectAttempts) {
        const delay = Math.min(reconnectIntervalMs * 2 ** reconnectAttempts.current, 30_000);
        reconnectAttempts.current++;
        setState('reconnecting');
        reconnectTimer.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = (e) => {
      if (!mountedRef.current) return;
      callbacksRef.current.onError?.(e);
    };
  }, [url, protocols, reconnect, reconnectIntervalMs, maxReconnectAttempts, cleanup]);

  useEffect(() => {
    mountedRef.current = true;
    if (url) connect();
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [url, connect, cleanup]);

  const send = useCallback((data: unknown) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }, []);

  const manualReconnect = useCallback(() => {
    reconnectAttempts.current = 0;
    connect();
  }, [connect]);

  return {
    socket: socketRef.current,
    send,
    readyState: socketRef.current?.readyState ?? WebSocket.CLOSED,
    state,
    connected: state === 'open',
    reconnect: manualReconnect,
    lastMessage,
  };
}
