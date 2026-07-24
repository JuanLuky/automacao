"use client";

import { useEffect, useRef } from "react";
import { getSocket } from "@/lib/socket";

/**
 * Assina um evento do socket pelo tempo de vida do componente.
 * Usa ref para o handler não precisar ser memoizado pelo chamador.
 */
export function useSocketEvent<T = unknown>(
  event: string,
  handler: (payload: T) => void,
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const socket = getSocket();
    const listener = (payload: T) => handlerRef.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [event]);
}
