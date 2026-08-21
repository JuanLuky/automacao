"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Bot, MessageCirclePlus, Phone, X } from "lucide-react";
import { Button } from "./Button";
import { formatDateTime } from "@/lib/time";
import type { BotSession } from "@/types";

interface BotSessionModalProps {
  sessao: BotSession | null;
  onClose: () => void;
  /** Segue pro mesmo fluxo do botão "Atender" da lista — abre o modal de
   * iniciar conversa com telefone e nome (pushName do WhatsApp) já
   * preenchidos. */
  onAtender: (sessao: BotSession) => void;
}

/**
 * Preview somente-leitura do que a pessoa escreveu presa no menu, sem
 * "Atender" — bot session não é uma Conversation ainda (ver CLAUDE.md,
 * "Aba Bot"), então não existe chat pra abrir. Antes disso não tinha jeito
 * de ver a lista inteira: a linha da aba Bot só mostra a última mensagem
 * truncada, e a única ação disponível já criava/assumia o atendimento.
 */
export function BotSessionModal({ sessao, onClose, onAtender }: BotSessionModalProps) {
  useEffect(() => {
    if (!sessao) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sessao, onClose]);

  if (!sessao) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bot-session-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-abyss-900/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-md animate-queue-in flex-col rounded-xl border border-app bg-raised p-6 shadow-panel"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-waiting/12 text-waiting">
            <Bot size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="bot-session-title"
              className="truncate font-display text-base font-semibold text-primary"
            >
              {sessao.nome || sessao.telefone}
            </h2>
            {sessao.nome && (
              <p className="mt-0.5 flex items-center gap-1.5 text-[0.75rem] text-muted">
                <Phone size={12} className="shrink-0" />
                {sessao.telefone}
              </p>
            )}
            <p className="mt-1 text-[0.8125rem] text-secondary">
              {sessao.tentativas > 1
                ? `${sessao.tentativas} mensagens sem escolher setor`
                : "Ainda não escolheu um setor"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-sunken hover:text-primary"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl bg-sunken p-3">
          {sessao.mensagens.length === 0 ? (
            <p className="px-1 py-4 text-center text-[0.8125rem] text-muted">
              Nenhuma mensagem de texto registrada (só mídia sem legenda).
            </p>
          ) : (
            sessao.mensagens.map((m, i) =>
              m.origem === "bot" ? (
                // Menu (re)enviado pelo bot — centralizado, sem virar
                // bolha de cliente (mesmo tratamento do ConversaPanel pra
                // mensagem de sistema).
                <div key={i} className="flex justify-center">
                  <span className="max-w-[90%] whitespace-pre-wrap rounded-xl bg-raised px-3.5 py-2 text-center text-[0.75rem] leading-relaxed text-muted">
                    {m.texto}
                  </span>
                </div>
              ) : (
                <div
                  key={i}
                  className="max-w-[85%] rounded-xl rounded-bl-sm bg-raised px-3 py-2 shadow-sm"
                >
                  <p className="whitespace-pre-wrap text-[0.8125rem] leading-snug text-primary">
                    {m.texto}
                  </p>
                  <p className="mt-1 text-[0.6875rem] text-muted">
                    {formatDateTime(m.criado_em)}
                  </p>
                </div>
              ),
            )
          )}
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2.5">
          <Button
            type="button"
            variant="ghost"
            className="!px-4 !py-2.5 text-[0.8125rem]"
            onClick={onClose}
          >
            Fechar
          </Button>
          <Button
            type="button"
            className="!px-4 !py-2.5 text-[0.8125rem]"
            onClick={() => onAtender(sessao)}
          >
            <MessageCirclePlus size={15} />
            Atender
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
