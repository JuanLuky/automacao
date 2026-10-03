import { io, type Socket } from "socket.io-client";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:3000";

let socket: Socket | null = null;

/** Conexão única compartilhada por toda a sessão do painel. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(WS_URL, {
      autoConnect: true,
      // Mesmo motivo do header em lib/api.ts (aviso do ngrok grátis) — vale
      // pro transporte polling, que abre a conexão antes do upgrade pra WS.
      extraHeaders: { "ngrok-skip-browser-warning": "true" },
    });
  }
  return socket;
}
