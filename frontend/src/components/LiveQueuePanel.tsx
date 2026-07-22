"use client";

import { useEffect, useState } from "react";
import { Waves } from "lucide-react";

/**
 * Assinatura visual da tela de entrada: uma amostra da fila em movimento.
 * Os dados são ilustrativos e locais — o painel real usa o WebSocket.
 * A intenção é que quem abre o sistema já veja do que ele trata.
 */

interface QueueItem {
  nome: string;
  setor: string;
  trecho: string;
  espera: string;
  status: "aguardando" | "em_atendimento";
}

const AMOSTRA: QueueItem[] = [
  {
    nome: "Camila Andrade",
    setor: "Financeiro",
    trecho: "Preciso da segunda via do boleto de julho",
    espera: "há 40s",
    status: "aguardando",
  },
  {
    nome: "Rodrigo Teles",
    setor: "Suporte",
    trecho: "A conexão caiu de novo hoje de manhã",
    espera: "há 2 min",
    status: "em_atendimento",
  },
  {
    nome: "Marina Souza",
    setor: "RH",
    trecho: "Sobre o holerite deste mês",
    espera: "há 4 min",
    status: "aguardando",
  }
];

const SETOR_COR: Record<string, string> = {
  Financeiro: "text-tide-400",
  Suporte: "text-sky-400",
  RH: "text-amber-300",
  Comercial: "text-violet-300",
};

export function LiveQueuePanel() {
  const [visiveis, setVisiveis] = useState(0);

  useEffect(() => {
    const timers = AMOSTRA.map((_, index) =>
      setTimeout(() => setVisiveis((v) => Math.max(v, index + 1)), 350 + index * 260),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <aside className="relative hidden overflow-hidden bg-abyss-900 lg:flex lg:flex-col lg:p-12 xl:p-12">
      {/* Camada de profundidade — maré ao fundo */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            "radial-gradient(120% 80% at 15% 0%, rgba(20,184,166,0.18) 0%, transparent 55%), radial-gradient(90% 70% at 90% 100%, rgba(56,189,248,0.14) 0%, transparent 60%)",
        }}
      />

      {/* Cabeçalho da marca */}
      <div className="relative">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-tide-500/15 ring-1 ring-tide-500/30">
            <Waves size={18} className="text-tide-400" />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight text-mist-100">
            Maré
          </span>
        </div>

        <div className="mt-10 max-w-md">
          <p className="text-eyebrow font-semibold uppercase text-tide-400">
            Atendimento por WhatsApp
          </p>
          <h1 className="mt-4 font-display text-display-lg font-semibold text-mist-100">
            Toda conversa
            <br />
            <span className="text-tide-400">no lugar certo.</span>
          </h1>
          <p className="mt-5 text-[0.9375rem] leading-relaxed text-mist-300">
            O cliente escolhe o setor, a conversa entra na fila e o atendente
            responde do painel. Sem mensagem perdida, sem número solto.
          </p>
        </div>
      </div>

      {/* Assinatura: a fila em movimento */}
      <div className="relative mt-[80px]">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-eyebrow font-semibold uppercase text-mist-500">
            Exemplo
          </span>
        </div>

        <ul className="space-y-2">
          {AMOSTRA.map((item, index) => (
            <li
              key={item.nome}
              className={`
                overflow-hidden rounded-xl border border-abyss-600/60 bg-abyss-800/70
                p-3.5 backdrop-blur-sm transition-opacity
                ${index < visiveis ? "animate-queue-in" : "opacity-0"}
              `}
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate text-sm font-semibold text-mist-100">
                    {item.nome}
                  </span>
                  <span
                    className={`shrink-0 text-eyebrow font-semibold uppercase ${
                      SETOR_COR[item.setor] ?? "text-mist-500"
                    }`}
                  >
                    {item.setor}
                  </span>
                </div>
                <span className="shrink-0 text-xs text-mist-500">{item.espera}</span>
              </div>

              <p className="mt-1.5 truncate text-[0.8125rem] text-mist-300">
                {item.trecho}
              </p>

              <div className="mt-2.5 flex items-center gap-1.5">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    item.status === "aguardando" ? "bg-waiting" : "bg-tide-400"
                  }`}
                />
                <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-mist-500">
                  {item.status === "aguardando" ? "Aguardando" : "Em atendimento"}
                </span>
              </div>
            </li>
          ))}
        </ul>

        {/* Linha de maré — a assinatura gráfica do sistema */}
        <div className="relative mt-6 h-px w-full overflow-hidden bg-abyss-600">
          <div className="absolute inset-y-0 w-1/2 animate-tide-sweep bg-gradient-to-r from-transparent via-tide-400 to-transparent" />
        </div>
      </div>
    </aside>
  );
}
