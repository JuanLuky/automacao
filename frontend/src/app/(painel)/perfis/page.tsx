"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck, Tag, UserCog } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { useAuth } from "@/hooks/useAuth";
import { useRoleLabels } from "@/hooks/useRoleLabels";
import { getRoleLabels, normalizeError, updateRoleLabels } from "@/lib/api";

// Editar aqui só muda o texto exibido pra cada papel (ex: "Atendente" →
// "N1") — o papel em si (UserRole no backend: admin/atendente/supervisor)
// continua fixo, não dá pra criar um papel novo por aqui.
export default function PerfisPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { refresh } = useRoleLabels();

  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [atendente, setAtendente] = useState("");
  const [supervisor, setSupervisor] = useState("");
  const [admin, setAdmin] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  useEffect(() => {
    if (user && !isAdmin) router.replace("/atendimentos");
  }, [user, isAdmin, router]);

  const carregar = useCallback(async () => {
    setIsLoading(true);
    setErro(null);
    try {
      const labels = await getRoleLabels();
      setAtendente(labels.atendente);
      setSupervisor(labels.supervisor);
      setAdmin(labels.admin);
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
    setSalvando(true);
    setErroForm(null);
    setSucesso(false);
    try {
      await updateRoleLabels({
        atendente: atendente.trim(),
        supervisor: supervisor.trim(),
        admin: admin.trim(),
      });
      setSucesso(true);
      // Header/tela de usuários já montados em outra aba/rota precisam
      // saber que mudou — refresh() do provider dá conta disso sem F5.
      await refresh();
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
      <header className="mb-8">
        <p className="text-eyebrow font-semibold uppercase text-tide-500">Administração</p>
        <h1 className="mt-2 font-display text-display-md font-semibold text-primary">Perfis</h1>
        <p className="mt-2 text-[0.9375rem] text-secondary">
          Nome exibido pra cada papel no painel (ex: "Atendente" → "N1"). Não muda quem pode
          fazer o quê — só o texto mostrado no header e na tela de Usuários.
        </p>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field
              label="Atendente"
              id="atendente"
              value={atendente}
              onChange={(e) => setAtendente(e.target.value)}
              icon={<Tag size={16} />}
              required
            />
            <Field
              label="Supervisor"
              id="supervisor"
              value={supervisor}
              onChange={(e) => setSupervisor(e.target.value)}
              icon={<UserCog size={16} />}
              required
            />
            <Field
              label="Administrador"
              id="admin"
              value={admin}
              onChange={(e) => setAdmin(e.target.value)}
              icon={<ShieldCheck size={16} />}
              required
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
                Rótulos atualizados com sucesso.
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
