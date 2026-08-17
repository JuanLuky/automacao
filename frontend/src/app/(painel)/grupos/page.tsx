"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessagesSquare,
  Search,
  AlertCircle,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useSocketEvent } from "@/hooks/useSocketEvent";
import { useWhatsappAvatar } from "@/hooks/useWhatsappAvatar";
import { getConversationsPaginado, normalizeError } from "@/lib/api";
import { formatRelativeTime } from "@/lib/time";
import type { Conversation } from "@/types";

const POR_PAGINA = 5;

// JID do grupo (ex: "120363012345678901@g.us") — só o número interessa
// pra exibição na lista, o "@g.us" é implementação da Evolution API.
function formatarIdentificadorGrupo(telefone: string): string {
  return telefone.split("@")[0];
}

interface GrupoItemProps {
  conversa: Conversation;
  onAbrir: () => void;
}

// Busca nome + foto ao vivo do WhatsApp por linha (ver useWhatsappAvatar) —
// cliente_nome do grupo costuma ficar vazio (não era buscado na criação,
// ver "Avatares" no CLAUDE.md), então o nome vindo da API é o fallback
// principal aqui, não só um adorno.
function GrupoItem({ conversa: c, onAbrir }: GrupoItemProps) {
  const { nome, fotoUrl } = useWhatsappAvatar(c.id);
  const nomeExibido = c.cliente_nome || nome || "Grupo sem nome";

  return (
    <li className="animate-queue-in rounded-xl border border-app bg-raised p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar src={fotoUrl} alt={nomeExibido} tipo="grupo" />
          <div className="min-w-0">
            <span className="font-semibold text-primary">{nomeExibido}</span>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-secondary">
              <span className="flex items-center gap-1">
                <MessagesSquare size={13} />
                {formatarIdentificadorGrupo(c.telefone)}
              </span>
              <span>{formatRelativeTime(c.criado_em)}</span>
            </div>
          </div>
        </div>

        <Button variant="ghost" className="!px-4 !py-2 text-[0.8125rem]" onClick={onAbrir}>
          Abrir
        </Button>
      </div>
    </li>
  );
}

export default function GruposPage() {
  const router = useRouter();
  const [conversas, setConversas] = useState<Conversation[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setBuscaDebounced(busca.trim()), 400);
    return () => clearTimeout(timer);
  }, [busca]);

  useEffect(() => {
    setPagina(1);
  }, [buscaDebounced]);

  const carregar = useCallback(async () => {
    setIsLoading(true);
    setErro(null);
    try {
      const { dados, total } = await getConversationsPaginado({
        tipo: "grupo",
        busca: buscaDebounced || undefined,
        pagina,
        por_pagina: POR_PAGINA,
      });
      setConversas(dados);
      setTotal(total);

      const totalPaginasAtual = Math.max(1, Math.ceil(total / POR_PAGINA));
      if (pagina > totalPaginasAtual) {
        setPagina(totalPaginasAtual);
      }
    } catch (error) {
      setErro(normalizeError(error).message);
    } finally {
      setIsLoading(false);
    }
  }, [buscaDebounced, pagina]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  // Mesmo padrão da fila: qualquer mensagem/conversa nova recarrega a
  // lista respeitando o filtro de busca atual.
  useSocketEvent("nova_conversa", carregar);
  useSocketEvent("nova_mensagem", carregar);

  return (
    <div>
      <header className="mb-8">
        <p className="text-eyebrow font-semibold uppercase text-tide-500">Atendimento</p>
        <h1 className="mt-2 font-display text-display-md font-semibold text-primary">Grupos</h1>
        <p className="mt-2 text-[0.875rem] text-secondary">
          Grupos do WhatsApp em que este número está presente — sem fila, aberto a qualquer setor.
        </p>
      </header>

      <div className="mb-6 max-w-sm">
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome do grupo..."
            className="w-full rounded-xl border border-app bg-sunken py-2.5 pl-10 pr-4 text-[0.875rem] text-primary placeholder:text-muted/60 focus:border-tide-500 focus:bg-raised focus:outline-none focus:ring-4 focus:ring-tide-500/12"
          />
        </div>
      </div>

      {erro && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-alert/35 bg-alert/8 px-4 py-3">
          <AlertCircle size={17} className="mt-px shrink-0 text-alert" aria-hidden="true" />
          <p className="text-[0.875rem] leading-snug text-primary">{erro}</p>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="animate-spin text-tide-500" />
        </div>
      ) : conversas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-app py-16 text-center">
          <MessagesSquare size={22} className="text-muted" />
          <p className="text-[0.875rem] text-secondary">
            Nenhum grupo encontrado.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {conversas.map((c) => (
            <GrupoItem key={c.id} conversa={c} onAbrir={() => router.push(`/conversas/${c.id}`)} />
          ))}
        </ul>
      )}

      {!isLoading && total > POR_PAGINA && (
        <div className="mt-6 flex items-center justify-between gap-4">
          <p className="text-[0.8125rem] text-secondary">
            Página {pagina} de {totalPaginas} · {total} grupos
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="!px-3 !py-2 text-[0.8125rem]"
              disabled={pagina <= 1}
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={15} />
              Anterior
            </Button>
            <Button
              variant="ghost"
              className="!px-3 !py-2 text-[0.8125rem]"
              disabled={pagina >= totalPaginas}
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
            >
              Próxima
              <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
