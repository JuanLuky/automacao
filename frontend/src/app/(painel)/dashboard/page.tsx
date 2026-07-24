"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Loader2, Users } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { useAuth } from "@/hooks/useAuth";
import { useDepartments } from "@/hooks/useDepartments";
import { useSocketEvent } from "@/hooks/useSocketEvent";
import { getConversations, normalizeError } from "@/lib/api";
import type { Conversation } from "@/types";

const CARDS = [
  { status: "aguardando" as const, label: "Aguardando", icon: Clock, tone: "text-waiting", bg: "bg-waiting/12" },
  { status: "em_atendimento" as const, label: "Em atendimento", icon: Users, tone: "text-tide-400", bg: "bg-tide-500/12" },
  { status: "finalizado" as const, label: "Finalizados", icon: CheckCircle2, tone: "text-mist-500", bg: "bg-mist-500/12" },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const { departments } = useDepartments();
  const isAdmin = user?.role === "admin";

  const [departamentoId, setDepartamentoId] = useState("");
  const [conversas, setConversas] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

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
      const data = await getConversations({ departamento_id: filtroDepartamento });
      setConversas(data);
    } catch (error) {
      setErro(normalizeError(error).message);
    } finally {
      setIsLoading(false);
    }
  }, [filtroDepartamento, semSetor]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useSocketEvent("nova_conversa", carregar);
  useSocketEvent("conversa_atualizada", carregar);
  useSocketEvent("conversa_finalizada", carregar);

  const contagens = {
    aguardando: conversas.filter((c) => c.status === "aguardando").length,
    em_atendimento: conversas.filter((c) => c.status === "em_atendimento").length,
    finalizado: conversas.filter((c) => c.status === "finalizado").length,
  };

  const porDepartamento = isAdmin
    ? departments.map((d) => ({
        departamento: d,
        total: conversas.filter((c) => c.departamento_id === d.id).length,
        aguardando: conversas.filter((c) => c.departamento_id === d.id && c.status === "aguardando").length,
      }))
    : [];

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow font-semibold uppercase text-tide-500">Visão geral</p>
          <h1 className="mt-2 font-display text-display-md font-semibold text-primary">Dashboard</h1>
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
      ) : (
        !semSetor && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {CARDS.map(({ status, label, icon: Icon, tone, bg }) => (
                <div key={status} className="rounded-xl border border-app bg-raised p-5">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
                    <Icon size={17} className={tone} />
                  </div>
                  <p className="mt-4 font-display text-3xl font-semibold text-primary">
                    {contagens[status]}
                  </p>
                  <p className="mt-1 text-[0.8125rem] text-secondary">{label}</p>
                </div>
              ))}
            </div>

            {isAdmin && (
              <div className="mt-8 overflow-hidden rounded-xl border border-app bg-raised">
                <div className="border-b border-app px-5 py-3.5">
                  <p className="text-eyebrow font-semibold uppercase text-muted">Por setor</p>
                </div>
                <ul className="divide-y divide-app">
                  {porDepartamento.map(({ departamento, total, aguardando }) => (
                    <li key={departamento.id} className="flex items-center justify-between px-5 py-3.5">
                      <span className="text-[0.875rem] font-medium text-primary">{departamento.nome}</span>
                      <div className="flex items-center gap-4 text-[0.8125rem] text-secondary">
                        {aguardando > 0 && (
                          <span className="flex items-center gap-1.5 text-waiting">
                            <span className="h-1.5 w-1.5 rounded-full bg-waiting" />
                            {aguardando} aguardando
                          </span>
                        )}
                        <span>{total} no total</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
