"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
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
  Mic,
  MessagesSquare,
  Paperclip,
  Phone,
  Send,
  Square,
  User as UserIcon,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { MediaMessage } from "@/components/ui/MediaMessage";
import { QuickReplies } from "@/components/ui/QuickReplies";
import { Select } from "@/components/ui/Select";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useAuth } from "@/hooks/useAuth";
import { useDepartments } from "@/hooks/useDepartments";
import { useNotifications } from "@/hooks/useNotifications";
import { useSocketEvent } from "@/hooks/useSocketEvent";
import {
  EVOLUTION_INSTANCE,
  finishConversation,
  getConversation,
  getMessages,
  normalizeError,
  sendMessage,
  transferConversation,
} from "@/lib/api";
import { formatTime } from "@/lib/time";
import { MENSAGEM_AUTOMATICA_FINALIZAR, resolverTemplate } from "@/lib/quickReplies";
import type { Conversation, Message, MessageTipo } from "@/types";

// Mesma allowlist do backend (ver MediaStorageService) — checar aqui só pra
// dar feedback rápido antes de gastar uma requisição; quem garante de
// verdade é o backend.
const MIME_PARA_TIPO: Record<string, MessageTipo> = {
  "image/jpeg": "imagem",
  "image/png": "imagem",
  "image/webp": "imagem",
  "application/pdf": "documento",
  "application/msword": "documento",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "documento",
  "application/vnd.ms-excel": "documento",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    "documento",
  "video/mp4": "video",
  "video/3gpp": "video",
  "audio/ogg": "audio",
  "audio/mpeg": "audio",
  "audio/mp4": "audio",
  "audio/webm": "audio",
};
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024;
const LEGENDAS_PADRAO = ["[imagem]", "[áudio]", "[documento]", "[vídeo]"];

interface AnexoStaged {
  tipo: MessageTipo;
  base64: string;
  mimetype: string;
  nomeArquivo: string;
}

// Firefox grava MediaRecorder em ogg/opus nativamente; Chrome/Edge só
// suportam webm — por isso a ordem de preferência (ver MediaStorageService
// no backend, que aceita os dois). Se nenhum dos dois for suportado, deixa
// o navegador escolher (new MediaRecorder(stream) sem mimeType).
const MIME_TYPES_GRAVACAO = [
  "audio/ogg;codecs=opus",
  "audio/webm;codecs=opus",
  "audio/webm",
];

function escolherMimeTypeGravacao(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_TYPES_GRAVACAO.find((tipo) => MediaRecorder.isTypeSupported(tipo)) ?? "";
}

function extensaoPorMimetype(mimetype: string): string {
  if (mimetype.includes("ogg")) return "ogg";
  if (mimetype.includes("webm")) return "webm";
  if (mimetype.includes("mp4")) return "m4a";
  return "webm";
}

