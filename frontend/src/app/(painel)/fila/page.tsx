"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Inbox, Loader2, Phone, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useAuth } from "@/hooks/useAuth";
import { useDepartments } from "@/hooks/useDepartments";
import { useSocketEvent } from "@/hooks/useSocketEvent";
import { assumeConversation, getConversations, normalizeError } from "@/lib/api";
import { formatRelativeTime } from "@/lib/time";
import type { Conversation, ConversationStatus } from "@/types";

const TABS: { status: ConversationStatus; label: string }[] = [
  { status: "aguardando", label: "Na fila" },
  { status: "em_atendimento", label: "Em atendimento" },
];

export default function FilaPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { departments } = useDepartments();

  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<ConversationStatus>("aguardando");
  const [departamentoId, setDepartamentoId] = useState("");
  const [conversas, setConversas] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [assumindoId, setAssumindoId] = useState<string | null>(null);

  const semSetor = !isAdmin && !user?.departamento_id;
  const filtroDepartamento = isAdmin ? departamentoId || undefined : user?.departamento_id;

  const carregar = useCallback(async () => {
    if (semSetor) {
      setConversas([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErro(null);
    try {
      const data = await getConversations({ status: tab, departamento_id: filtroDepartamento });
      setConversas(data);
    } catch (error) {
      setErro(normalizeError(error).message);
    } finally {
      setIsLoading(false);
    }
  }, [tab, filtroDepartamento, semSetor]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Primeiro teste de ponta a ponta do WebSocket: qualquer mudança relevante
  // de conversa recarrega a lista respeitando os filtros atuais.
  useSocketEvent("nova_conversa", carregar);
  useSocketEvent("conversa_atualizada", carregar);
  useSocketEvent("conversa_finalizada", carregar);

  async function handleAssumir(id: string) {
    setAssumindoId(id);
    setErro(null);
    try {
      await assumeConversation(id);
      router.push(`/conversas/${id}`);
    } catch (error) {
      setErro(normalizeError(error).message);
      carregar();
    } finally {
      setAssumindoId(null);
    }
  }

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow font-semibold uppercase text-tide-500">Atendimento</p>
          <h1 className="mt-2 font-display text-display-md font-semibold text-primary">Fila</h1>
        </div>

        {isAdmin && (
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
            {tab === "aguardando" ? "Nenhuma conversa esperando." : "Nenhuma conversa em atendimento."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {conversas.map((c) => (
            <li
              key={c.id}
              className="animate-queue-in rounded-xl border border-app bg-raised p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
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

                <div className="flex items-center gap-3">
                  <StatusBadge status={c.status} />
                  {tab === "aguardando" ? (
                    <Button
                      variant="primary"
                      className="!px-4 !py-2 text-[0.8125rem]"
                      loading={assumindoId === c.id}
                      onClick={() => handleAssumir(c.id)}
                    >
                      Assumir
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      className="!px-4 !py-2 text-[0.8125rem]"
                      onClick={() => router.push(`/conversas/${c.id}`)}
                    >
                      Abrir
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
