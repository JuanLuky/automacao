"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Pencil, Plus, Search, Tag as TagIcon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Field } from "@/components/ui/Field";
import { TagBadge } from "@/components/ui/TagBadge";
import { useAuth } from "@/hooks/useAuth";
import { useTags } from "@/hooks/useTags";
import { createTag, deleteTag, normalizeError, updateTag } from "@/lib/api";
import type { Tag, TagComUso } from "@/types";

const COR_PADRAO = "#14B8A6";
const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;

// Contagem vem do backend junto do catálogo (GET /tags) — serve tanto pra
// linha da lista quanto pro aviso de exclusão, que antes falava em "todos
// os clientes" sem dizer quantos eram.
function rotuloUso(total: number): string {
  if (total === 0) return "nenhum cliente";
  return total === 1 ? "1 cliente" : `${total} clientes`;
}

export default function EtiquetasPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { tags, isLoading, refresh } = useTags();
  const [busca, setBusca] = useState("");

  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Tag | null>(null);
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState(COR_PADRAO);
  const [enviando, setEnviando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  const [excluindoAlvo, setExcluindoAlvo] = useState<TagComUso | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (user && !isAdmin) router.replace("/atendimentos");
  }, [user, isAdmin, router]);

  const tagsFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return tags;
    return tags.filter((t) => t.nome.toLowerCase().includes(termo));
  }, [tags, busca]);

  function limparFormulario() {
    setNome("");
    setCor(COR_PADRAO);
    setErroForm(null);
  }

  function abrirCriar() {
    setEditando(null);
    limparFormulario();
    setCriando((v) => !v);
  }

  function abrirEditar(t: Tag) {
    setCriando(false);
    setEditando(t);
    setNome(t.nome);
    setCor(t.cor);
    setErroForm(null);
  }

  function fecharFormulario() {
    setCriando(false);
    setEditando(null);
    limparFormulario();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!HEX_REGEX.test(cor)) {
      setErroForm("Cor inválida — use o formato #RRGGBB.");
      return;
    }
    setEnviando(true);
    setErroForm(null);
    try {
      if (editando) {
        await updateTag(editando.id, { nome: nome.trim(), cor });
      } else {
        await createTag({ nome: nome.trim(), cor });
      }
      fecharFormulario();
      await refresh();
    } catch (error) {
      setErroForm(normalizeError(error).message);
    } finally {
      setEnviando(false);
    }
  }

  async function handleConfirmarExcluir() {
    if (!excluindoAlvo) return;
    setExcluindo(true);
    try {
      await deleteTag(excluindoAlvo.id);
      setExcluindoAlvo(null);
      await refresh();
    } catch (error) {
      setErro(normalizeError(error).message);
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

  const formAberto = criando || editando !== null;

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow font-semibold uppercase text-tide-500">Administração</p>
          <h1 className="mt-2 font-display text-display-md font-semibold text-primary">
            Etiquetas
          </h1>
          <p className="mt-2 text-[0.9375rem] text-secondary">
            Crie etiquetas (ex: "Devedor", "Cliente Premium") pra atribuir aos clientes na fila e
            no chat, e priorizar o atendimento.
          </p>
        </div>

        <Button
          variant={formAberto ? "ghost" : "primary"}
          className="!px-4 !py-2.5 text-[0.8125rem]"
          onClick={() => (formAberto ? fecharFormulario() : abrirCriar())}
        >
          <Plus size={15} />
          {formAberto ? "Cancelar" : "Nova etiqueta"}
        </Button>
      </header>

      {formAberto && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-xl border border-app bg-raised p-5"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Nome"
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              icon={<TagIcon size={16} />}
              placeholder="Ex: Devedor"
              required
            />

            <div>
              <label
                htmlFor="cor"
                className="mb-2 block text-eyebrow font-semibold uppercase text-muted"
              >
                Cor
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  aria-label="Escolher cor"
                  value={HEX_REGEX.test(cor) ? cor : COR_PADRAO}
                  onChange={(e) => setCor(e.target.value)}
                  className="h-[3.25rem] w-14 shrink-0 cursor-pointer rounded-xl border border-app bg-sunken p-1"
                />
                <input
                  type="text"
                  id="cor"
                  value={cor}
                  onChange={(e) => setCor(e.target.value)}
                  placeholder="#14B8A6"
                  required
                  className="w-full rounded-xl border border-app bg-sunken px-4 py-3.5 text-[0.9375rem] text-primary placeholder:text-muted/60 hover:border-mist-500/60 focus:border-tide-500 focus:bg-raised focus:outline-none focus:ring-4 focus:ring-tide-500/12"
                />
              </div>
            </div>
          </div>

          {nome.trim() && HEX_REGEX.test(cor) && (
            <div className="mt-4">
              <TagBadge tag={{ id: "preview", nome: nome.trim(), cor, criado_em: "" }} />
            </div>
          )}

          {erroForm && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-alert/35 bg-alert/8 px-4 py-3">
              <AlertCircle size={17} className="mt-px shrink-0 text-alert" aria-hidden="true" />
              <p className="text-[0.875rem] leading-snug text-primary">{erroForm}</p>
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <Button type="submit" loading={enviando} className="!px-5 !py-3">
              {editando ? "Salvar alterações" : "Criar etiqueta"}
            </Button>
          </div>
        </form>
      )}

      <div className="relative mb-4 max-w-sm">
        <Search
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome..."
          className="w-full rounded-xl border border-app bg-sunken py-2.5 pl-10 pr-4 text-[0.875rem] text-primary placeholder:text-muted/60 focus:border-tide-500 focus:bg-raised focus:outline-none focus:ring-4 focus:ring-tide-500/12"
        />
      </div>

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
      ) : tagsFiltradas.length === 0 ? (
        <p className="rounded-xl border border-app bg-raised px-5 py-6 text-center text-[0.875rem] text-secondary">
          Nenhuma etiqueta cadastrada.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-app bg-raised">
          <ul className="divide-y divide-app">
            {tagsFiltradas.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <TagBadge tag={t} />
                  <span className="text-[0.8125rem] text-muted">{rotuloUso(t.total_clientes)}</span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => abrirEditar(t)}
                    aria-label={`Editar ${t.nome}`}
                    className="rounded-md p-1.5 text-muted transition-colors hover:text-primary"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setExcluindoAlvo(t)}
                    aria-label={`Excluir ${t.nome}`}
                    className="rounded-md p-1.5 text-muted transition-colors hover:text-alert"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmModal
        open={excluindoAlvo !== null}
        title={`Excluir ${excluindoAlvo?.nome}?`}
        description={
          excluindoAlvo && excluindoAlvo.total_clientes > 0
            ? `A etiqueta sai de ${rotuloUso(excluindoAlvo.total_clientes)} que a ${
                excluindoAlvo.total_clientes === 1 ? "tinha" : "tinham"
              } atribuída. Não tem como desfazer.`
            : "Nenhum cliente usa essa etiqueta hoje. Não tem como desfazer."
        }
        confirmLabel="Excluir"
        variant="danger"
        loading={excluindo}
        onConfirm={handleConfirmarExcluir}
        onCancel={() => setExcluindoAlvo(null)}
      />
    </div>
  );
}
