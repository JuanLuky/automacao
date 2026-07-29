"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { MessageCircle, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSocketEvent } from "@/hooks/useSocketEvent";
import type { Message } from "@/types";

interface Toast {
  id: string;
  conversationId: string;
  clienteNome: string;
  mensagem: string;
}

interface NotificationsContextValue {
  unreadByConversation: Record<string, number>;
  clearUnread: (conversationId: string) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(
  undefined,
);

const TOAST_DURATION_MS = 6000;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [unreadByConversation, setUnreadByConversation] = useState<
    Record<string, number>
  >({});
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Abrir a conversa (pelo badge, pelo toast ou pela fila) limpa as duas coisas —
  // não faz sentido o toast continuar empilhado se o atendente já viu a mensagem.
  const clearUnread = useCallback((conversationId: string) => {
    setUnreadByConversation((atual) => {
      if (!atual[conversationId]) return atual;
      const { [conversationId]: _removido, ...resto } = atual;
      return resto;
    });
    setToasts((atual) => atual.filter((t) => t.conversationId !== conversationId));
  }, []);

  const dismissToast = useCallback((toastId: string) => {
    setToasts((atual) => atual.filter((t) => t.id !== toastId));
  }, []);

  // Notifica só mensagens de cliente em conversas que o próprio atendente
  // logado tem assumidas — evita alertar sobre atendimentos de outra pessoa.
  // Ignora também a conversa que já está aberta na tela (o chat já mostra ao vivo).
  useSocketEvent<Message>("nova_mensagem", (mensagem) => {
    if (mensagem.origem !== "cliente") return;
    if (!user || mensagem.conversa_atendente_id !== user.id) return;
    if (pathname === `/conversas/${mensagem.conversation_id}`) return;

    setUnreadByConversation((atual) => ({
      ...atual,
      [mensagem.conversation_id]: (atual[mensagem.conversation_id] ?? 0) + 1,
    }));

    setToasts((atual) => [
      ...atual,
      {
        id: mensagem.id,
        conversationId: mensagem.conversation_id,
        clienteNome: mensagem.cliente_nome || "Cliente",
        mensagem: mensagem.mensagem,
      },
    ]);

    setTimeout(() => dismissToast(mensagem.id), TOAST_DURATION_MS);
  });

  function handleToastClick(toast: Toast) {
    dismissToast(toast.id);
    router.push(`/conversas/${toast.conversationId}`);
  }

  return (
    <NotificationsContext.Provider value={{ unreadByConversation, clearUnread }}>
      {children}

      <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-full max-w-sm flex-col gap-2.5">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="animate-queue-in pointer-events-auto flex items-start gap-3 rounded-xl border border-app bg-raised p-4 shadow-lg shadow-black/10"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tide-500/15 text-tide-500">
              <MessageCircle size={15} />
            </span>

            <button
              type="button"
              onClick={() => handleToastClick(toast)}
              className="min-w-0 flex-1 text-left"
            >
              <p className="text-[0.8125rem] font-semibold text-primary">
                {toast.clienteNome} enviou uma nova mensagem
              </p>
              <p className="mt-0.5 truncate text-[0.8125rem] text-secondary">
                {toast.mensagem}
              </p>
            </button>

            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dispensar notificação"
              className="mt-0.5 shrink-0 rounded-lg p-1 text-muted transition-colors hover:bg-sunken hover:text-primary"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications precisa estar dentro de um NotificationsProvider");
  }
  return context;
}
