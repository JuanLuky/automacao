"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRightLeft,
  CheckCircle2,
  Loader2,
  Phone,
  Send,
  User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Select } from "@/components/ui/Select";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useDepartments } from "@/hooks/useDepartments";
import { useNotifications } from "@/hooks/useNotifications";
import { useSocketEvent } from "@/hooks/useSocketEvent";
import {
  finishConversation,
  getConversation,
  getMessages,
  normalizeError,
  sendMessage,
  transferConversation,
} from "@/lib/api";
import { formatTime } from "@/lib/time";
import type { Conversation, Message } from "@/types";

const EVOLUTION_INSTANCE = process.env.NEXT_PUBLIC_EVOLUTION_INSTANCE ?? "";

export default function ConversaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { departments } = useDepartments();
  const { clearUnread } = useNotifications();

  const [conversa, setConversa] = useState<Conversation | null | undefined>(
    undefined,
  );
  const [mensagens, setMensagens] = useState<Message[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [confirmandoFinalizar, setConfirmandoFinalizar] = useState(false);

  const [transferindo, setTransferindo] = useState(false);
  const [transferDeptId, setTransferDeptId] = useState("");
  const [transferMotivo, setTransferMotivo] = useState("");
  const [enviandoTransfer, setEnviandoTransfer] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    try {
      const [conversaData, mensagensData] = await Promise.all([
        getConversation(id),
        getMessages(id),
      ]);
      setConversa(conversaData);
      setMensagens(mensagensData);
    } catch (error) {
      setErro(normalizeError(error).message);
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Abrir a conversa marca as mensagens dela como lidas para o badge/toast.
  useEffect(() => {
    clearUnread(id);
  }, [id, clearUnread]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [mensagens.length]);

  useSocketEvent<Message>("nova_mensagem", (mensagem) => {
    if (mensagem.conversation_id !== id) return;
    setMensagens((atuais) =>
      atuais.some((m) => m.id === mensagem.id) ? atuais : [...atuais, mensagem],
    );
  });

  useSocketEvent<Conversation>("conversa_atualizada", (atualizada) => {
    if (atualizada.id === id) setConversa(atualizada);
  });

  useSocketEvent<Conversation>("conversa_finalizada", (finalizada) => {
    if (finalizada.id === id) setConversa(finalizada);
  });

  async function handleEnviar(event: FormEvent) {
    event.preventDefault();
    const mensagem = texto.trim();
    if (!mensagem || enviando) return;

    setEnviando(true);
    setErro(null);
    try {
      await sendMessage(id, {
        origem: "atendente",
        mensagem,
        instance: EVOLUTION_INSTANCE,
      });
      setTexto("");
    } catch (error) {
      setErro(normalizeError(error).message);
    } finally {
      setEnviando(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleEnviar(event as unknown as FormEvent);
    }
  }

  async function handleFinalizar() {
    setFinalizando(true);
    setErro(null);
    try {
      await finishConversation(id);
      router.push("/fila");
    } catch (error) {
      setErro(normalizeError(error).message);
      setFinalizando(false);
      setConfirmandoFinalizar(false);
    }
  }

  async function handleTransferir(event: FormEvent) {
    event.preventDefault();
    if (!transferDeptId) return;

    setEnviandoTransfer(true);
    setErro(null);
    try {
      await transferConversation(id, {
        departamento_destino_id: transferDeptId,
        motivo: transferMotivo.trim() || undefined,
      });
      router.push("/fila");
    } catch (error) {
      setErro(normalizeError(error).message);
      setEnviandoTransfer(false);
    }
  }

  if (conversa === undefined) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={22} className="animate-spin text-tide-500" />
      </div>
    );
  }

  if (conversa === null) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-app py-16 text-center">
        <p className="text-[0.875rem] text-secondary">
          Conversa não encontrada.
        </p>
        <Button variant="ghost" onClick={() => router.push("/fila")}>
          Voltar para a fila
        </Button>
      </div>
    );
  }

  const podeResponder = conversa.status === "em_atendimento";

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-4 border-b border-app pb-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => router.push("/fila")}
            aria-label="Voltar para a fila"
            className="mt-0.5 rounded-lg border border-app p-2 text-secondary transition-colors hover:border-mist-500 hover:text-primary"
          >
            <ArrowLeft size={16} />
          </button>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-lg font-semibold text-primary">
                {conversa.cliente_nome || "Cliente sem nome"}
              </h1>
              {conversa.departamento && (
                <span className="text-eyebrow font-semibold uppercase text-tide-400">
                  {conversa.departamento.nome}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-secondary">
              <span className="flex items-center gap-1">
                <Phone size={13} />
                {conversa.telefone}
              </span>
              {conversa.atendente && (
                <span className="flex items-center gap-1">
                  <UserIcon size={13} />
                  {conversa.atendente.nome}
                </span>
              )}
              <StatusBadge status={conversa.status} />
            </div>
          </div>
        </div>

        {conversa.status !== "finalizado" && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="!px-3.5 !py-2 text-[0.8125rem]"
              onClick={() => setTransferindo((v) => !v)}
            >
              <ArrowRightLeft size={15} />
              Transferir
            </Button>
            <Button
              variant="ghost"
              className="!px-3.5 !py-2 text-[0.8125rem]"
              loading={finalizando}
              onClick={() => setConfirmandoFinalizar(true)}
            >
              <CheckCircle2 size={15} />
              Finalizar
            </Button>
          </div>
        )}
      </header>

      {transferindo && (
        <form
          onSubmit={handleTransferir}
          className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-app bg-raised p-4"
        >
          <div className="w-full max-w-[220px]">
            <Select
              label="Setor de destino"
              value={transferDeptId}
              onChange={(e) => setTransferDeptId(e.target.value)}
              required
            >
              <option value="" disabled>
                Selecione
              </option>
              {departments
                .filter((d) => d.id !== conversa.departamento_id)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome}
                  </option>
                ))}
            </Select>
          </div>

          <div className="min-w-[200px] flex-1">
            <label className="mb-2 block text-eyebrow font-semibold uppercase text-muted">
              Motivo (opcional)
            </label>
            <input
              type="text"
              value={transferMotivo}
              onChange={(e) => setTransferMotivo(e.target.value)}
              placeholder="Ex: assunto é do setor financeiro"
              className="w-full rounded-xl border border-app bg-sunken px-4 py-3 text-[0.9375rem] text-primary placeholder:text-muted/60 focus:border-tide-500 focus:bg-raised focus:outline-none focus:ring-4 focus:ring-tide-500/12"
            />
          </div>

          <Button
            type="submit"
            loading={enviandoTransfer}
            disabled={!transferDeptId}
            className="!px-4 !py-3"
          >
            Confirmar
          </Button>
        </form>
      )}

      {erro && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-alert/35 bg-alert/8 px-4 py-3">
          <AlertCircle
            size={17}
            className="mt-px shrink-0 text-alert"
            aria-hidden="true"
          />
          <p className="text-[0.875rem] leading-snug text-primary">{erro}</p>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-app bg-surface p-4"
      >
        {mensagens.length === 0 && (
          <p className="py-8 text-center text-[0.875rem] text-muted">
            Nenhuma mensagem ainda.
          </p>
        )}

        {mensagens.map((m) =>
          m.origem === "sistema" ? (
            <div key={m.id} className="flex justify-center">
              <span className="rounded-full bg-sunken px-3 py-1 text-[0.75rem] text-muted">
                {m.mensagem}
              </span>
            </div>
          ) : (
            <div
              key={m.id}
              className={`flex flex-col ${m.origem === "atendente" ? "items-end" : "items-start"}`}
            >
              {m.origem === "atendente" && m.atendente && (
                <span className="mb-1 px-1 text-[0.75rem] font-semibold text-tide-400">
                  {
                    m.atendente.nome
                      .trim()
                      .toLowerCase()
                      .split(/\s+/)
                      .filter(nome => !["da", "de", "do", "dos", "das"].includes(nome))
                      .slice(0, 2)
                      .map(nome => nome.charAt(0).toUpperCase() + nome.slice(1))
                      .join(" ")
                  }
                  {m.atendente.departamento &&
                    ` - ${m.atendente.departamento.nome.toUpperCase()}`}
                </span>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-[0.875rem] leading-relaxed ${
                  m.origem === "atendente"
                    ? "bg-tide-500 text-abyss-900"
                    : "border border-app bg-raised text-primary"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.mensagem}</p>
                <p
                  className={`mt-1 text-[0.6875rem] ${
                    m.origem === "atendente"
                      ? "text-abyss-900/60"
                      : "text-muted"
                  }`}
                >
                  {formatTime(m.criado_em)}
                </p>
              </div>
            </div>
          ),
        )}
      </div>

      <form onSubmit={handleEnviar} className="mt-4 flex items-end gap-3">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!podeResponder || enviando}
          placeholder={
            podeResponder
              ? "Escreva uma mensagem..."
              : "Esta conversa não está mais em atendimento."
          }
          rows={1}
          className="max-h-32 flex-1 resize-none rounded-xl border border-app bg-sunken px-4 py-3.5 text-[0.9375rem] text-primary placeholder:text-muted/60 focus:border-tide-500 focus:bg-raised focus:outline-none focus:ring-4 focus:ring-tide-500/12 disabled:cursor-not-allowed disabled:opacity-55"
        />
        <Button
          type="submit"
          loading={enviando}
          disabled={!podeResponder || !texto.trim()}
          className="!px-4 !py-3.5"
        >
          <Send size={17} />
        </Button>
      </form>

      <ConfirmModal
        open={confirmandoFinalizar}
        title="Finalizar esta conversa?"
        description="O atendimento será encerrado e não poderá mais receber mensagens."
        confirmLabel="Finalizar"
        loading={finalizando}
        onConfirm={handleFinalizar}
        onCancel={() => setConfirmandoFinalizar(false)}
      />
    </div>
  );
}
