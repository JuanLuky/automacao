"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, RefreshCw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { getWhatsappQrCode, getWhatsappStatus, normalizeError } from "@/lib/api";
import type { WhatsappQrCode, WhatsappStatus } from "@/types";

const INSTANCE = process.env.NEXT_PUBLIC_EVOLUTION_INSTANCE ?? "";
const POLL_INTERVAL_MS = 8000;

function extrairEstado(payload: WhatsappStatus | WhatsappQrCode): string | null {
  return payload.state ?? payload.instance?.state ?? null;
}

export default function WhatsappPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [estado, setEstado] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const conectado = estado === "open";

  useEffect(() => {
    if (user && !isAdmin) router.replace("/atendimentos");
  }, [user, isAdmin, router]);

  const atualizar = useCallback(async () => {
    if (!INSTANCE) {
      setErro("Variável NEXT_PUBLIC_EVOLUTION_INSTANCE não configurada no frontend.");
      setIsLoading(false);
      return;
    }
    try {
      const status = await getWhatsappStatus(INSTANCE);
      const estadoAtual = extrairEstado(status);
      setEstado(estadoAtual);
      setErro(null);

      if (estadoAtual === "open") {
        setQrCode(null);
      } else {
        const qr = await getWhatsappQrCode(INSTANCE);
        setQrCode(qr.base64 ?? null);
        const estadoQr = extrairEstado(qr);
        if (estadoQr) setEstado(estadoQr);
      }
    } catch (error) {
      setErro(normalizeError(error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    atualizar();
    const interval = setInterval(atualizar, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isAdmin, atualizar]);

  const gerarNovoQrCode = async () => {
    setAtualizando(true);
    await atualizar();
    setAtualizando(false);
  };

  if (!isAdmin) return null;

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6">
        <h1 className="font-display text-xl font-semibold text-primary">
          Conexão do WhatsApp
        </h1>
        <p className="mt-1 text-sm text-secondary">
          Escaneie o QR Code pra conectar o número do atendimento — sem precisar abrir o
          Manager da Evolution API.
        </p>
      </div>

      {erro && (
        <div className="mb-4 rounded-xl border border-alert/30 bg-alert/10 px-4 py-3 text-sm text-alert">
          {erro}
        </div>
      )}

      <div className="rounded-2xl border border-app bg-raised p-8">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Loader2 size={22} className="animate-spin text-tide-500" />
            <span className="text-sm text-secondary">Consultando estado da instância…</span>
          </div>
        ) : conectado ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-tide-500/12">
              <CheckCircle2 size={26} className="text-tide-500" />
            </div>
            <p className="font-display text-base font-semibold text-primary">
              WhatsApp conectado
            </p>
            <p className="text-sm text-secondary">
              A instância está ativa e recebendo mensagens normalmente.
            </p>
          </div>
        ) : qrCode ? (
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-xl border border-app bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- imagem base64 gerada dinamicamente, next/image não otimiza data URIs */}
              <img
                src={qrCode}
                alt="QR Code de conexão do WhatsApp"
                className="h-56 w-56"
              />
            </div>
            <p className="text-center text-sm text-secondary">
              Abra o WhatsApp no celular do número de atendimento →{" "}
              <strong>Aparelhos conectados</strong> → <strong>Conectar aparelho</strong> e
              escaneie o código.
            </p>
            <p className="text-xs text-muted">
              O código é atualizado automaticamente a cada {POLL_INTERVAL_MS / 1000}s.
            </p>
            <Button variant="ghost" onClick={gerarNovoQrCode} loading={atualizando}>
              <RefreshCw size={15} />
              Gerar novo QR Code
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Smartphone size={26} className="text-muted" />
            <p className="text-sm text-secondary">
              Instância desconectada. Aguardando QR Code…
            </p>
            <Button variant="ghost" onClick={gerarNovoQrCode} loading={atualizando}>
              <RefreshCw size={15} />
              Tentar novamente
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
