"use client";

import { useEffect, useState } from "react";
import { EVOLUTION_INSTANCE, getConversationWhatsappInfo } from "@/lib/api";

// Busca nome (só relevante pra grupo — conversa 1:1 já tem cliente_nome
// salvo desde a criação)/foto de perfil ao vivo do WhatsApp pra uma
// conversa. Nunca cacheado além do ciclo de vida do componente — mesmo
// espírito de "Contatos do WhatsApp" (ver ContactsController no backend):
// busca de novo a cada montagem, sem persistir. Falha silenciosamente
// (fica sem foto) se a Evolution API não responder — não é crítico pra
// exibição, só um adorno visual.
export function useWhatsappAvatar(conversationId: string) {
  const [nome, setNome] = useState<string | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  // true enquanto a chamada à Evolution API não voltou — usado pra mostrar
  // um skeleton em vez de piscar "Grupo sem nome"/ícone genérico por alguns
  // segundos (a chamada real à Evolution API não é instantânea).
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    setNome(null);
    setFotoUrl(null);
    setIsLoading(Boolean(EVOLUTION_INSTANCE));

    if (!EVOLUTION_INSTANCE) return;

    getConversationWhatsappInfo(conversationId, EVOLUTION_INSTANCE)
      .then((info) => {
        if (cancelado) return;
        setNome(info.nome);
        setFotoUrl(info.foto_url);
      })
      .catch(() => {
        // silencioso — avatar/nome do WhatsApp é adorno, não bloqueia a tela
      })
      .finally(() => {
        if (!cancelado) setIsLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [conversationId]);

  return { nome, fotoUrl, isLoading };
}