function formatarDuracao(segundos: number): string {
  const m = Math.floor(segundos / 60).toString().padStart(2, "0");
  const s = (segundos % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function ConversaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { departments } = useDepartments();
  const { clearUnread } = useNotifications();

  const [conversa, setConversa] = useState<Conversation | null | undefined>(
    undefined,
  );
  const [mensagens, setMensagens] = useState<Message[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [anexo, setAnexo] = useState<AnexoStaged | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [gravando, setGravando] = useState(false);
  const [duracaoGravacao, setDuracaoGravacao] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksGravacaoRef = useRef<Blob[]>([]);
  const streamGravacaoRef = useRef<MediaStream | null>(null);
  const timerGravacaoRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Some enquanto o usuário está numa gravação — solta o microfone e o
  // timer se o componente desmontar no meio (ex: navegou pra outra
  // conversa sem parar a gravação).
  useEffect(() => {
    return () => {
      if (timerGravacaoRef.current) clearInterval(timerGravacaoRef.current);
      streamGravacaoRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

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
    if ((!mensagem && !anexo) || enviando) return;

    setEnviando(true);
    setErro(null);
    try {
      await sendMessage(id, {
        origem: "atendente",
        mensagem,
        instance: EVOLUTION_INSTANCE,
        // Grupo não tem "assumir" — o backend precisa saber quem está
        // respondendo pra assinar a mensagem (ver MessagesService.create).
        ...(conversa?.tipo === "grupo" && { atendente_id: user?.id }),
        ...(anexo && {
          tipo: anexo.tipo,
          midia_base64: anexo.base64,
          midia_mimetype: anexo.mimetype,
          midia_nome_arquivo: anexo.nomeArquivo,
        }),
      });
      setTexto("");
      setAnexo(null);
    } catch (error) {
      setErro(normalizeError(error).message);
    } finally {
      setEnviando(false);
    }
  }

  function handleSelecionarArquivo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = ""; // permite selecionar o mesmo arquivo de novo depois
    if (!file) return;

    const tipo = MIME_PARA_TIPO[file.type];
    if (!tipo) {
      setErro("Tipo de arquivo não suportado. Envie imagem (JPEG/PNG/WEBP), áudio (MP3/OGG/M4A), vídeo (MP4/3GPP) ou documento (PDF/DOC/XLS).");
      return;
    }
    if (file.size > TAMANHO_MAXIMO_BYTES) {
      setErro("Arquivo maior que o limite permitido (15MB).");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const resultado = reader.result as string;
      const base64 = resultado.slice(resultado.indexOf(",") + 1);
      setAnexo({ tipo, base64, mimetype: file.type, nomeArquivo: file.name });
      setErro(null);
    };
    reader.onerror = () => setErro("Não foi possível ler o arquivo selecionado.");
    reader.readAsDataURL(file);
  }

  async function iniciarGravacao() {
    setErro(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamGravacaoRef.current = stream;

      const mimeType = escolherMimeTypeGravacao();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksGravacaoRef.current = [];

      recorder.ondataavailable = (evento) => {
        if (evento.data.size > 0) chunksGravacaoRef.current.push(evento.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksGravacaoRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        streamGravacaoRef.current?.getTracks().forEach((t) => t.stop());
        streamGravacaoRef.current = null;

        const reader = new FileReader();
        reader.onload = () => {
          const resultado = reader.result as string;
          const base64 = resultado.slice(resultado.indexOf(",") + 1);
          setAnexo({
            tipo: "audio",
            base64,
            mimetype: blob.type,
            nomeArquivo: `gravacao-${Date.now()}.${extensaoPorMimetype(blob.type)}`,
          });
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setGravando(true);
      setDuracaoGravacao(0);
      timerGravacaoRef.current = setInterval(() => {
        setDuracaoGravacao((d) => d + 1);
      }, 1000);
    } catch {
      setErro("Não foi possível acessar o microfone. Verifique a permissão do navegador.");
    }
  }

  function pararGravacao() {
    mediaRecorderRef.current?.stop();
    setGravando(false);
    if (timerGravacaoRef.current) clearInterval(timerGravacaoRef.current);
  }

  function cancelarGravacao() {
    if (mediaRecorderRef.current) {
      // Troca o handler antes de parar pra não gerar o anexo (onstop só
      // deve montar o áudio quando o usuário para de propósito).
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    streamGravacaoRef.current?.getTracks().forEach((t) => t.stop());
    streamGravacaoRef.current = null;
    setGravando(false);
    if (timerGravacaoRef.current) clearInterval(timerGravacaoRef.current);
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
      // Best-effort: mesmo se o envio da mensagem de encerramento falhar
      // (ex: WhatsApp fora do ar), a finalização segue — o atendente ainda
      // quer poder encerrar o atendimento.
      try {
        await sendMessage(id, {
          origem: "atendente",
          mensagem: MENSAGEM_AUTOMATICA_FINALIZAR,
          instance: EVOLUTION_INSTANCE,
        });
      } catch {
        // ignora — não bloqueia a finalização
      }
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

  // Grupo não tem status/fila (ver "Grupos" no CLAUDE.md) — está sempre
  // aberto a responder, por qualquer atendente de qualquer setor.
  const podeResponder =
    conversa.tipo === "grupo" || conversa.status === "em_atendimento";

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
                {conversa.cliente_nome ||
                  (conversa.tipo === "grupo" ? "Grupo sem nome" : "Cliente sem nome")}
              </h1>
              {conversa.departamento && (
                <span className="text-eyebrow font-semibold uppercase text-tide-400">
                  {conversa.departamento.nome}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-secondary">
              <span className="flex items-center gap-1">
                {conversa.tipo === "grupo" ? (
                  <MessagesSquare size={13} />
                ) : (
                  <Phone size={13} />
                )}
                {conversa.tipo === "grupo"
                  ? conversa.telefone.split("@")[0]
                  : conversa.telefone}
              </span>
              {conversa.atendente && (
                <span className="flex items-center gap-1">
                  <UserIcon size={13} />
                  {conversa.atendente.nome}
                </span>
              )}
              {conversa.tipo === "cliente" && (
                <StatusBadge status={conversa.status} />
              )}
            </div>
          </div>
        </div>

        {conversa.tipo === "cliente" && conversa.status !== "finalizado" && (
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
              {/* origem atendente sem atendente vinculado = mensagem mandada
                  direto do celular conectado, fora do painel (ver
                  MessagesService.create, origem_externa) */}
              {m.origem === "atendente" && !m.atendente && (
                <span className="mb-1 px-1 text-[0.75rem] font-medium text-muted">
                  Enviado pelo celular
                </span>
              )}
              {/* remetente dentro de um grupo — várias pessoas escrevem na
                  mesma conversa, então precisa identificar quem mandou cada
                  mensagem (ver "Grupos do WhatsApp" no CLAUDE.md) */}
              {m.origem === "cliente" &&
                conversa.tipo === "grupo" &&
                (m.remetente_nome || m.remetente_telefone) && (
                  <span className="mb-1 px-1 text-[0.75rem] font-semibold text-secondary">
                    {m.remetente_nome || m.remetente_telefone}
                  </span>
                )}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-[0.875rem] leading-relaxed ${
                  m.origem === "atendente"
                    ? "bg-tide-500 text-abyss-900"
                    : "border border-app bg-raised text-primary"
                }`}
              >
                {m.tipo && m.tipo !== "texto" ? (
                  <div className="flex flex-col gap-1.5">
                    <MediaMessage message={m} />
                    {!LEGENDAS_PADRAO.includes(m.mensagem) && (
                      <p className="whitespace-pre-wrap">{m.mensagem}</p>
                    )}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{m.mensagem}</p>
                )}
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

      {anexo && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-app bg-sunken px-3 py-2 text-[0.8125rem] text-secondary">
          {anexo.tipo === "audio" ? (
            <audio
              controls
              className="h-9 max-w-full flex-1"
              src={`data:${anexo.mimetype};base64,${anexo.base64}`}
            />
          ) : (
            <>
              <Paperclip size={14} className="shrink-0" />
              <span className="truncate">{anexo.nomeArquivo}</span>
            </>
          )}
          <button
            type="button"
            onClick={() => setAnexo(null)}
            aria-label="Remover anexo"
            className="ml-auto shrink-0 rounded-md p-1 text-muted hover:text-primary"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <form onSubmit={handleEnviar} className={`flex items-end gap-3 ${anexo ? "mt-2" : "mt-4"}`}>
        <QuickReplies
          disabled={!podeResponder || gravando}
          onSelect={(template) =>
            setTexto(resolverTemplate(template, user?.nome ?? ""))
          }
        />

        {gravando ? (
          <div className="flex flex-1 items-center gap-3 rounded-xl border border-alert/40 bg-alert/8 px-4 py-3.5">
            <span
              className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-alert"
              aria-hidden="true"
            />
            <span className="text-[0.9375rem] text-primary">
              Gravando áudio... {formatarDuracao(duracaoGravacao)}
            </span>
            <button
              type="button"
              onClick={cancelarGravacao}
              aria-label="Cancelar gravação"
              className="ml-auto rounded-lg p-2 text-muted transition-colors hover:text-primary"
            >
              <X size={16} />
            </button>
            <button
              type="button"
              onClick={pararGravacao}
              aria-label="Parar gravação"
              className="rounded-lg bg-tide-500 p-2 text-abyss-900 transition-opacity hover:opacity-90"
            >
              <Square size={16} />
            </button>
          </div>
        ) : (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,video/mp4,video/3gpp,audio/ogg,audio/mpeg,audio/mp4"
              onChange={handleSelecionarArquivo}
              disabled={!podeResponder}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!podeResponder}
              aria-label="Anexar arquivo"
              className="rounded-xl border border-app p-3.5 text-secondary transition-colors hover:border-mist-500 hover:text-primary disabled:cursor-not-allowed disabled:opacity-55"
            >
              <Paperclip size={17} />
            </button>
            <button
              type="button"
              onClick={iniciarGravacao}
              disabled={!podeResponder}
              aria-label="Gravar áudio"
              className="rounded-xl border border-app p-3.5 text-secondary transition-colors hover:border-mist-500 hover:text-primary disabled:cursor-not-allowed disabled:opacity-55"
            >
              <Mic size={17} />
            </button>
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
          </>
        )}

        <Button
          type="submit"
          loading={enviando}
          disabled={!podeResponder || gravando || (!texto.trim() && !anexo)}
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
