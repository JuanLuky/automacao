"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Tag,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Field } from "@/components/ui/Field";
import { useAuth } from "@/hooks/useAuth";
import { useAutoMessages } from "@/hooks/useAutoMessages";
import { useQuickReplies } from "@/hooks/useQuickReplies";
import {
  createQuickReply,
  deleteQuickReply,
  normalizeError,
  updateAutoMessages,
  updateQuickReply,
} from "@/lib/api";
import type { QuickReply } from "@/types";

const TEXTAREA_CLASS =
  "w-full resize-none rounded-xl border border-app bg-sunken px-4 py-3.5 text-[0.9375rem] text-primary transition-all duration-200 placeholder:text-muted/60 hover:border-mist-500/60 focus:border-tide-500 focus:bg-raised focus:outline-none focus:ring-4 focus:ring-tide-500/12";

export default function MensagensPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { autoMessages, refresh: refreshAutoMessages } = useAutoMessages();
  const {
    quickReplies,
    isLoading: carregandoRespostas,
    refresh: refreshQuickReplies,
  } = useQuickReplies();

  useEffect(() => {
    if (user && !isAdmin) router.replace("/fila");
  }, [user, isAdmin, router]);

  // --- Mensagens automáticas (Assumir/Finalizar) ---
  const [mensagemIniciar, setMensagemIniciar] = useState("");
  const [mensagemFinalizar, setMensagemFinalizar] = useState("");
  const [salvandoAuto, setSalvandoAuto] = useState(false);
  const [erroAuto, setErroAuto] = useState<string | null>(null);
  const [sucessoAuto, setSucessoAuto] = useState(false);

  useEffect(() => {
    setMensagemIniciar(autoMessages.mensagem_iniciar);
    setMensagemFinalizar(autoMessages.mensagem_finalizar);
  }, [autoMessages]);

  async function handleSalvarAuto(event: FormEvent) {
    event.preventDefault();
    setSalvandoAuto(true);
    setErroAuto(null);
    setSucessoAuto(false);
    try {
      await updateAutoMessages({
        mensagem_iniciar: mensagemIniciar.trim(),
        mensagem_finalizar: mensagemFinalizar.trim(),
      });
      setSucessoAuto(true);
      // fila/chat já montados em outra rota precisam do texto novo sem F5.
      await refreshAutoMessages();
    } catch (error) {
      setErroAuto(normalizeError(error).message);
    } finally {
      setSalvandoAuto(false);
    }
  }

  // --- Respostas rápidas do chat ---
  // Agrupa preservando a ordem de primeira aparição (já vem ordenado por
  // "ordem" da API) — não é ordem alfabética de categoria.
  const grupos = useMemo(() => {
    const porCategoria = new Map<string, QuickReply[]>();
    for (const item of quickReplies) {
      const lista = porCategoria.get(item.categoria) ?? [];
      lista.push(item);
      porCategoria.set(item.categoria, lista);
    }
    return Array.from(porCategoria.entries());
  }, [quickReplies]);

  const [criandoResposta, setCriandoResposta] = useState(false);
  const [editandoResposta, setEditandoResposta] = useState<QuickReply | null>(null);
  const [categoria, setCategoria] = useState("");
  const [texto, setTexto] = useState("");
  const [enviandoResposta, setEnviandoResposta] = useState(false);
  const [erroResposta, setErroResposta] = useState<string | null>(null);

  const [excluindoAlvo, setExcluindoAlvo] = useState<QuickReply | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  function limparFormularioResposta() {
    setCategoria("");
    setTexto("");
    setErroResposta(null);
  }

  function abrirCriarResposta() {
    setEditandoResposta(null);
    limparFormularioResposta();
    setCriandoResposta((v) => !v);
  }

  function abrirEditarResposta(item: QuickReply) {
    setCriandoResposta(false);
    setEditandoResposta(item);
    setCategoria(item.categoria);
    setTexto(item.texto);
    setErroResposta(null);
  }

  function fecharFormularioResposta() {
    setCriandoResposta(false);
    setEditandoResposta(null);
    limparFormularioResposta();
  }

  async function handleSubmitResposta(event: FormEvent) {
    event.preventDefault();
    setEnviandoResposta(true);
    setErroResposta(null);
    try {
      if (editandoResposta) {
        await updateQuickReply(editandoResposta.id, {
          categoria: categoria.trim(),
          texto: texto.trim(),
        });
      } else {
        await createQuickReply({
          categoria: categoria.trim(),
          texto: texto.trim(),
          ordem: quickReplies.length,
        });
      }
      fecharFormularioResposta();
      await refreshQuickReplies();
    } catch (error) {
      setErroResposta(normalizeError(error).message);
    } finally {
      setEnviandoResposta(false);
    }
  }

  async function handleConfirmarExcluir() {
    if (!excluindoAlvo) return;
    setExcluindo(true);
    try {
      await deleteQuickReply(excluindoAlvo.id);
      setExcluindoAlvo(null);
      await refreshQuickReplies();
    } catch (error) {
      setErroResposta(normalizeError(error).message);
      setExcluindoAlvo(null);
    } finally {
      setExcluindo(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={22} className="animate-spin text-tide-500" />
      </div>
    );
  }

  const formRespostaAberto = criandoResposta || editandoResposta !== null;

  return (
    <div>
      <header className="mb-8">
        <p className="text-eyebrow font-semibold uppercase text-tide-500">Administração</p>
        <h1 className="mt-2 font-display text-display-md font-semibold text-primary">
          Mensagens
        </h1>
        <p className="mt-2 text-[0.9375rem] text-secondary">
          Personalize as mensagens automáticas de abertura/encerramento de atendimento e as
          respostas rápidas disponíveis no chat.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="mb-4 font-display text-[1.0625rem] font-semibold text-primary">
          Mensagens automáticas
        </h2>

        <form
          onSubmit={handleSalvarAuto}
          className="rounded-xl border border-app bg-raised p-5"
        >
          <div className="space-y-5">
            <div>
              <label
                htmlFor="mensagem_iniciar"
                className="mb-2 block text-eyebrow font-semibold uppercase text-muted"
              >
                Ao iniciar atendimento
              </label>
              <textarea
                id="mensagem_iniciar"
                value={mensagemIniciar}
                onChange={(e) => setMensagemIniciar(e.target.value)}
                rows={3}
                required
                className={TEXTAREA_CLASS}
              />
              <p className="mt-1.5 text-[0.75rem] text-muted">
                Use <code className="rounded bg-sunken px-1 py-0.5">[nome do atendente]</code>{" "}
                pra inserir automaticamente o nome de quem assumiu a conversa.
              </p>
            </div>

            <div>
              <label
                htmlFor="mensagem_finalizar"
                className="mb-2 block text-eyebrow font-semibold uppercase text-muted"
              >
                Ao finalizar atendimento
              </label>
              <textarea
                id="mensagem_finalizar"
                value={mensagemFinalizar}
                onChange={(e) => setMensagemFinalizar(e.target.value)}
                rows={3}
                required
                className={TEXTAREA_CLASS}
              />
            </div>
          </div>

          {erroAuto && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-alert/35 bg-alert/8 px-4 py-3">
              <AlertCircle size={17} className="mt-px shrink-0 text-alert" aria-hidden="true" />
              <p className="text-[0.875rem] leading-snug text-primary">{erroAuto}</p>
            </div>
          )}

          {sucessoAuto && !erroAuto && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-tide-500/35 bg-tide-500/8 px-4 py-3">
              <CheckCircle2 size={17} className="mt-px shrink-0 text-tide-400" aria-hidden="true" />
              <p className="text-[0.875rem] leading-snug text-primary">
                Mensagens automáticas atualizadas com sucesso.
              </p>
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <Button type="submit" loading={salvandoAuto} className="!px-5 !py-3">
              Salvar mensagens automáticas
            </Button>
          </div>
        </form>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-[1.0625rem] font-semibold text-primary">
            Respostas rápidas
          </h2>
          <Button
            variant={formRespostaAberto ? "ghost" : "primary"}
            className="!px-4 !py-2.5 text-[0.8125rem]"
            onClick={() =>
              formRespostaAberto ? fecharFormularioResposta() : abrirCriarResposta()
            }
          >
            <Plus size={15} />
            {formRespostaAberto ? "Cancelar" : "Nova resposta"}
          </Button>
        </div>

        {formRespostaAberto && (
          <form
            onSubmit={handleSubmitResposta}
            className="mb-6 rounded-xl border border-app bg-raised p-5"
          >
            <Field
              label="Categoria"
              id="categoria"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              icon={<Tag size={16} />}
              placeholder="Ex: Abertura/Acolhimento"
              required
            />

            <div className="mt-4">
              <label
                htmlFor="texto"
                className="mb-2 block text-eyebrow font-semibold uppercase text-muted"
              >
                Texto
              </label>
              <textarea
                id="texto"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={3}
                required
                className={TEXTAREA_CLASS}
              />
            </div>

            {erroResposta && (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-alert/35 bg-alert/8 px-4 py-3">
                <AlertCircle size={17} className="mt-px shrink-0 text-alert" aria-hidden="true" />
                <p className="text-[0.875rem] leading-snug text-primary">{erroResposta}</p>
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <Button type="submit" loading={enviandoResposta} className="!px-5 !py-3">
                {editandoResposta ? "Salvar alterações" : "Criar resposta"}
              </Button>
            </div>
          </form>
        )}

        {carregandoRespostas ? (
          <div className="flex justify-center py-16">
            <Loader2 size={22} className="animate-spin text-tide-500" />
          </div>
        ) : grupos.length === 0 ? (
          <p className="rounded-xl border border-app bg-raised px-5 py-6 text-center text-[0.875rem] text-secondary">
            Nenhuma resposta rápida cadastrada.
          </p>
        ) : (
          <div className="space-y-5">
            {grupos.map(([categoriaNome, itens]) => (
              <div
                key={categoriaNome}
                className="overflow-hidden rounded-xl border border-app bg-raised"
              >
                <p className="border-b border-app px-5 py-3 text-eyebrow font-semibold uppercase text-muted">
                  {categoriaNome}
                </p>
                <ul className="divide-y divide-app">
                  {itens.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start justify-between gap-3 px-5 py-3.5"
                    >
                      <p className="text-[0.875rem] leading-snug text-primary">{item.texto}</p>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => abrirEditarResposta(item)}
                          aria-label="Editar resposta"
                          className="rounded-md p-1.5 text-muted transition-colors hover:text-primary"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setExcluindoAlvo(item)}
                          aria-label="Excluir resposta"
                          className="rounded-md p-1.5 text-muted transition-colors hover:text-alert"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmModal
        open={excluindoAlvo !== null}
        title="Excluir resposta rápida?"
        description="Essa resposta some do popover do chat pra todos os atendentes. Não afeta mensagens já enviadas."
        confirmLabel="Excluir"
        variant="danger"
        loading={excluindo}
        onConfirm={handleConfirmarExcluir}
        onCancel={() => setExcluindoAlvo(null)}
      />
    </div>
  );
}
