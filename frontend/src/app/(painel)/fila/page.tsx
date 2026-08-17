"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  Phone,
  Search,
  User as UserIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Select } from "@/components/ui/Select";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Switch } from "@/components/ui/Switch";
import { useAuth } from "@/hooks/useAuth";
import { useDepartments } from "@/hooks/useDepartments";
import { useNotifications } from "@/hooks/useNotifications";
import { useSocketEvent } from "@/hooks/useSocketEvent";
import { useVerTodosSetores } from "@/hooks/useVerTodosSetores";
import { useWhatsappAvatar } from "@/hooks/useWhatsappAvatar";
import {
  assumeConversation,
  EVOLUTION_INSTANCE,
  getConversationsPaginado,
  normalizeError,
  sendMessage,
} from "@/lib/api";
import { mensagemAutomaticaAssumir } from "@/lib/quickReplies";
import { formatRelativeTime } from "@/lib/time";
import type { Conversation, ConversationStatus } from "@/types";

const TABS: { status: ConversationStatus; label: string }[] = [
  { status: "aguardando", label: "Na fila" },
  { status: "em_atendimento", label: "Em atendimento" },
  { status: "finalizado", label: "Finalizadas" },
];

interface ConversaItemProps {
  conversa: Conversation;
  tab: ConversationStatus;
  naoLidas: number;
  onAssumir: () => void;
  onAbrir: () => void;
}

