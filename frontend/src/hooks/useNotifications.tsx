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
import { useVerTodosSetores } from "@/hooks/useVerTodosSetores";
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
  /**
   * O inbox (/atendimentos) chama isso sempre que a conversa selecionada
   * muda — permite suprimir toast/badge da conversa que já está visível
   * na tela, mesmo sem trocar de rota (a checagem antiga comparava
   * pathname com "/conversas/:id", que nunca bate dentro do inbox, já que
   * ele fica sempre em "/atendimentos"). `null` quando nenhuma conversa
   * está selecionada/a tela foi desmontada.
   */
  marcarConversaAberta: (conversationId: string | null) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(
  undefined,
);

const TOAST_DURATION_MS = 6000;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { verTodos } = useVerTodosSetores();
  const isAdmin = user?.role === "admin";
  const isSupervisor = user?.role === "supervisor";
  const podeVerTodos = isAdmin || (isSupervisor && verTodos);

  const [unreadByConversation, setUnreadByConversation] = useState<
    Record<string, number>
  >({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [conversaAbertaId, setConversaAbertaId] = useState<string | null>(null);

  const marcarConversaAberta = useCallback((conversationId: string | null) => {
    setConversaAbertaId(conversationId);
  }, []);

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

  // Decide se a mensagem interessa ao atendente logado, por status/tipo da
  // conversa (ver campos novos em MessagesService.create):
  // - grupo: interessa a todos (aba Grupos é aberta a todo mundo).
  // - em_atendimento: só quem tem a conversa assumida (senão notificaria
  //   sobre atendimento de outra pessoa).
  // - aguardando: só quem vê aquele setor na fila (admin/supervisor com
  //   "ver todos" liberado, ou atendente do próprio setor).
  // - qualquer outro status (finalizado, transferido): não notifica.
  function ehRelevante(mensagem: Message): boolean {
    if (!user) return false;
    if (mensagem.conversa_tipo === "grupo") return true;
    if (mensagem.conversa_status === "em_atendimento") {
      return mensagem.conversa_atendente_id === user.id;
    }
    if (mensagem.conversa_status === "aguardando") {
      if (podeVerTodos) return true;
      return (
        !!user.departamento_id &&
        mensagem.conversa_departamento_id === user.departamento_id
      );
    }
    return false;
  }

  // Ignora a conversa que já está aberta na tela (o chat já mostra ao
  // vivo) — tanto a rota autônoma /conversas/:id quanto a conversa
  // selecionada dentro do inbox /atendimentos (ver marcarConversaAberta).
  useSocketEvent<Message>("nova_mensagem", (mensagem) => {
    if (mensagem.origem !== "cliente") return;
    if (!ehRelevante(mensagem)) return;
    if (pathname === `/conversas/${mensagem.conversation_id}`) return;
    if (conversaAbertaId === mensagem.conversation_id) return;

    setUnreadByConversation((atual) => ({
      ...atual,
      [mensagem.conversation_id]: (atual[mensagem.conversation_id] ?? 0) + 1,
    }));

    // Em grupo, "cliente_nome" normalmente vem vazio (nome do grupo não é
    // buscado na criação, ver CLAUDE.md) — prefere mostrar quem escreveu
    // dentro do grupo (remetente_nome/telefone) a um genérico "Cliente".
    const nomeExibido =
      mensagem.cliente_nome ||
      mensagem.remetente_nome ||
      mensagem.remetente_telefone ||
      "Cliente";

    setToasts((atual) => [
      ...atual,
      {
        id: mensagem.id,
        conversationId: mensagem.conversation_id,
        clienteNome: nomeExibido,
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
    <NotificationsContext.Provider
      value={{ unreadByConversation, clearUnread, marcarConversaAberta }}
    >
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
