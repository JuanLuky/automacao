"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { useAuth } from "@/hooks/useAuth";
import { getBusinessHours, normalizeError, updateBusinessHours } from "@/lib/api";

const DIAS = [
  { valor: 0, label: "Dom" },
  { valor: 1, label: "Seg" },
  { valor: 2, label: "Ter" },
  { valor: 3, label: "Qua" },
  { valor: 4, label: "Qui" },
  { valor: 5, label: "Sex" },
  { valor: 6, label: "Sáb" },
];

export default function HorarioFuncionamentoPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<boolean | null>(null);

  const [diasFuncionamento, setDiasFuncionamento] = useState<number[]>([]);
  const [horaInicio, setHoraInicio] = useState("08:00");
  const [horaFim, setHoraFim] = useState("18:00");
  const [mensagemForaHorario, setMensagemForaHorario] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  useEffect(() => {
    if (user && !isAdmin) router.replace("/fila");
  }, [user, isAdmin, router]);

  const carregar = useCallback(async () => {
    setIsLoading(true);
    setErro(null);
    try {
      const config = await getBusinessHours();
      setDiasFuncionamento(config.dias_funcionamento);
      setHoraInicio(config.hora_inicio);
      setHoraFim(config.hora_fim);
      setMensagemForaHorario(config.mensagem_fora_horario);
      setAberto(config.aberto);
    } catch (error) {
      setErro(normalizeError(error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) carregar();
  }, [isAdmin, carregar]);

  function alternarDia(dia: number) {
    setDiasFuncionamento((atual) =>
      atual.includes(dia) ? atual.filter((d) => d !== dia) : [...atual, dia].sort(),
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSalvando(true);
    setErroForm(null);
    setSucesso(false);
    try {
      const config = await updateBusinessHours({
        dias_funcionamento: diasFuncionamento,
        hora_inicio: horaInicio,
        hora_fim: horaFim,
        mensagem_fora_horario: mensagemForaHorario.trim(),
      });
      setAberto(config.aberto);
      setSucesso(true);
    } catch (error) {
      setErroForm(normalizeError(error).message);
    } finally {
      setSalvando(false);
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
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow font-semibold uppercase text-tide-500">Administração</p>
          <h1 className="mt-2 font-display text-display-md font-semibold text-primary">
            Horário de funcionamento
          </h1>
          <p className="mt-2 text-[0.9375rem] text-secondary">
            Fora desse horário, o cliente recebe a mensagem abaixo automaticamente ao mandar
            mensagem no WhatsApp, sem entrar na fila.
          </p>
        </div>

        {aberto !== null && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8125rem] font-medium ${
              aberto ? "bg-tide-500/12 text-tide-400" : "bg-alert/12 text-alert"
            }`}
          >
            {aberto ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {aberto ? "Aberto agora" : "Fechado agora"}
          </span>
        )}
      </header>

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
        <form onSubmit={handleSubmit} className="rounded-xl border border-app bg-raised p-5">
          <div>
            <label className="mb-2 block text-eyebrow font-semibold uppercase text-muted">
              Dias de funcionamento
            </label>
            <div className="flex flex-wrap gap-2">
              {DIAS.map((dia) => {
                const ativo = diasFuncionamento.includes(dia.valor);
                return (
                  <button
                    key={dia.valor}
                    type="button"
                    onClick={() => alternarDia(dia.valor)}
                    aria-pressed={ativo}
                    className={`rounded-lg border px-3.5 py-2 text-[0.8125rem] font-medium transition-colors ${
                      ativo
                        ? "border-tide-500/50 bg-tide-500/12 text-tide-400"
                        : "border-app bg-sunken text-secondary hover:border-mist-500/60"
                    }`}
                  >
                    {dia.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Horário de início"
              id="hora_inicio"
              type="time"
              value={horaInicio}
              onChange={(e) => setHoraInicio(e.target.value)}
              icon={<Clock size={16} />}
              required
            />
            <Field
              label="Horário de fim"
              id="hora_fim"
              type="time"
              value={horaFim}
              onChange={(e) => setHoraFim(e.target.value)}
              icon={<Clock size={16} />}
              required
            />
          </div>

          <div className="mt-5">
            <label
              htmlFor="mensagem_fora_horario"
              className="mb-2 block text-eyebrow font-semibold uppercase text-muted"
            >
              Mensagem fora do horário
            </label>
            <textarea
              id="mensagem_fora_horario"
              value={mensagemForaHorario}
              onChange={(e) => setMensagemForaHorario(e.target.value)}
              rows={3}
              required
              className="w-full resize-none rounded-xl border border-app bg-sunken px-4 py-3.5 text-[0.9375rem] text-primary transition-all duration-200 placeholder:text-muted/60 hover:border-mist-500/60 focus:border-tide-500 focus:bg-raised focus:outline-none focus:ring-4 focus:ring-tide-500/12"
            />
          </div>

          {erroForm && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-alert/35 bg-alert/8 px-4 py-3">
              <AlertCircle size={17} className="mt-px shrink-0 text-alert" aria-hidden="true" />
              <p className="text-[0.875rem] leading-snug text-primary">{erroForm}</p>
            </div>
          )}

          {sucesso && !erroForm && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-tide-500/35 bg-tide-500/8 px-4 py-3">
              <CheckCircle2 size={17} className="mt-px shrink-0 text-tide-400" aria-hidden="true" />
              <p className="text-[0.875rem] leading-snug text-primary">
                Horário atualizado com sucesso.
              </p>
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <Button type="submit" loading={salvando} className="!px-5 !py-3">
              Salvar alterações
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
