"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Bot,
  Inbox,
  Phone,
  X,
  Loader2,
  MessageCirclePlus,
  MessagesSquare,
  RotateCcw,
  Search,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { NovaConversaModal } from "@/components/ui/NovaConversaModal";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { TagBadge } from "@/components/ui/TagBadge";
import { ConversaPanel } from "@/components/conversa/ConversaPanel";
import { useAuth } from "@/hooks/useAuth";
import { useDepartments } from "@/hooks/useDepartments";
import { useNotifications } from "@/hooks/useNotifications";
import { useSocketEvent } from "@/hooks/useSocketEvent";
import { useTags } from "@/hooks/useTags";
import { useVerTodosSetores } from "@/hooks/useVerTodosSetores";
import { useWhatsappAvatar } from "@/hooks/useWhatsappAvatar";
import {
  assumeConversation,
  dismissBotSession,
  getBotSessions,
  getClientTags,
  getConversationsPaginado,
  normalizeError,
  reopenConversation,
} from "@/lib/api";
import { formatRelativeTime } from "@/lib/time";
import type { BotSession, Conversation, ConversationStatus, Tag } from "@/types";

// "grupos" não é status e sim outro tipo de conversa: grupo do WhatsApp
// não entra em fila, não é assumido e não tem setor (ver "Grupos" no
// CLAUDE.md). Fica como quarta aba porque, pro atendente, é só mais um
// lugar onde chega mensagem — separar numa página própria obrigava a
// trocar de tela pra ver se alguém falou no grupo.
// "bot" não é conversa ainda: é quem mandou a primeira mensagem, recebeu o
// menu e NÃO digitou número de setor nenhum. "grupos" é outro tipo de
// conversa (sem fila, sem setor). O resto são status de atendimento.
type Aba = ConversationStatus | "grupos" | "bot";

const TABS: { aba: Aba; label: string }[] = [
  { aba: "bot", label: "Bot" },
  { aba: "aguardando", label: "Na fila" },
  { aba: "em_atendimento", label: "Atendendo" },
  { aba: "finalizado", label: "Finalizadas" },
  { aba: "grupos", label: "Grupos" },
];

// Inbox carrega mais que a fila paginada (5): a coluna é rolável, então
// vale trazer uma página cheia de uma vez em vez de obrigar a paginar a
// cada meia dúzia de conversas.
const POR_PAGINA = 30;

interface LinhaProps {
  conversa: Conversation;
  selecionada: boolean;
  naoLidas: number;
  tags: Tag[];
  onSelecionar: () => void;
}

