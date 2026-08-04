"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, Send, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useAuth } from "@/hooks/useAuth";
import { getStatusHistorico, normalizeError, postStatusUpdate } from "@/lib/api";
import { formatDateTime } from "@/lib/time";
import type { StatusEstado, StatusUpdate } from "@/types";

const ESTADO_OPCOES: { valor: StatusEstado; label: string }[] = [
  { valor: "operacional", label: "Operacional" },
  { valor: "instabilidade", label: "Instabilidade" },
  { valor: "indisponivel", label: "Indisponível" },
];

const ESTADO_ICON: Record<StatusEstado, typeof CheckCircle2> = {
  operacional: CheckCircle2,
  instabilidade: AlertTriangle,
  indisponivel: XCircle,
};

const ESTADO_COR: Record<StatusEstado, string> = {
  operacional: "text-tide-400",
  instabilidade: "text-waiting",
  indisponivel: "text-alert",
};

export default function PublicarStatusPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [historico, setHistorico] = useState<StatusUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [estado, setEstado] = useState<StatusEstado>("operacional");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  useEffect(() => {
    if (user && !isAdmin) router.replace("/fila");
  }, [user, isAdmin, router]);

  const carregar = useCallback(async () => {
    setIsLoading(true);
    setErro(null);
    try {
      const data = await getStatusHistorico();
      setHistorico(data);
    } catch (error) {
      setErro(normalizeError(error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) carregar();
  }, [isAdmin, carregar]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setEnviando(true);
    setErroForm(null);
    try {
      await postStatusUpdate({ estado, mensagem: mensagem.trim() });
      setMensagem("");
      carregar();
    } catch (error) {
      setErroForm(normalizeError(error).message);
    } finally {
      setEnviando(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={22} className="animate-spin text-tide-500" />
      </div>
    );
  }

  return (
    <div>
      <header className="mb-8">
        <p className="text-eyebrow font-semibold uppercase text-tide-500">Administração</p>
        <h1 className="mt-2 font-display text-display-md font-semibold text-primary">
          Status do serviço
        </h1>
        <p className="mt-2 text-[0.9375rem] text-secondary">
          Publique atualizações que aparecem na página pública{" "}
          <span className="font-medium text-primary">/status</span>, visível pros clientes.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="mb-8 rounded-xl border border-app bg-raised p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[200px_1fr]">
          <Select
            label="Estado"
            id="estado"
            value={estado}
            onChange={(e) => setEstado(e.target.value as StatusEstado)}
          >
            {ESTADO_OPCOES.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.label}
              </option>
            ))}
          </Select>

          <div className="group relative">
            <label
              htmlFor="mensagem"
              className="mb-2 block text-eyebrow font-semibold uppercase text-muted"
            >
              Mensagem
            </label>
            <textarea
              id="mensagem"
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Ex: Estamos investigando lentidão no envio de mensagens."
              rows={2}
              required
              className="w-full resize-none rounded-xl border border-app bg-sunken px-4 py-3.5 text-[0.9375rem] text-primary transition-all duration-200 placeholder:text-muted/60 hover:border-mist-500/60 focus:border-tide-500 focus:bg-raised focus:outline-none focus:ring-4 focus:ring-tide-500/12"
            />
          </div>
        </div>

        {erroForm && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-alert/35 bg-alert/8 px-4 py-3">
            <AlertCircle size={17} className="mt-px shrink-0 text-alert" aria-hidden="true" />
            <p className="text-[0.875rem] leading-snug text-primary">{erroForm}</p>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <Button type="submit" loading={enviando} className="!px-5 !py-3">
            <Send size={15} />
            Publicar atualização
          </Button>
        </div>
      </form>

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
      ) : (
        <div className="overflow-hidden rounded-xl border border-app bg-raised">
          <ul className="divide-y divide-app">
            {historico.length === 0 ? (
              <li className="px-5 py-6 text-center text-[0.875rem] text-secondary">
                Nenhuma atualização publicada ainda.
              </li>
            ) : (
              historico.map((item) => {
                const Icon = ESTADO_ICON[item.estado];
                return (
                  <li key={item.id} className="flex items-start gap-3 px-5 py-3.5">
                    <Icon size={17} className={`mt-0.5 shrink-0 ${ESTADO_COR[item.estado]}`} />
                    <div className="min-w-0">
                      <p className="text-[0.875rem] text-primary">{item.mensagem}</p>
                      <p className="mt-1 text-[0.8125rem] text-muted">
                        {formatDateTime(item.criado_em)}
                      </p>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
