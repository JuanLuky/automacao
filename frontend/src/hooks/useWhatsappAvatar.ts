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

  useEffect(() => {
    let cancelado = false;
    setNome(null);
    setFotoUrl(null);

    if (!EVOLUTION_INSTANCE) return;

    getConversationWhatsappInfo(conversationId, EVOLUTION_INSTANCE)
      .then((info) => {
        if (cancelado) return;
        setNome(info.nome);
        setFotoUrl(info.foto_url);
      })
      .catch(() => {
        // silencioso — avatar/nome do WhatsApp é adorno, não bloqueia a tela
      });

    return () => {
      cancelado = true;
    };
  }, [conversationId]);

  return { nome, fotoUrl };
}
