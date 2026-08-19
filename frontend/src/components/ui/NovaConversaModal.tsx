"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertCircle, Info, MessageCirclePlus, Phone, User } from "lucide-react";
import { Button } from "./Button";
import { Field } from "./Field";
import { Select } from "./Select";
import { useAuth } from "@/hooks/useAuth";
import { useDepartments } from "@/hooks/useDepartments";
import {
  EVOLUTION_INSTANCE,
  normalizeError,
  sendMessage,
  startConversation,
} from "@/lib/api";
import type { Conversation } from "@/types";

interface NovaConversaModalProps {
  open: boolean;
  /** Prefill quando aberto a partir de um contato salvo (tela /contatos). */
  telefoneInicial?: string;
  nomeInicial?: string;
  onClose: () => void;
}

/**
 * "Chamar o cliente sem ele chamar": abre o atendimento e manda a primeira
 * mensagem, sem esperar o cliente escrever.
 *
 * São duas chamadas de propósito, não uma rota que faz tudo: POST
 * /conversations/outbound cria o atendimento (validando o número no
 * WhatsApp) e o envio da primeira mensagem passa pelo mesmo
 * POST /conversations/:id/messages que o chat já usa — assinatura do
 * atendente, envio pela Evolution API, persistência e socket saem de graça,
 * sem duplicar nada. Se o envio falhar, o atendimento continua criado e dá
 * pra tentar de novo de dentro do chat.
 */
export function NovaConversaModal({
  open,
  telefoneInicial,
  nomeInicial,
  onClose,
}: NovaConversaModalProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { departments } = useDepartments();

  const [telefone, setTelefone] = useState("");
  const [nome, setNome] = useState("");
  const [departamentoId, setDepartamentoId] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Preenchido quando o número já tem atendimento em aberto: em vez de
  // criar uma conversa paralela (que quebraria o n8n, ver
  // ConversationsService.iniciar), oferece abrir a que já existe.
  const [jaExistente, setJaExistente] = useState<Conversation | null>(null);

  // Reabrir o modal sempre começa limpo — inclusive o erro da tentativa
  // anterior, que senão aparece já na abertura seguinte.
  useEffect(() => {
    if (!open) return;
    setTelefone(telefoneInicial ?? "");
    setNome(nomeInicial ?? "");
    setDepartamentoId(user?.departamento_id ?? "");
    setMensagem("");
    setErro(null);
    setJaExistente(null);
  }, [open, telefoneInicial, nomeInicial, user?.departamento_id]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !enviando) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, enviando, onClose]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (enviando) return;

    if (!EVOLUTION_INSTANCE) {
      setErro(
        "Instância do WhatsApp não configurada (NEXT_PUBLIC_EVOLUTION_INSTANCE).",
      );
      return;
    }

    setEnviando(true);
    setErro(null);
    setJaExistente(null);
    try {
      const { conversa, ja_existia } = await startConversation({
        telefone,
        cliente_nome: nome.trim() || undefined,
        departamento_id: departamentoId,
        instance: EVOLUTION_INSTANCE,
      });

      // Conversa de outro atendente/setor: mandar a mensagem daqui sairia
      // assinada por quem está com ela assumida (MessagesService usa o
      // atendente da conversa), não por quem digitou. Melhor abrir e
      // deixar a pessoa decidir.
      if (ja_existia) {
        setJaExistente(conversa);
        return;
      }

      await sendMessage(conversa.id, {
        origem: "atendente",
        mensagem: mensagem.trim(),
        instance: EVOLUTION_INSTANCE,
      });

      onClose();
      router.push(`/conversas/${conversa.id}`);
    } catch (error) {
      setErro(normalizeError(error).message);
    } finally {
      setEnviando(false);
    }
  }

  if (!open) return null;

  const podeEnviar =
    telefone.trim().length > 0 &&
    departamentoId.length > 0 &&
    mensagem.trim().length > 0;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="nova-conversa-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-abyss-900/60 p-4 backdrop-blur-sm"
      onClick={() => !enviando && onClose()}
    >
      <form
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-md animate-queue-in rounded-xl border border-app bg-raised p-6 shadow-panel"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tide-500/12 text-tide-500">
            <MessageCirclePlus size={18} />
          </span>
          <div className="min-w-0">
            <h2
              id="nova-conversa-title"
              className="font-display text-base font-semibold text-primary"
            >
              Iniciar conversa
            </h2>
            <p className="mt-1.5 text-[0.875rem] leading-snug text-secondary">
              O atendimento abre no seu nome e a primeira mensagem sai na hora.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <Field
            id="nova-conversa-telefone"
            label="Telefone"
            icon={<Phone size={16} />}
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="(98) 99123-4567"
            disabled={enviando || !!telefoneInicial}
            autoFocus={!telefoneInicial}
          />

          <Field
            id="nova-conversa-nome"
            label="Nome do cliente (opcional)"
            icon={<User size={16} />}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Como aparece no painel"
            disabled={enviando}
          />

          <div>
            <label
              htmlFor="nova-conversa-setor"
              className="mb-2 block text-eyebrow font-semibold uppercase text-muted"
            >
              Setor
            </label>
            <Select
              id="nova-conversa-setor"
              value={departamentoId}
              onChange={(e) => setDepartamentoId(e.target.value)}
              disabled={enviando}
            >
              <option value="">Selecione o setor</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label
              htmlFor="nova-conversa-mensagem"
              className="mb-2 block text-eyebrow font-semibold uppercase text-muted"
            >
              Primeira mensagem
            </label>
            <textarea
              id="nova-conversa-mensagem"
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              disabled={enviando}
              rows={3}
              placeholder="Olá! Aqui é do escritório..."
              className="w-full resize-none rounded-xl border border-app bg-sunken px-4 py-3 text-[0.875rem] text-primary placeholder:text-muted/60 focus:border-tide-500 focus:bg-raised focus:outline-none focus:ring-4 focus:ring-tide-500/12 disabled:opacity-60"
            />
          </div>
        </div>

        {jaExistente && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-waiting/35 bg-waiting/10 px-4 py-3">
            <Info size={17} className="mt-px shrink-0 text-waiting" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[0.8125rem] leading-snug text-primary">
                Já existe um atendimento em aberto com esse número. Nada foi
                criado — abra a conversa e mande a mensagem por lá.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push(`/conversas/${jaExistente.id}`);
                }}
                className="mt-2 text-[0.8125rem] font-semibold text-tide-500 hover:underline"
              >
                Abrir conversa
              </button>
            </div>
          </div>
        )}

        {erro && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-alert/35 bg-alert/8 px-4 py-3">
            <AlertCircle size={17} className="mt-px shrink-0 text-alert" aria-hidden="true" />
            <p className="text-[0.875rem] leading-snug text-primary">{erro}</p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2.5">
          <Button
            type="button"
            variant="ghost"
            className="!px-4 !py-2.5 text-[0.8125rem]"
            onClick={onClose}
            disabled={enviando}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            className="!px-4 !py-2.5 text-[0.8125rem]"
            loading={enviando}
            disabled={!podeEnviar}
          >
            Enviar e abrir
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