// Linha densa do inbox — componente próprio (não inline no .map) só pra
// poder chamar useWhatsappAvatar por linha, mesmo motivo do ConversaItem
// da /fila.
function LinhaConversa({
  conversa: c,
  selecionada,
  naoLidas,
  tags,
  onSelecionar,
}: LinhaProps) {
  const { nome: nomeWhatsapp, fotoUrl, isLoading: carregandoAvatar } = useWhatsappAvatar(c.id);

  // Grupo não tem cliente_nome no banco (ver "Grupos" no CLAUDE.md) — sem
  // o nome ao vivo do WhatsApp a linha mostraria o JID cru
  // ("1203...@g.us"), que não diz nada pra quem atende.
  const titulo =
    c.cliente_nome ||
    nomeWhatsapp ||
    (c.tipo === "grupo" ? "Grupo sem nome" : c.telefone);

  return (
    <li>
      <button
        type="button"
        onClick={onSelecionar}
        aria-current={selecionada}
        className={`flex w-full gap-3 border-l-2 px-4 py-3 text-left transition-colors ${
          selecionada
            ? "border-tide-500 bg-tide-500/8"
            : "border-transparent hover:bg-sunken"
        }`}
      >
        <Avatar
          src={fotoUrl}
          alt={titulo}
          tipo={c.tipo}
          size={40}
          loading={carregandoAvatar}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[0.875rem] font-semibold text-primary">
              {titulo}
            </span>
            <span className="shrink-0 text-[0.6875rem] text-muted">
              {formatRelativeTime(c.criado_em)}
            </span>
          </div>

          {c.ultima_mensagem?.texto ? (
            <p className="mt-0.5 truncate text-[0.8125rem] leading-snug text-secondary">
              {c.ultima_mensagem.origem !== "cliente" && (
                <span className="text-muted">
                  {c.ultima_mensagem.origem === "atendente" ? "Equipe: " : "Sistema: "}
                </span>
              )}
              {c.ultima_mensagem.texto}
            </p>
          ) : (
            <p className="mt-0.5 truncate text-[0.8125rem] italic leading-snug text-muted">
              Sem mensagens ainda
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {c.departamento && (
              <span className="rounded-md bg-sunken px-1.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-tide-400">
                {c.departamento.nome}
              </span>
            )}
            {c.atendente && (
              <span className="truncate text-[0.6875rem] text-muted">
                {c.atendente.nome}
              </span>
            )}
            {tags.map((tag) => (
              <TagBadge key={tag.id} tag={tag} />
            ))}
          </div>
        </div>

        {naoLidas > 0 && (
          <span
            className="mt-1 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-alert px-1.5 text-[0.6875rem] font-semibold text-white"
            aria-label={`${naoLidas} mensagens não lidas`}
          >
            {naoLidas}
          </span>
        )}
      </button>
    </li>
  );
}

/**
 * Inbox de duas colunas: lista à esquerda, atendimento à direita, tudo na
 * mesma tela — em vez de navegar da fila pro chat e voltar. Reaproveita o
 * ConversaPanel (mesmo corpo da rota /conversas/[id]), então tudo que o
 * chat faz (mídia, áudio, respostas rápidas, transferir, finalizar)
 * funciona aqui sem duplicação.
 *
 * A /fila antiga foi removida (2026-08-19) — este inbox já cobria tudo que
 * ela tinha (fila por setor, etiquetas, busca) e passou a ser a única tela
 * de trabalho depois de validado no escritório. Login leva direto pra cá.
 */
export default function AtendimentosPage() {
  const { user } = useAuth();
  const { departments } = useDepartments();
  const { tags: catalogoTags } = useTags();
  const { unreadByConversation, clearUnread } = useNotifications();
  const isAdmin = user?.role === "admin";
  const isSupervisor = user?.role === "supervisor";
  const { verTodos, setVerTodos } = useVerTodosSetores();
  const podeVerTodos = isAdmin || (isSupervisor && verTodos);

  const [tab, setTab] = useState<Aba>("em_atendimento");
  const ehGrupos = tab === "grupos";
  const ehBot = tab === "bot";
  const ehFinalizadas = tab === "finalizado";
  const [departamentoId, setDepartamentoId] = useState("");
  const [tagId, setTagId] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  // Filtro por período — só faz sentido em Finalizadas (única aba que pode
  // acumular meses de histórico; as outras são sempre "agora").
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const [conversas, setConversas] = useState<Conversation[]>([]);
  const [botSessions, setBotSessions] = useState<BotSession[]>([]);
  const [tagsPorTelefone, setTagsPorTelefone] = useState<Record<string, Tag[]>>({});
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Contagem por aba, pro atendente ver que tem gente esperando sem
  // precisar clicar em cada uma. Consulta barata: por_pagina 1 só pra
  // aproveitar o "total" que a rota paginada já devolve.
  const [contagens, setContagens] = useState<Record<string, number>>({});
  const [novaConversaAberta, setNovaConversaAberta] = useState(false);
  // Telefone puxado da aba Bot: abre o mesmo modal de iniciar conversa,
  // já preenchido. Criar a conversa apaga a sessão de bot no backend.
  const [atendendoDoBot, setAtendendoDoBot] = useState<string | null>(null);
  const [reabrindoAlvo, setReabrindoAlvo] = useState<Conversation | null>(null);
  const [reabrindo, setReabrindo] = useState(false);
  const [assumindo, setAssumindo] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setBuscaDebounced(busca.trim()), 400);
    return () => clearTimeout(timer);
  }, [busca]);

  const semSetor = !podeVerTodos && !user?.departamento_id;
  const filtroDepartamento = podeVerTodos ? departamentoId || undefined : user?.departamento_id;

  const carregar = useCallback(async () => {
    if (ehBot) {
      try {
        setBotSessions(await getBotSessions());
      } catch (error) {
        setErro(normalizeError(error).message);
      } finally {
        setIsLoading(false);
      }
      return;
    }
    if (semSetor && !ehGrupos) {
      setConversas([]);
      setIsLoading(false);
      return;
    }
    setErro(null);
    try {
      const { dados } = await getConversationsPaginado(
        ehGrupos
          ? {
              // Grupo não tem status nem setor — filtrar por eles
              // devolveria lista vazia.
              tipo: "grupo",
              pagina: 1,
              por_pagina: POR_PAGINA,
              busca: buscaDebounced || undefined,
            }
          : {
              status: tab as ConversationStatus,
              // Cliente que voltou a falar não deve aparecer também no
              // histórico de finalizados — ele está é na fila/atendendo.
              sem_ativo: tab === "finalizado" || undefined,
              departamento_id: filtroDepartamento,
              pagina: 1,
              por_pagina: POR_PAGINA,
              tag_id: tagId || undefined,
              busca: buscaDebounced || undefined,
              ...(ehFinalizadas
                ? { data_inicio: dataInicio || undefined, data_fim: dataFim || undefined }
                : {}),
            },
      );
      setConversas(dados);
    } catch (error) {
      setErro(normalizeError(error).message);
    } finally {
      setIsLoading(false);
    }
  }, [
    tab,
    ehGrupos,
    ehBot,
    ehFinalizadas,
    filtroDepartamento,
    semSetor,
    tagId,
    buscaDebounced,
    dataInicio,
    dataFim,
  ]);

  useEffect(() => {
    setIsLoading(true);
    carregar();
  }, [carregar]);

  const carregarContagens = useCallback(async () => {
    try {
      const base = { pagina: 1, por_pagina: 1 as const };
      const [aguardando, atendendo, grupos, bot] = await Promise.all([
        getConversationsPaginado({
          ...base,
          status: "aguardando",
          departamento_id: filtroDepartamento,
        }),
        getConversationsPaginado({
          ...base,
          status: "em_atendimento",
          departamento_id: filtroDepartamento,
        }),
        getConversationsPaginado({ ...base, tipo: "grupo" }),
        getBotSessions(),
      ]);
      setContagens({
        aguardando: aguardando.total,
        em_atendimento: atendendo.total,
        grupos: grupos.total,
        bot: bot.length,
      });
    } catch {
      // silencioso: sem badge é só menos informação, não quebra o inbox
    }
  }, [filtroDepartamento]);

  useEffect(() => {
    carregarContagens();
  }, [carregarContagens]);

  // Etiquetas de todos os telefones visíveis numa chamada só (mesmo padrão
  // da /fila) — evita uma requisição por linha da lista.
  useEffect(() => {
    const telefones = Array.from(new Set(conversas.map((c) => c.telefone)));
    if (telefones.length === 0) return;
    getClientTags(telefones)
      .then(setTagsPorTelefone)
      .catch(() => {
        // silencioso: linha fica sem pill, não vale bloquear o inbox
      });
  }, [conversas]);

  const recarregarTudo = useCallback(() => {
    carregar();
    carregarContagens();
  }, [carregar, carregarContagens]);

  useSocketEvent("nova_conversa", recarregarTudo);
  useSocketEvent("conversa_atualizada", recarregarTudo);
  useSocketEvent("conversa_finalizada", recarregarTudo);
  useSocketEvent("nova_mensagem", carregar);

  // Um cliente pode ter vários atendimentos (cada finalização cria uma
  // Conversation nova, ver findConversaAtivaPorTelefone) — sem agrupar, o
  // mesmo "Juan" aparecia três vezes na aba Todas. A lista mostra o
  // atendimento mais recente de cada telefone, como qualquer app de
  // mensagem: uma linha por pessoa. O histórico dos anteriores continua
  // acessível pela /fila, aba Finalizadas.
  const conversasVisiveis = useMemo(() => {
    const maisRecentePorTelefone = new Map<string, Conversation>();
    for (const c of conversas) {
      const atual = maisRecentePorTelefone.get(c.telefone);
      if (!atual || new Date(c.criado_em) > new Date(atual.criado_em)) {
        maisRecentePorTelefone.set(c.telefone, c);
      }
    }
    return Array.from(maisRecentePorTelefone.values()).sort(
      (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime(),
    );
  }, [conversas]);

  const selecionada = useMemo(
    () => conversasVisiveis.find((c) => c.id === selecionadaId) ?? null,
    [conversasVisiveis, selecionadaId],
  );

  function handleSelecionar(conversa: Conversation) {
    setSelecionadaId(conversa.id);
    clearUnread(conversa.id);
  }

  async function handleAssumir() {
    if (!selecionada) return;
    setAssumindo(true);
    setErro(null);
    try {
      await assumeConversation(selecionada.id);
      setTab("em_atendimento");
      await carregar();
    } catch (error) {
      setErro(normalizeError(error).message);
    } finally {
      setAssumindo(false);
    }
  }

  async function handleConfirmarReabrir() {
    if (!reabrindoAlvo) return;
    setReabrindo(true);
    setErro(null);
    try {
      await reopenConversation(reabrindoAlvo.id);
      setReabrindoAlvo(null);
      setTab("em_atendimento");
      await carregar();
    } catch (error) {
      setErro(normalizeError(error).message);
      setReabrindoAlvo(null);
    } finally {
      setReabrindo(false);
    }
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ---------------- coluna esquerda: lista ---------------- */}
      {/* Abaixo de lg não cabem as duas colunas: mostra a lista OU a
          conversa. A seta de voltar do ConversaPanel (onSair) limpa a
          seleção e traz a lista de volta. */}
      <aside
        className={`w-full shrink-0 flex-col border-r border-app bg-raised lg:flex lg:w-[360px] ${
          selecionada ? "hidden" : "flex"
        }`}
      >
        <div className="shrink-0 border-b border-app px-4 pb-3 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-display text-lg font-semibold text-primary">
              Atendimentos
            </h1>
            <button
              type="button"
              onClick={() => setNovaConversaAberta(true)}
              className="flex items-center gap-1.5 rounded-lg bg-tide-500/12 px-2.5 py-1.5 text-[0.75rem] font-semibold text-tide-500 transition-colors hover:bg-tide-500/20"
            >
              <MessageCirclePlus size={14} />
              Novo
            </button>
          </div>

          <div className="relative mt-3">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar nome ou telefone..."
              className="w-full rounded-lg border border-app bg-sunken py-2 pl-9 pr-3 text-[0.8125rem] text-primary placeholder:text-muted/60 focus:border-tide-500 focus:outline-none focus:ring-2 focus:ring-tide-500/15"
            />
          </div>

          {!ehGrupos && !ehBot && (podeVerTodos || catalogoTags.length > 0) && (
            <div className="mt-2 flex gap-2">
              {podeVerTodos && (
                <Select
                  aria-label="Filtrar por setor"
                  value={departamentoId}
                  onChange={(e) => setDepartamentoId(e.target.value)}
                  className="!py-1.5 !text-[0.75rem]"
                >
                  <option value="">Todos os setores</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nome}
                    </option>
                  ))}
                </Select>
              )}
              {catalogoTags.length > 0 && (
                <Select
                  aria-label="Filtrar por etiqueta"
                  value={tagId}
                  onChange={(e) => setTagId(e.target.value)}
                  className="!py-1.5 !text-[0.75rem]"
                >
                  <option value="">Todas as etiquetas</option>
                  {catalogoTags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          )}

          {ehFinalizadas && (
            <div className="mt-2 flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-[0.625rem] font-semibold uppercase tracking-wide text-muted">
                  De
                </label>
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="w-full rounded-lg border border-app bg-sunken px-2.5 py-1.5 text-[0.75rem] text-primary focus:border-tide-500 focus:outline-none focus:ring-2 focus:ring-tide-500/15"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[0.625rem] font-semibold uppercase tracking-wide text-muted">
                  Até
                </label>
                <input
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="w-full rounded-lg border border-app bg-sunken px-2.5 py-1.5 text-[0.75rem] text-primary focus:border-tide-500 focus:outline-none focus:ring-2 focus:ring-tide-500/15"
                />
              </div>
            </div>
          )}

          {isSupervisor && (
            <label className="mt-2.5 flex items-center gap-2 text-[0.75rem] text-secondary">
              <Switch checked={verTodos} onChange={setVerTodos} label="Ver todos os setores" />
              Ver todos os setores
            </label>
          )}
        </div>

        <div className="flex shrink-0 border-b border-app">
          {TABS.map(({ aba, label }) => (
            <button
              key={aba}
              type="button"
              onClick={() => setTab(aba)}
              className={`relative flex-1 px-1 py-2.5 text-[0.6875rem] font-medium transition-colors ${
                tab === aba ? "text-primary" : "text-muted hover:text-secondary"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                {label}
                {(contagens[aba] ?? 0) > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-px text-[0.625rem] font-bold ${
                      aba === "aguardando"
                        ? "bg-waiting/20 text-waiting"
                        : "bg-mist-500/20 text-secondary"
                    }`}
                  >
                    {contagens[aba]}
                  </span>
                )}
              </span>
              {tab === aba && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-tide-500" />
              )}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={20} className="animate-spin text-tide-500" />
            </div>
          ) : semSetor && !ehGrupos ? (
            <p className="px-4 py-12 text-center text-[0.8125rem] text-muted">
              Seu usuário não está em nenhum setor. Fale com o administrador.
            </p>
          ) : !ehBot && conversasVisiveis.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
              <Inbox size={22} className="text-muted" />
              <p className="text-[0.8125rem] text-muted">
                Nenhuma conversa {buscaDebounced ? "para essa busca" : "por aqui"}.
              </p>
            </div>
          ) : ehBot ? (
            botSessions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                <Bot size={22} className="text-muted" />
                <p className="text-[0.8125rem] text-muted">
                  Ninguém parado no menu agora.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-app/60">
                {botSessions.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-waiting/12 text-waiting">
                      <Bot size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-[0.875rem] font-semibold text-primary">
                        <Phone size={12} className="shrink-0 text-muted" />
                        {b.telefone}
                      </p>
                      <p className="mt-0.5 text-[0.75rem] text-secondary">
                        {formatRelativeTime(b.atualizado_em)}
                        {b.tentativas > 1 && ` · ${b.tentativas} mensagens sem escolher setor`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAtendendoDoBot(b.telefone)}
                      className="shrink-0 rounded-lg bg-tide-500/12 px-2.5 py-1.5 text-[0.75rem] font-semibold text-tide-500 transition-colors hover:bg-tide-500/20"
                    >
                      Atender
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await dismissBotSession(b.telefone);
                        carregar();
                      }}
                      aria-label={`Ignorar ${b.telefone}`}
                      className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:text-alert"
                    >
                      <X size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <ul className="divide-y divide-app/60">
              {conversasVisiveis.map((c) => (
                <LinhaConversa
                  key={c.id}
                  conversa={c}
                  selecionada={c.id === selecionadaId}
                  naoLidas={unreadByConversation[c.id] ?? 0}
                  tags={tagsPorTelefone[c.telefone] ?? []}
                  onSelecionar={() => handleSelecionar(c)}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* ---------------- coluna direita: atendimento ---------------- */}
      <section
        className={`min-w-0 flex-1 flex-col bg-surface lg:flex ${
          selecionada ? "flex" : "hidden"
        }`}
      >
        {erro && (
          <div className="m-4 flex shrink-0 items-start gap-2.5 rounded-xl border border-alert/35 bg-alert/8 px-4 py-3">
            <AlertCircle size={17} className="mt-px shrink-0 text-alert" aria-hidden="true" />
            <p className="text-[0.875rem] leading-snug text-primary">{erro}</p>
          </div>
        )}

        {!selecionada ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sunken text-muted">
              <MessagesSquare size={26} />
            </div>
            <div>
              <p className="font-display text-base font-semibold text-primary">
                Nenhum atendimento aberto
              </p>
              <p className="mt-1 text-[0.875rem] text-secondary">
                Escolha uma conversa na lista para começar a responder.
              </p>
            </div>
          </div>
        ) : selecionada.tipo !== "grupo" && selecionada.status === "aguardando" ? (
          // Conversa na fila ainda não tem composer: precisa ser assumida
          // primeiro (mesma regra do chat, ver podeResponder no painel).
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <Avatar
              alt={selecionada.cliente_nome ?? "Cliente"}
              tipo={selecionada.tipo}
              size={56}
            />
            <div>
              <p className="font-display text-base font-semibold text-primary">
                {selecionada.cliente_nome || selecionada.telefone}
              </p>
              <p className="mt-1 text-[0.875rem] text-secondary">
                Esta conversa ainda está na fila. Assuma para poder responder.
              </p>
            </div>
            <Button onClick={handleAssumir} loading={assumindo} className="!px-5 !py-2.5 text-[0.875rem]">
              Assumir atendimento
            </Button>
          </div>
        ) : selecionada.tipo !== "grupo" && selecionada.status === "finalizado" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-app bg-raised px-5 py-3">
              <p className="text-[0.8125rem] text-secondary">
                Atendimento finalizado — somente leitura.
              </p>
              <Button
                onClick={() => setReabrindoAlvo(selecionada)}
                className="!px-4 !py-2 text-[0.8125rem]"
              >
                <RotateCcw size={15} />
                Reabrir
              </Button>
            </div>
            <div className="min-h-0 flex-1 px-5 py-4">
              <ConversaPanel
                conversationId={selecionada.id}
                onSair={() => setSelecionadaId(null)}
              />
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 px-5 py-4">
            <ConversaPanel
              conversationId={selecionada.id}
              onSair={() => setSelecionadaId(null)}
            />
          </div>
        )}
      </section>

      <NovaConversaModal
        open={novaConversaAberta}
        onClose={() => setNovaConversaAberta(false)}
      />

      {/* Puxar alguém do bot é iniciar conversa com o telefone já
          preenchido — o mesmo modal, e criar a conversa já tira a pessoa
          da lista do bot pelo backend. */}
      <NovaConversaModal
        open={atendendoDoBot !== null}
        telefoneInicial={atendendoDoBot ?? undefined}
        onClose={() => {
          setAtendendoDoBot(null);
          carregar();
        }}
      />

      <ConfirmModal
        open={reabrindoAlvo !== null}
        title={`Reabrir a conversa de ${reabrindoAlvo?.cliente_nome || "cliente sem nome"}?`}
        description="A conversa volta pro atendimento e o cliente não é avisado — nenhuma mensagem é enviada."
        confirmLabel="Reabrir"
        loading={reabrindo}
        onConfirm={handleConfirmarReabrir}
        onCancel={() => setReabrindoAlvo(null)}
      />
    </div>
  );
}
