"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Loader2, Trophy, Users } from "lucide-react";
import { AreaChart, BarChart, BarList } from "@tremor/react";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { useAuth } from "@/hooks/useAuth";
import { useDepartments } from "@/hooks/useDepartments";
import { useSocketEvent } from "@/hooks/useSocketEvent";
import { useVerTodosSetores } from "@/hooks/useVerTodosSetores";
import { getConversations, getConversationMetrics, normalizeError } from "@/lib/api";
import type { Conversation, ConversationMetrics } from "@/types";

const CARDS = [
  { status: "aguardando" as const, label: "Aguardando", icon: Clock, tone: "text-waiting", bg: "bg-waiting/12" },
  { status: "em_atendimento" as const, label: "Em atendimento", icon: Users, tone: "text-tide-400", bg: "bg-tide-500/12" },
  { status: "finalizado" as const, label: "Finalizados", icon: CheckCircle2, tone: "text-mist-500", bg: "bg-mist-500/12" },
];

type Periodo = "hoje" | "7dias" | "30dias";

const PERIODOS: { valor: Periodo; label: string }[] = [
  { valor: "hoje", label: "Hoje" },
  { valor: "7dias", label: "Últimos 7 dias" },
  { valor: "30dias", label: "Últimos 30 dias" },
];

