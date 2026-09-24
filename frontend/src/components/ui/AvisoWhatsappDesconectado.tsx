"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WifiOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { EVOLUTION_INSTANCE, getWhatsappStatus } from "@/lib/api";

const POLL_INTERVAL_MS = 30000;

type Conexao = "conectado" | "desconectado" | "indisponivel";

// Faixa vermelha no topo do inbox quando o número do atendimento não está
// conectado — sem isso, o atendente responde, a mensagem fica salva no
// painel e nunca chega no cliente, sem ninguém perceber. Consulta o estado
// ao vivo (GET /whatsapp/status) a cada 30s; não some sozinho por timeout,
// só quando a instância volta a "open".
export function AvisoWhatsappDesconectado() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [conexao, setConexao] = useState<Conexao>("conectado");

  useEffect(() => {
    if (!EVOLUTION_INSTANCE) return;
    let cancelado = false;

    const verificar = () => {
      getWhatsappStatus(EVOLUTION_INSTANCE)
        .then((status) => {
          if (cancelado) return;
          const estado = status.state ?? status.instance?.state;
          setConexao(estado === "open" ? "conectado" : "desconectado");
        })
        .catch(() => {
          // Backend não conseguiu falar com a Evolution API — do ponto de
          // vista do atendente, dá no mesmo: mensagem não sai.
          if (!cancelado) setConexao("indisponivel");
        });
    };

    verificar();
    const interval = setInterval(verificar, POLL_INTERVAL_MS);
    return () => {
      cancelado = true;
      clearInterval(interval);
    };
  }, []);

  if (conexao === "conectado") return null;

  return (
    <div
      role="alert"
      className="flex shrink-0 items-center gap-3 bg-red-600 px-4 py-2.5 text-sm text-white"
    >
      <WifiOff size={18} className="shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">
          {conexao === "desconectado"
            ? "WhatsApp desconectado."
            : "Não foi possível verificar a conexão do WhatsApp."}
        </span>{" "}
        Mensagens de clientes não estão chegando e as respostas não estão sendo enviadas.
        {!isAdmin && " Avise um administrador."}
      </p>
      {isAdmin && (
        <Link
          href="/whatsapp"
          className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-[0.8125rem] font-semibold transition-colors hover:bg-white/25"
        >
          Reconectar
        </Link>
      )}
    </div>
  );
}
