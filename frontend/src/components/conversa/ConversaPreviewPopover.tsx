"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { getMessages, normalizeError } from "@/lib/api";
import { formatDateTime } from "@/lib/time";
import type { Message } from "@/types";

interface ConversaPreviewPopoverProps {
  conversationId: string;
  titulo: string;
  /** Posição em pixels (viewport), calculada a partir do retângulo da
   * linha em hover — usa position:fixed via portal pra não ser cortada
   * pelo scroll horizontal da lista (ver LinhaConversa). */
  top: number;
  left: number;
  /** Repassados pro elemento raiz — LinhaConversa usa isso pra manter o
   * preview aberto enquanto o mouse está em cima DELE (não só da linha),
   * senão dava pra rolar: o mouse saindo da linha em direção ao popover
   * fechava tudo no meio do caminho. */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const ALTURA_MAX = 360;

/**
 * Preview somente-leitura ao segurar o mouse sobre uma conversa em
 * "Atendendo" — clicar na linha já seleciona/abre a conversa (ver
 * handleSelecionar em page.tsx), então o hover é o gesto livre pra só
 * espiar as últimas mensagens sem trocar o painel principal.
 */
export function ConversaPreviewPopover({
  conversationId,
  titulo,
  top,
  left,
  onMouseEnter,
  onMouseLeave,
}: ConversaPreviewPopoverProps) {
  const [mensagens, setMensagens] = useState<Message[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelado = false;
    setMensagens(null);
    setErro(null);
    getMessages(conversationId)
      .then((dados) => {
        if (!cancelado) setMensagens(dados);
      })
      .catch((error) => {
        if (!cancelado) setErro(normalizeError(error).message);
      });
    return () => {
      cancelado = true;
    };
  }, [conversationId]);

  // Mostra sem cortar as mais recentes por padrão (a rolagem é pra ir
  // atrás das mais antigas, não o contrário).
  useEffect(() => {
    if (mensagens && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensagens]);

  // Ajusta o topo pra caixa nunca nascer cortada embaixo da viewport —
  // mesma ideia de um tooltip que "sobe" quando não cabe abaixo do cursor.
  const topAjustado = Math.min(top, window.innerHeight - ALTURA_MAX - 16);

  return createPortal(
    <div
      style={{ position: "fixed", top: Math.max(8, topAjustado), left }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="z-50 w-80 animate-queue-in overflow-hidden rounded-xl border border-app bg-raised shadow-panel"
    >
      <div className="border-b border-app px-3.5 py-2.5">
        <p className="truncate text-[0.8125rem] font-semibold text-primary">{titulo}</p>
      </div>
      <div
        ref={scrollRef}
        style={{ maxHeight: ALTURA_MAX - 44 }}
        className="space-y-2 overflow-y-auto p-3"
      >
        {erro ? (
          <p className="px-1 py-3 text-center text-[0.75rem] text-alert">{erro}</p>
        ) : mensagens === null ? (
          <div className="flex justify-center py-4">
            <Loader2 size={16} className="animate-spin text-tide-500" />
          </div>
        ) : mensagens.length === 0 ? (
          <p className="px-1 py-3 text-center text-[0.75rem] text-muted">
            Sem mensagens ainda.
          </p>
        ) : (
          mensagens.map((m) =>
            m.origem === "sistema" ? (
              <div key={m.id} className="flex justify-center">
                <span className="rounded-full bg-sunken px-2.5 py-0.5 text-[0.6875rem] text-muted">
                  {m.mensagem}
                </span>
              </div>
            ) : (
              <div
                key={m.id}
                className={`flex flex-col ${m.origem === "atendente" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-1.5 text-[0.75rem] leading-snug ${
                    m.origem === "atendente"
                      ? "bg-tide-500 text-abyss-900"
                      : "border border-app bg-sunken text-primary"
                  }`}
                >
                  {m.mensagem || <span className="italic opacity-70">[mídia]</span>}
                </div>
                <p className="mt-0.5 px-1 text-[0.625rem] text-muted">
                  {formatDateTime(m.criado_em)}
                </p>
              </div>
            ),
          )
        )}
      </div>
    </div>,
    document.body,
  );
}