// "YYYY-MM-DD" a partir dos componentes locais do Date (não
// toISOString(), que converte pra UTC e pode virar o dia errado) — mesmo
// cuidado de fuso já documentado no backend (ConversationsService,
// inicioDoDiaLocal/fimDoDiaLocal).
function paraDataLocal(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function intervaloDoPeriodo(periodo: Periodo): { data_inicio: string; data_fim: string } {
  const hoje = new Date();
  const data_fim = paraDataLocal(hoje);
  const inicio = new Date(hoje);
  if (periodo === "7dias") inicio.setDate(inicio.getDate() - 6);
  if (periodo === "30dias") inicio.setDate(inicio.getDate() - 29);
  return { data_inicio: paraDataLocal(inicio), data_fim };
}

function formatarDiaCurto(dataIso: string): string {
  const [, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { departments } = useDepartments();
  const isAdmin = user?.role === "admin";
  const isSupervisor = user?.role === "supervisor";
  const { verTodos, setVerTodos } = useVerTodosSetores();
  const podeVerTodos = isAdmin || (isSupervisor && verTodos);

  const [departamentoId, setDepartamentoId] = useState("");
  const [conversas, setConversas] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const [metricas, setMetricas] = useState<ConversationMetrics | null>(null);
  const [carregandoMetricas, setCarregandoMetricas] = useState(true);
  const [erroMetricas, setErroMetricas] = useState<string | null>(null);

  const semSetor = !podeVerTodos && !user?.departamento_id;
  const filtroDepartamento = podeVerTodos ? departamentoId || undefined : user?.departamento_id;

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

  const carregarMetricas = useCallback(async () => {
    if (semSetor) {
      setMetricas(null);
      setCarregandoMetricas(false);
      return;
    }
    setCarregandoMetricas(true);
    setErroMetricas(null);
    try {
      const { data_inicio, data_fim } = intervaloDoPeriodo(periodo);
      const data = await getConversationMetrics({
        departamento_id: filtroDepartamento,
        data_inicio,
        data_fim,
      });
      setMetricas(data);
    } catch (error) {
      setErroMetricas(normalizeError(error).message);
    } finally {
      setCarregandoMetricas(false);
    }
  }, [filtroDepartamento, periodo, semSetor]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    carregarMetricas();
  }, [carregarMetricas]);

  useSocketEvent("nova_conversa", carregar);
  useSocketEvent("conversa_atualizada", carregar);
  useSocketEvent("conversa_finalizada", carregar);
  useSocketEvent("conversa_finalizada", carregarMetricas);

  const contagens = {
    aguardando: conversas.filter((c) => c.status === "aguardando").length,
    em_atendimento: conversas.filter((c) => c.status === "em_atendimento").length,
    finalizado: conversas.filter((c) => c.status === "finalizado").length,
  };

  const dadosPorSetor = useMemo(
    () =>
      (metricas?.por_departamento ?? [])
        .map((d) => ({ Setor: d.departamento_nome, Finalizados: d.finalizados }))
        .sort((a, b) => b.Finalizados - a.Finalizados),
    [metricas],
  );

  const dadosRanking = useMemo(
    () =>
      (metricas?.por_atendente ?? []).map((a) => ({
        name: a.atendente_nome,
        value: a.finalizados,
      })),
    [metricas],
  );

  const dadosPorDia = useMemo(
    () =>
      (metricas?.por_dia ?? []).map((d) => ({
        Dia: formatarDiaCurto(d.data),
        Finalizados: d.finalizados,
      })),
    [metricas],
  );

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow font-semibold uppercase text-tide-500">Visão geral</p>
          <h1 className="mt-2 font-display text-display-md font-semibold text-primary">Dashboard</h1>
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

            {/* Métricas de desempenho — atendimentos finalizados no período,
                por setor e por atendente. Ranking usa o crédito de quem
                finalizou (ver ConversationsService.metricas). */}
            <div className="mt-8 flex items-center justify-between gap-4">
              <p className="text-eyebrow font-semibold uppercase text-muted">Desempenho</p>
              <div className="flex items-center gap-1 rounded-lg border border-app bg-raised p-1">
                {PERIODOS.map(({ valor, label }) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => setPeriodo(valor)}
                    className={`rounded-md px-3 py-1.5 text-[0.8125rem] font-medium transition-colors ${
                      periodo === valor
                        ? "bg-tide-500/12 text-tide-500"
                        : "text-secondary hover:bg-sunken hover:text-primary"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {erroMetricas && (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-alert/35 bg-alert/8 px-4 py-3">
                <AlertCircle size={17} className="mt-px shrink-0 text-alert" aria-hidden="true" />
                <p className="text-[0.875rem] leading-snug text-primary">{erroMetricas}</p>
              </div>
            )}

            {carregandoMetricas ? (
              <div className="flex justify-center py-16">
                <Loader2 size={22} className="animate-spin text-tide-500" />
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-app bg-raised p-5">
                  <p className="text-[0.875rem] font-medium text-primary">
                    Atendimentos finalizados por dia
                  </p>
                  <p className="mt-0.5 text-[0.75rem] text-muted">
                    {metricas?.total_finalizados ?? 0} no período selecionado
                  </p>
                  {dadosPorDia.every((d) => d.Finalizados === 0) ? (
                    <p className="py-12 text-center text-[0.875rem] text-muted">
                      Nenhum atendimento finalizado no período.
                    </p>
                  ) : (
                    <AreaChart
                      className="mt-6 h-56"
                      data={dadosPorDia}
                      index="Dia"
                      categories={["Finalizados"]}
                      colors={["teal"]}
                      showLegend={false}
                      showAnimation
                      allowDecimals={false}
                    />
                  )}
                </div>

                <div className="rounded-xl border border-app bg-raised p-5">
                  <div className="flex items-center gap-2">
                    <Trophy size={15} className="text-waiting" />
                    <p className="text-[0.875rem] font-medium text-primary">Ranking de atendentes</p>
                  </div>
                  <p className="mt-0.5 text-[0.75rem] text-muted">
                    Atendimentos finalizados no período
                  </p>
                  {dadosRanking.length === 0 ? (
                    <p className="py-12 text-center text-[0.875rem] text-muted">
                      Nenhum atendimento finalizado no período.
                    </p>
                  ) : (
                    <BarList data={dadosRanking} color="teal" className="mt-6" showAnimation />
                  )}
                </div>

                {podeVerTodos && (
                  <div className="rounded-xl border border-app bg-raised p-5 lg:col-span-2">
                    <p className="text-[0.875rem] font-medium text-primary">Finalizados por setor</p>
                    <p className="mt-0.5 text-[0.75rem] text-muted">No período selecionado</p>
                    {dadosPorSetor.length === 0 ? (
                      <p className="py-12 text-center text-[0.875rem] text-muted">
                        Nenhum atendimento finalizado no período.
                      </p>
                    ) : (
                      <BarChart
                        className="mt-6 h-56"
                        data={dadosPorSetor}
                        index="Setor"
                        categories={["Finalizados"]}
                        colors={["teal"]}
                        showLegend={false}
                        showAnimation
                        allowDecimals={false}
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
