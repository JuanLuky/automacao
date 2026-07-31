"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Building2,
  Hash,
  Loader2,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  ShieldOff,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Field } from "@/components/ui/Field";
import { useAuth } from "@/hooks/useAuth";
import {
  createDepartment,
  getDepartmentsAdmin,
  inactivateDepartment,
  normalizeError,
  reactivateDepartment,
  updateDepartment,
} from "@/lib/api";
import type { Department } from "@/types";

export default function DepartamentosPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [departamentos, setDepartamentos] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Department | null>(null);
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  const [inativandoAlvo, setInativandoAlvo] = useState<Department | null>(null);
  const [executandoAcao, setExecutandoAcao] = useState(false);

  useEffect(() => {
    if (user && !isAdmin) router.replace("/fila");
  }, [user, isAdmin, router]);

  const carregar = useCallback(async () => {
    setIsLoading(true);
    setErro(null);
    try {
      const data = await getDepartmentsAdmin();
      setDepartamentos(data);
    } catch (error) {
      setErro(normalizeError(error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) carregar();
  }, [isAdmin, carregar]);

  const departamentosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return departamentos;
    return departamentos.filter(
      (d) =>
        d.nome.toLowerCase().includes(termo) || d.codigo.toLowerCase().includes(termo),
    );
  }, [departamentos, busca]);

  function limparFormulario() {
    setNome("");
    setCodigo("");
    setErroForm(null);
  }

  function abrirCriar() {
    setEditando(null);
    limparFormulario();
    setCriando((v) => !v);
  }

  function abrirEditar(d: Department) {
    setCriando(false);
    setEditando(d);
    setNome(d.nome);
    setCodigo(d.codigo);
    setErroForm(null);
  }

  function fecharFormulario() {
    setCriando(false);
    setEditando(null);
    limparFormulario();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setEnviando(true);
    setErroForm(null);
    try {
      if (editando) {
        await updateDepartment(editando.id, {
          nome: nome.trim(),
          codigo: codigo.trim().toUpperCase(),
        });
      } else {
        await createDepartment({
          nome: nome.trim(),
          codigo: codigo.trim().toUpperCase(),
        });
      }
      fecharFormulario();
      carregar();
    } catch (error) {
      setErroForm(normalizeError(error).message);
    } finally {
      setEnviando(false);
    }
  }

  async function handleReativar(d: Department) {
    try {
      await reactivateDepartment(d.id);
      carregar();
    } catch (error) {
      setErro(normalizeError(error).message);
    }
  }

  async function handleConfirmarInativar() {
    if (!inativandoAlvo) return;
    setExecutandoAcao(true);
    try {
      await inactivateDepartment(inativandoAlvo.id);
      setInativandoAlvo(null);
      carregar();
    } catch (error) {
      setErro(normalizeError(error).message);
      setInativandoAlvo(null);
    } finally {
      setExecutandoAcao(false);
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
  const codigoAlterado = editando !== null && codigo.trim().toUpperCase() !== editando.codigo;

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow font-semibold uppercase text-tide-500">Administração</p>
          <h1 className="mt-2 font-display text-display-md font-semibold text-primary">Setores</h1>
        </div>

        <Button
          variant={formAberto ? "ghost" : "primary"}
          className="!px-4 !py-2.5 text-[0.8125rem]"
          onClick={() => (formAberto ? fecharFormulario() : abrirCriar())}
        >
          <Plus size={15} />
          {formAberto ? "Cancelar" : "Novo setor"}
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
              icon={<Building2 size={16} />}
              required
            />
            <Field
              label="Código"
              id="codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              icon={<Tag size={16} />}
              placeholder="Ex: JUR"
              required
            />
          </div>

          {(codigoAlterado || criando) && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-waiting/35 bg-waiting/10 px-4 py-3">
              <AlertCircle size={17} className="mt-px shrink-0 text-waiting" aria-hidden="true" />
              <p className="text-[0.8125rem] leading-snug text-primary">
                {criando
                  ? "Um setor novo não aparece automaticamente no menu do WhatsApp — o fluxo do n8n só oferece as opções 1 a 5 hoje. É preciso editar o workflow pra incluir esse código no menu."
                  : "Mudar o código pode quebrar o mapeamento do menu do WhatsApp no n8n, que associa cada opção (1-5) a um código fixo. Só altere se também for atualizar o workflow."}
              </p>
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
              {editando ? "Salvar alterações" : "Criar setor"}
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
          placeholder="Buscar por nome ou código..."
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
      ) : (
        <div className="overflow-hidden rounded-xl border border-app bg-raised">
          <ul className="divide-y divide-app">
            {departamentosFiltrados.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="text-[0.875rem] font-medium text-primary">{d.nome}</p>
                  <p className="flex items-center gap-1 text-[0.8125rem] text-secondary">
                    <Hash size={12} />
                    {d.codigo}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[0.8125rem]">
                  {!d.ativo && (
                    <span className="rounded-full bg-alert/12 px-2.5 py-1 text-[0.75rem] font-medium text-alert">
                      Inativo
                    </span>
                  )}

                  <div className="flex items-center gap-1 pl-1">
                    <button
                      type="button"
                      onClick={() => abrirEditar(d)}
                      aria-label={`Editar ${d.nome}`}
                      className="rounded-md p-1.5 text-muted transition-colors hover:text-primary"
                    >
                      <Pencil size={16} />
                    </button>
                    {d.ativo ? (
                      <button
                        type="button"
                        onClick={() => setInativandoAlvo(d)}
                        aria-label={`Inativar ${d.nome}`}
                        className="rounded-md p-1.5 text-muted transition-colors hover:text-waiting"
                      >
                        <ShieldOff size={16} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleReativar(d)}
                        aria-label={`Reativar ${d.nome}`}
                        className="rounded-md p-1.5 text-muted transition-colors hover:text-tide-500"
                      >
                        <ShieldCheck size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmModal
        open={inativandoAlvo !== null}
        title={`Inativar ${inativandoAlvo?.nome}?`}
        description="O setor some das opções de fila, transferência e cadastro de usuários, mas o histórico de conversas já vinculadas a ele é preservado. Pode ser revertido a qualquer momento."
        confirmLabel="Inativar"
        loading={executandoAcao}
        onConfirm={handleConfirmarInativar}
        onCancel={() => setInativandoAlvo(null)}
      />
    </div>
  );
}
