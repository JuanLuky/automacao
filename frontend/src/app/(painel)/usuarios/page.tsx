"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Loader2,
  Mail,
  Pencil,
  Search,
  Trash2,
  User as UserIcon,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { useAuth } from "@/hooks/useAuth";
import { useDepartments } from "@/hooks/useDepartments";
import {
  createUser,
  deleteUser,
  getUsers,
  inactivateUser,
  normalizeError,
  reactivateUser,
  updateUser,
} from "@/lib/api";
import type { User, UserRole } from "@/types";

export default function UsuariosPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { departments } = useDepartments();
  const isAdmin = user?.role === "admin";

  const [usuarios, setUsuarios] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<User | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [departamentoId, setDepartamentoId] = useState("");
  const [role, setRole] = useState<UserRole>("atendente");
  const [enviando, setEnviando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  const [acaoConfirmando, setAcaoConfirmando] = useState<
    { tipo: "inativar" | "excluir"; usuario: User } | null
  >(null);
  const [executandoAcao, setExecutandoAcao] = useState(false);

  useEffect(() => {
    if (user && !isAdmin) router.replace("/fila");
  }, [user, isAdmin, router]);

  const carregar = useCallback(async () => {
    setIsLoading(true);
    setErro(null);
    try {
      const data = await getUsers();
      setUsuarios(data);
    } catch (error) {
      setErro(normalizeError(error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) carregar();
  }, [isAdmin, carregar]);

  const usuariosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return usuarios;
    return usuarios.filter(
      (u) =>
        u.nome.toLowerCase().includes(termo) || u.email.toLowerCase().includes(termo),
    );
  }, [usuarios, busca]);

  function limparFormulario() {
    setNome("");
    setEmail("");
    setSenha("");
    setDepartamentoId("");
    setRole("atendente");
    setErroForm(null);
  }

  function abrirCriar() {
    setEditando(null);
    limparFormulario();
    setCriando((v) => !v);
  }

  function abrirEditar(u: User) {
    setCriando(false);
    setEditando(u);
    setNome(u.nome);
    setEmail(u.email);
    setSenha("");
    setDepartamentoId(u.departamento_id ?? "");
    setRole(u.role);
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
        await updateUser(editando.id, {
          nome: nome.trim(),
          email: email.trim(),
          senha: senha || undefined,
          departamento_id: departamentoId || null,
          role,
        });
      } else {
        await createUser({
          nome: nome.trim(),
          email: email.trim(),
          senha,
          departamento_id: departamentoId || undefined,
          role,
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

  async function handleReativar(u: User) {
    try {
      await reactivateUser(u.id);
      carregar();
    } catch (error) {
      setErro(normalizeError(error).message);
    }
  }

  async function handleConfirmarAcao() {
    if (!acaoConfirmando) return;
    const { tipo, usuario } = acaoConfirmando;

    setExecutandoAcao(true);
    try {
      if (tipo === "inativar") {
        await inactivateUser(usuario.id);
      } else {
        await deleteUser(usuario.id);
      }
      setAcaoConfirmando(null);
      carregar();
    } catch (error) {
      setErro(normalizeError(error).message);
      setAcaoConfirmando(null);
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

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow font-semibold uppercase text-tide-500">Administração</p>
          <h1 className="mt-2 font-display text-display-md font-semibold text-primary">Usuários</h1>
        </div>

        <Button
          variant={formAberto ? "ghost" : "primary"}
          className="!px-4 !py-2.5 text-[0.8125rem]"
          onClick={() => (formAberto ? fecharFormulario() : abrirCriar())}
        >
          <UserPlus size={15} />
          {formAberto ? "Cancelar" : "Novo usuário"}
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
              icon={<UserIcon size={16} />}
              required
            />
            <Field
              label="E-mail"
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail size={16} />}
              required
            />
            <Field
              label={editando ? "Nova senha (opcional)" : "Senha"}
              id="senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              revealable
              minLength={6}
              required={!editando}
              placeholder={editando ? "Deixe em branco para manter a atual" : undefined}
            />
            <Select
              label="Setor"
              value={departamentoId}
              onChange={(e) => setDepartamentoId(e.target.value)}
            >
              <option value="">Nenhum</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </Select>
            <Select
              label="Papel"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
              <option value="atendente">Atendente</option>
              <option value="admin">Administrador</option>
            </Select>
          </div>

          {erroForm && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-alert/35 bg-alert/8 px-4 py-3">
              <AlertCircle size={17} className="mt-px shrink-0 text-alert" aria-hidden="true" />
              <p className="text-[0.875rem] leading-snug text-primary">{erroForm}</p>
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <Button type="submit" loading={enviando} className="!px-5 !py-3">
              {editando ? "Salvar alterações" : "Criar usuário"}
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
          placeholder="Buscar por nome ou e-mail..."
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
            {usuariosFiltrados.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="text-[0.875rem] font-medium text-primary">{u.nome}</p>
                  <p className="text-[0.8125rem] text-secondary">{u.email}</p>
                </div>
                <div className="flex items-center gap-3 text-[0.8125rem]">
                  {u.departamento && (
                    <span className="text-eyebrow font-semibold uppercase text-tide-400">
                      {u.departamento.codigo}
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2.5 py-1 text-[0.75rem] font-medium ${
                      u.role === "admin"
                        ? "bg-tide-500/12 text-tide-500"
                        : "bg-sunken text-secondary"
                    }`}
                  >
                    {u.role === "admin" ? "Administrador" : "Atendente"}
                  </span>
                  {!u.ativo && (
                    <span className="rounded-full bg-alert/12 px-2.5 py-1 text-[0.75rem] font-medium text-alert">
                      Inativo
                    </span>
                  )}

                  <div className="flex items-center gap-1 pl-1">
                    <button
                      type="button"
                      onClick={() => abrirEditar(u)}
                      aria-label={`Editar ${u.nome}`}
                      className="rounded-md p-1.5 text-muted transition-colors hover:text-primary"
                    >
                      <Pencil size={16} />
                    </button>
                    {u.ativo ? (
                      <button
                        type="button"
                        onClick={() => setAcaoConfirmando({ tipo: "inativar", usuario: u })}
                        aria-label={`Inativar ${u.nome}`}
                        className="rounded-md p-1.5 text-muted transition-colors hover:text-waiting"
                      >
                        <UserX size={16} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleReativar(u)}
                        aria-label={`Reativar ${u.nome}`}
                        className="rounded-md p-1.5 text-muted transition-colors hover:text-tide-500"
                      >
                        <UserCheck size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setAcaoConfirmando({ tipo: "excluir", usuario: u })}
                      aria-label={`Excluir ${u.nome}`}
                      className="rounded-md p-1.5 text-muted transition-colors hover:text-alert"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmModal
        open={acaoConfirmando !== null}
        variant={acaoConfirmando?.tipo === "excluir" ? "danger" : "default"}
        title={
          acaoConfirmando?.tipo === "excluir"
            ? `Excluir ${acaoConfirmando.usuario.nome}?`
            : `Inativar ${acaoConfirmando?.usuario.nome}?`
        }
        description={
          acaoConfirmando?.tipo === "excluir"
            ? "O usuário some da lista e não pode ser reativado. O histórico de conversas e mensagens é preservado."
            : "O usuário fica impedido de fazer login até ser reativado, mas continua aparecendo na lista."
        }
        confirmLabel={acaoConfirmando?.tipo === "excluir" ? "Excluir" : "Inativar"}
        loading={executandoAcao}
        onConfirm={handleConfirmarAcao}
        onCancel={() => setAcaoConfirmando(null)}
      />
    </div>
  );
}