// Componente próprio (em vez de inline no .map()) só pra poder chamar
// useWhatsappAvatar por linha — cada card busca sua própria foto ao vivo
// do WhatsApp, independente dos outros (ver "Avatares" no CLAUDE.md).
function ConversaItem({
  conversa: c,
  tab,
  naoLidas,
  onAssumir,
  onAbrir,
}: ConversaItemProps) {
  const { fotoUrl } = useWhatsappAvatar(c.id);

  return (
    <li className="animate-queue-in rounded-xl border border-app bg-raised p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar src={fotoUrl} alt={c.cliente_nome ?? "Cliente"} tipo="cliente" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-primary">
                {c.cliente_nome || "Cliente sem nome"}
              </span>
              {c.departamento && (
                <span className="text-eyebrow font-semibold uppercase text-tide-400">
                  {c.departamento.nome}
                </span>
              )}
              {naoLidas > 0 && (
                <span
                  className="flex h-5 min-w-5 items-center justify-center rounded-full bg-alert px-1.5 text-[0.6875rem] font-semibold text-white"
                  aria-label={`${naoLidas} mensagens não lidas`}
                >
                  {naoLidas}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-secondary">
              <span className="flex items-center gap-1">
                <Phone size={13} />
                {c.telefone}
              </span>
              <span>{formatRelativeTime(c.criado_em)}</span>
              {c.atendente && (
                <span className="flex items-center gap-1">
                  <UserIcon size={13} />
                  {c.atendente.nome}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <StatusBadge status={c.status} />
          {tab === "aguardando" ? (
            <Button
              variant="primary"
              className="!px-4 !py-2 text-[0.8125rem]"
              onClick={onAssumir}
            >
              Assumir
            </Button>
          ) : (
            <Button variant="ghost" className="!px-4 !py-2 text-[0.8125rem]" onClick={onAbrir}>
              Abrir
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

const POR_PAGINA = 5;

export default function FilaPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { departments } = useDepartments();
  const { unreadByConversation } = useNotifications();

  const isAdmin = user?.role === "admin";
  const isSupervisor = user?.role === "supervisor";
  const { verTodos, setVerTodos } = useVerTodosSetores();
  // Admin sempre vê tudo; supervisor só quando o toggle está ligado (ver
  // "Regras de negócio no frontend" no CLAUDE.md — confiança client-side,
  // mesmo padrão já usado pro admin).
  const podeVerTodos = isAdmin || (isSupervisor && verTodos);
  const [tab, setTab] = useState<ConversationStatus>("aguardando");
  const [departamentoId, setDepartamentoId] = useState("");
  const [conversas, setConversas] = useState<Conversation[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Modal de "Iniciar atendimento?" — pergunta se manda a mensagem de
  // apresentação automática ou não, em vez de mandar sempre sem perguntar
  // (comportamento antigo). "modo" identifica qual dos dois botões está em
  // andamento, pro spinner aparecer no botão certo.
  const [iniciandoConversa, setIniciandoConversa] = useState<Conversation | null>(null);
  const [modoIniciar, setModoIniciar] = useState<"com_mensagem" | "sem_mensagem" | null>(null);

  // Busca só faz sentido na aba "Finalizadas" — nas outras a lista já é
  // pequena o bastante pra não precisar filtrar.
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setBuscaDebounced(busca.trim()), 400);
    return () => clearTimeout(timer);
  }, [busca]);

  const semSetor = !podeVerTodos && !user?.departamento_id;
  const filtroDepartamento = podeVerTodos ? departamentoId || undefined : user?.departamento_id;
  const isFinalizadas = tab === "finalizado";

  // Trocar de aba ou de filtro invalida a página atual — sempre volta pra 1.
  useEffect(() => {
    setPagina(1);
  }, [tab, filtroDepartamento, buscaDebounced, dataInicio, dataFim]);

  const carregar = useCallback(async () => {
    if (semSetor) {
      setConversas([]);
      setTotal(0);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErro(null);
    try {
      const { dados, total } = await getConversationsPaginado({
        status: tab,
        departamento_id: filtroDepartamento,
        pagina,
        por_pagina: POR_PAGINA,
        ...(isFinalizadas
          ? {
              busca: buscaDebounced || undefined,
              data_inicio: dataInicio || undefined,
              data_fim: dataFim || undefined,
            }
          : {}),
      });
      setConversas(dados);
      setTotal(total);

      // Uma conversa pode sair da lista entre um carregamento e outro (ex:
      // outro atendente assumiu enquanto esta página estava aberta) — se a
      // página atual ficou fora do intervalo válido, volta pra última página
      // que ainda existe em vez de mostrar uma tela vazia enganosa.
      const totalPaginasAtual = Math.max(1, Math.ceil(total / POR_PAGINA));
      if (pagina > totalPaginasAtual) {
        setPagina(totalPaginasAtual);
      }
    } catch (error) {
      setErro(normalizeError(error).message);
    } finally {
      setIsLoading(false);
    }
  }, [tab, filtroDepartamento, semSetor, isFinalizadas, buscaDebounced, dataInicio, dataFim, pagina]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  // Primeiro teste de ponta a ponta do WebSocket: qualquer mudança relevante
  // de conversa recarrega a lista respeitando os filtros atuais.
  useSocketEvent("nova_conversa", carregar);
  useSocketEvent("conversa_atualizada", carregar);
  useSocketEvent("conversa_finalizada", carregar);

  async function handleConfirmarIniciar(comMensagem: boolean) {
    if (!iniciandoConversa) return;
    const id = iniciandoConversa.id;

    setModoIniciar(comMensagem ? "com_mensagem" : "sem_mensagem");
    setErro(null);
    try {
      await assumeConversation(id);
      if (comMensagem) {
        // Best-effort: mesmo se o envio da mensagem de abertura falhar (ex:
        // WhatsApp fora do ar), o atendimento já foi assumido e a
        // navegação segue normalmente.
        try {
          await sendMessage(id, {
            origem: "atendente",
            mensagem: mensagemAutomaticaAssumir(user?.nome ?? ""),
            instance: EVOLUTION_INSTANCE,
          });
        } catch {
          // ignora — não bloqueia a navegação
        }
      }
      router.push(`/conversas/${id}`);
    } catch (error) {
      setErro(normalizeError(error).message);
      carregar();
    } finally {
      setModoIniciar(null);
      setIniciandoConversa(null);
    }
  }

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow font-semibold uppercase text-tide-500">Atendimento</p>
          <h1 className="mt-2 font-display text-display-md font-semibold text-primary">Fila</h1>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {isSupervisor && (
            <label className="flex items-center gap-2.5 text-[0.8125rem] text-secondary">
              <Switch checked={verTodos} onChange={setVerTodos} label="Ver todos os setores" />
              Ver todos os setores
            </label>
          )}
          {podeVerTodos && (
            <div className="w-full max-w-[240px] sm:w-auto">
              <Select
                aria-label="Filtrar por setor"
                value={departamentoId}
                onChange={(e) => setDepartamentoId(e.target.value)}
              >
                <option value="">Todos os setores</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
      </header>

      <div className="mb-6 flex gap-1 border-b border-app">
        {TABS.map(({ status, label }) => (
          <button
            key={status}
            type="button"
            onClick={() => setTab(status)}
            className={`relative px-4 py-3 text-[0.875rem] font-medium transition-colors ${
              tab === status ? "text-primary" : "text-muted hover:text-secondary"
            }`}
          >
            {label}
            {tab === status && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-tide-500" />
            )}
          </button>
        ))}
      </div>

      {isFinalizadas && (
        <div className="mb-6 flex flex-wrap items-end gap-3">
          <div className="relative min-w-[220px] flex-1">
            <label className="mb-2 block text-eyebrow font-semibold uppercase text-muted">
              Cliente
            </label>
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
                placeholder="Nome ou telefone..."
                className="w-full rounded-xl border border-app bg-sunken py-2.5 pl-10 pr-4 text-[0.875rem] text-primary placeholder:text-muted/60 focus:border-tide-500 focus:bg-raised focus:outline-none focus:ring-4 focus:ring-tide-500/12"
              />
            </div>
          </div>
          <div>
            <label className="mb-2 block text-eyebrow font-semibold uppercase text-muted">De</label>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="rounded-xl border border-app bg-sunken px-3.5 py-2.5 text-[0.875rem] text-primary focus:border-tide-500 focus:bg-raised focus:outline-none focus:ring-4 focus:ring-tide-500/12"
            />
          </div>
          <div>
            <label className="mb-2 block text-eyebrow font-semibold uppercase text-muted">Até</label>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="rounded-xl border border-app bg-sunken px-3.5 py-2.5 text-[0.875rem] text-primary focus:border-tide-500 focus:bg-raised focus:outline-none focus:ring-4 focus:ring-tide-500/12"
            />
          </div>
        </div>
      )}

      {semSetor && (
        <div className="flex items-start gap-2.5 rounded-xl border border-alert/35 bg-alert/8 px-4 py-3">
          <AlertCircle size={17} className="mt-px shrink-0 text-alert" aria-hidden="true" />
          <p className="text-[0.875rem] leading-snug text-primary">
            Você não está associado a nenhum setor. Fale com o administrador.
          </p>
        </div>
      )}

      {erro && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-alert/35 bg-alert/8 px-4 py-3">
          <AlertCircle size={17} className="mt-px shrink-0 text-alert" aria-hidden="true" />
          <p className="text-[0.875rem] leading-snug text-primary">{erro}</p>
        </div>
      )}

      {!semSetor && isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="animate-spin text-tide-500" />
        </div>
      ) : !semSetor && conversas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-app py-16 text-center">
          <Inbox size={22} className="text-muted" />
          <p className="text-[0.875rem] text-secondary">
            {tab === "aguardando"
              ? "Nenhuma conversa esperando."
              : tab === "em_atendimento"
                ? "Nenhuma conversa em atendimento."
                : "Nenhuma conversa finalizada encontrada."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {conversas.map((c) => (
            <ConversaItem
              key={c.id}
              conversa={c}
              tab={tab}
              naoLidas={unreadByConversation[c.id] ?? 0}
              onAssumir={() => setIniciandoConversa(c)}
              onAbrir={() => router.push(`/conversas/${c.id}`)}
            />
          ))}
        </ul>
      )}

      {!semSetor && !isLoading && total > POR_PAGINA && (
        <div className="mt-6 flex items-center justify-between gap-4">
          <p className="text-[0.8125rem] text-secondary">
            Página {pagina} de {totalPaginas} · {total} conversas
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

      <ConfirmModal
        open={iniciandoConversa !== null}
        title="Iniciar atendimento?"
        description={`Você vai assumir a conversa com ${
          iniciandoConversa?.cliente_nome || "esse cliente"
        }. Pode começar com uma mensagem de apresentação automática, ou assumir sem enviar nada.`}
        confirmLabel="Iniciar com mensagem"
        secondaryLabel="Iniciar sem mensagem"
        cancelLabel="Cancelar"
        loading={modoIniciar === "com_mensagem"}
        secondaryLoading={modoIniciar === "sem_mensagem"}
        onConfirm={() => handleConfirmarIniciar(true)}
        onSecondary={() => handleConfirmarIniciar(false)}
        onCancel={() => setIniciandoConversa(null)}
      />
    </div>
  );
}
