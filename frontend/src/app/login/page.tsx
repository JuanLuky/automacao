"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Lock, Mail, Moon, Sun, Waves } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { LiveQueuePanel } from "@/components/LiveQueuePanel";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { normalizeError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const { signIn, isAuthenticated, isLoading } = useAuth();
  const { theme, toggle, mounted } = useTheme();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Quem já está logado não precisa ver esta tela.
  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace("/");
  }, [isLoading, isAuthenticated, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro(null);

    if (!email.trim() || !senha) {
      setErro("Preencha e-mail e senha para entrar.");
      return;
    }

    setEnviando(true);
    try {
      await signIn({ email: email.trim(), senha });
      router.push("/");
    } catch (error) {
      setErro(normalizeError(error).message);
      setSenha("");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <LiveQueuePanel />

      <section className="relative flex items-center justify-center bg-surface px-6 py-12 sm:px-10">
        {/* Alternador de tema */}
        <button
          type="button"
          onClick={toggle}
          aria-label={
            theme === "dark" ? "Usar tema claro" : "Usar tema escuro"
          }
          className="absolute right-6 top-6 rounded-lg border border-app p-2.5 text-secondary transition-colors hover:border-mist-500 hover:text-primary"
        >
          {mounted && theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <div className="w-full max-w-[400px]">
          {/* Marca compacta — só aparece quando o painel lateral está oculto */}
          <div className="mb-10 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-tide-500/15 ring-1 ring-tide-500/30">
              <Waves size={18} className="text-tide-500" />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight text-primary">
              Maré
            </span>
          </div>

          <header className="mb-9">
            <h2 className="font-display text-display-md font-semibold text-primary">
              Entrar no painel
            </h2>
            <p className="mt-2.5 text-[0.9375rem] text-secondary">
              Use as credenciais que o administrador cadastrou para você.
            </p>
          </header>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <Field
              id="email"
              label="E-mail"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="voce@empresa.com"
              icon={<Mail size={17} />}
              value={email}
              error={Boolean(erro)}
              onChange={(e) => setEmail(e.target.value)}
              disabled={enviando}
              autoFocus
            />

            <Field
              id="senha"
              label="Senha"
              autoComplete="current-password"
              placeholder="••••••••"
              icon={<Lock size={17} />}
              revealable
              value={senha}
              error={Boolean(erro)}
              onChange={(e) => setSenha(e.target.value)}
              disabled={enviando}
            />

            {erro && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-alert/35 bg-alert/8 px-4 py-3"
              >
                <AlertCircle
                  size={17}
                  className="mt-px shrink-0 text-alert"
                  aria-hidden="true"
                />
                <p className="text-[0.875rem] leading-snug text-primary">{erro}</p>
              </div>
            )}

            <Button type="submit" loading={enviando} fullWidth className="!mt-7">
              {enviando ? "Entrando" : "Entrar"}
            </Button>
          </form>

          <footer className="mt-9 border-t border-app pt-6">
            <p className="text-[0.8125rem] leading-relaxed text-muted">
              Esqueceu a senha? Fale com o administrador do sistema — as contas
              de atendente são criadas e redefinidas por lá.
            </p>
          </footer>
        </div>
      </section>
    </main>
  );
}
