"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Mail, User as UserIcon, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { useAuth } from "@/hooks/useAuth";
import { useDepartments } from "@/hooks/useDepartments";
import { createUser, getUsers, normalizeError } from "@/lib/api";
import type { User, UserRole } from "@/types";

export default function UsuariosPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { departments } = useDepartments();
  const isAdmin = user?.role === "admin";

  const [usuarios, setUsuarios] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [departamentoId, setDepartamentoId] = useState("");
  const [role, setRole] = useState<UserRole>("atendente");
  const [enviando, setEnviando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

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

  function limparFormulario() {
    setNome("");
    setEmail("");
    setSenha("");
    setDepartamentoId("");
    setRole("atendente");
    setErroForm(null);
  }

  async function handleCriar(event: FormEvent) {
    event.preventDefault();
    setEnviando(true);
    setErroForm(null);
    try {
      await createUser({
        nome: nome.trim(),
        email: email.trim(),
        senha,
        departamento_id: departamentoId || undefined,
        role,
      });
      limparFormulario();
      setCriando(false);
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
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow font-semibold uppercase text-tide-500">Administração</p>
          <h1 className="mt-2 font-display text-display-md font-semibold text-primary">Usuários</h1>
        </div>

        <Button
          variant={criando ? "ghost" : "primary"}
          className="!px-4 !py-2.5 text-[0.8125rem]"
          onClick={() => {
            setCriando((v) => !v);
            if (criando) limparFormulario();
          }}
        >
          <UserPlus size={15} />
          {criando ? "Cancelar" : "Novo usuário"}
        </Button>
      </header>

      {criando && (
        <form
          onSubmit={handleCriar}
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
              label="Senha"
              id="senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              revealable
              minLength={6}
              required
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
              Criar usuário
            </Button>
          </div>
        </form>
      )}

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
            {usuarios.map((u) => (
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
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
