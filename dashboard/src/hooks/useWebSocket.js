import { useCallback, useEffect, useRef, useState } from "react";

function useWebSocket(urlFactory, { onMessage } = {}) {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const wsRef = useRef(null);
  const reconnectDelayRef = useRef(1000);
  const reconnectTimerRef = useRef(null);
  const closedByUnmountRef = useRef(false);

  const connect = useCallback(() => {
    const url = typeof urlFactory === "function" ? urlFactory() : urlFactory;
    if (!url) return;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => {
      setConnected(true);
      reconnectDelayRef.current = 1000;
    };
    ws.onclose = () => {
      setConnected(false);
      if (closedByUnmountRef.current) return;
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30_000);
      reconnectTimerRef.current = window.setTimeout(() => {
        connect();
      }, delay);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        setLastMessage(data);
        onMessage?.(data);
      } catch {
        setLastMessage(ev.data);
      }
    };
  }, [urlFactory, onMessage]);

  useEffect(() => {
    closedByUnmountRef.current = false;
    connect();
    return () => {
      closedByUnmountRef.current = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected, lastMessage, wsRef };
}

export { useWebSocket };
export default useWebSocket;
