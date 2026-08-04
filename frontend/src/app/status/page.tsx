"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Waves, XCircle } from "lucide-react";
import { getStatusAtual, getStatusHistorico, normalizeError } from "@/lib/api";
import { formatDateTime } from "@/lib/time";
import type { StatusAtual, StatusEstado, StatusUpdate } from "@/types";

const ESTADO_CONFIG: Record<
  StatusEstado,
  { label: string; text: string; border: string; bg: string; icon: typeof CheckCircle2 }
> = {
  operacional: {
    label: "Tudo operacional",
    text: "text-tide-400",
    border: "border-tide-500/35",
    bg: "bg-tide-500/8",
    icon: CheckCircle2,
  },
  instabilidade: {
    label: "Instabilidade",
    text: "text-waiting",
    border: "border-waiting/35",
    bg: "bg-waiting/10",
    icon: AlertTriangle,
  },
  indisponivel: {
    label: "Serviço indisponível",
    text: "text-alert",
    border: "border-alert/35",
    bg: "bg-alert/8",
    icon: XCircle,
  },
};

export default function StatusPublicoPage() {
  const [atual, setAtual] = useState<StatusAtual | null>(null);
  const [historico, setHistorico] = useState<StatusUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function carregar() {
      setIsLoading(true);
      setErro(null);
      try {
        const [atualData, historicoData] = await Promise.all([
          getStatusAtual(),
          getStatusHistorico(),
        ]);
        setAtual(atualData);
        setHistorico(historicoData);
      } catch (error) {
        setErro(normalizeError(error).message);
      } finally {
        setIsLoading(false);
      }
    }
    carregar();
  }, []);

  const config = atual ? ESTADO_CONFIG[atual.estado] : null;
  const Icon = config?.icon;

  return (
    <main className="min-h-screen bg-surface px-6 py-16">
      <div className="mx-auto w-full max-w-[560px]">
        <header className="mb-10 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-tide-500/15 ring-1 ring-tide-500/30">
            <Waves size={18} className="text-tide-500" />
          </div>
          <div>
            <p className="font-display text-lg font-semibold tracking-tight text-primary">Maré</p>
            <p className="text-[0.8125rem] text-secondary">Status do serviço</p>
          </div>
        </header>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={22} className="animate-spin text-tide-500" />
          </div>
        ) : erro ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-alert/35 bg-alert/8 px-4 py-3">
            <AlertTriangle size={17} className="mt-px shrink-0 text-alert" aria-hidden="true" />
            <p className="text-[0.875rem] leading-snug text-primary">{erro}</p>
          </div>
        ) : (
          <>
            {atual && config && Icon && (
              <div className={`rounded-2xl border ${config.border} ${config.bg} px-6 py-7`}>
                <div className="flex items-center gap-3">
                  <Icon size={22} className={config.text} />
                  <p className={`font-display text-[1.125rem] font-semibold ${config.text}`}>
                    {config.label}
                  </p>
                </div>
                <p className="mt-3 text-[0.9375rem] leading-relaxed text-primary">
                  {atual.mensagem}
                </p>
                {atual.criado_em && (
                  <p className="mt-4 text-[0.8125rem] text-muted">
                    Atualizado em {formatDateTime(atual.criado_em)}
                  </p>
                )}
              </div>
            )}

            <section className="mt-10">
              <h2 className="mb-4 text-eyebrow font-semibold uppercase tracking-wide text-muted">
                Histórico
              </h2>

              {historico.length === 0 ? (
                <p className="text-[0.875rem] text-secondary">
                  Nenhuma atualização registrada ainda.
                </p>
              ) : (
                <ul className="space-y-3">
                  {historico.map((item) => {
                    const itemConfig = ESTADO_CONFIG[item.estado];
                    const ItemIcon = itemConfig.icon;
                    return (
                      <li
                        key={item.id}
                        className="flex gap-3 rounded-xl border border-app bg-raised px-4 py-3.5"
                      >
                        <ItemIcon size={17} className={`mt-0.5 shrink-0 ${itemConfig.text}`} />
                        <div className="min-w-0">
                          <p className="text-[0.875rem] font-medium text-primary">
                            {item.mensagem}
                          </p>
                          <p className="mt-1 text-[0.75rem] text-muted">
                            {formatDateTime(item.criado_em)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
