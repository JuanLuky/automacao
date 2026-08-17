"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  BookUser,
  Building2,
  ChevronDown,
  Clock,
  LayoutDashboard,
  ListChecks,
  Loader2,
  LogOut,
  Moon,
  QrCode,
  ShieldCheck,
  Sun,
  Users,
  UserPlus,
  Waves,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { DepartmentsProvider } from "@/hooks/useDepartments";
import { NotificationsProvider } from "@/hooks/useNotifications";

const NAV = [
  { href: "/fila", label: "Fila", icon: ListChecks },
  { href: "/grupos", label: "Grupos", icon: Users },
  { href: "/contatos", label: "Contatos", icon: BookUser },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

// Agrupados num dropdown único ("Administração") em vez de itens soltos na
// nav principal — com os 4 itens de NAV mais esses 5, a barra ficava
// apertada (e o item "Status" quase colado no botão de tema). Ver
// AdminNavMenu abaixo.
const NAV_ADMIN = [
  { href: "/usuarios", label: "Usuários", icon: UserPlus },
  { href: "/departamentos", label: "Setores", icon: Building2 },
  { href: "/whatsapp", label: "WhatsApp", icon: QrCode },
  { href: "/horario-funcionamento", label: "Horário", icon: Clock },
  { href: "/status/publicar", label: "Status", icon: Activity },
];

function AdminNavMenu({ pathname }: { pathname: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = NAV_ADMIN.some((item) => pathname?.startsWith(item.href));

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[0.875rem] font-medium transition-colors ${
          active || open
            ? "bg-tide-500/12 text-tide-500"
            : "text-secondary hover:bg-sunken hover:text-primary"
        }`}
      >
        <ShieldCheck size={15} />
        Administração
        <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-2 w-56 rounded-xl border border-app bg-raised p-1.5 shadow-panel"
        >
          {NAV_ADMIN.map(({ href, label, icon: Icon }) => {
            const itemActive = pathname?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[0.875rem] font-medium transition-colors ${
                  itemActive
                    ? "bg-tide-500/12 text-tide-500"
                    : "text-secondary hover:bg-sunken hover:text-primary"
                }`}
              >
                <Icon size={15} />
                {label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, signOut } = useAuth();
  const { theme, toggle, mounted } = useTheme();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/login");
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <Loader2 size={22} className="animate-spin text-tide-500" />
        <span className="sr-only">Carregando</span>
      </div>
    );
  }

  return (
    <DepartmentsProvider>
      <NotificationsProvider>
        <div className="min-h-screen bg-surface">
          <header className="sticky top-0 z-10 border-b border-app bg-raised/80 backdrop-blur">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
              <div className="flex items-center gap-8">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-tide-500/15 ring-1 ring-tide-500/30">
                    <Waves size={16} className="text-tide-500" />
                  </div>
                  <span className="font-display text-base font-semibold tracking-tight text-primary">
                    Maré
                  </span>
                </div>

                <nav className="flex items-center gap-1">
                  {NAV.map(({ href, label, icon: Icon }) => {
                    const active = pathname?.startsWith(href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[0.875rem] font-medium transition-colors ${
                          active
                            ? "bg-tide-500/12 text-tide-500"
                            : "text-secondary hover:bg-sunken hover:text-primary"
                        }`}
                      >
                        <Icon size={15} />
                        {label}
                      </Link>
                    );
                  })}
                  {user?.role === "admin" && <AdminNavMenu pathname={pathname} />}
                </nav>
              </div>

              <div className="flex items-center gap-4 border-l border-app pl-4">
                <button
                  type="button"
                  onClick={toggle}
                  aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
                  className="rounded-lg border border-app p-2 text-secondary transition-colors hover:border-mist-500 hover:text-primary"
                >
                  {mounted && theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                </button>

                <div className="hidden text-right sm:block">
                  <p className="text-[0.8125rem] font-medium text-primary">
                    {user?.nome}
                  </p>
                  <p className="text-[0.6875rem] uppercase tracking-wide text-muted">
                    {user?.role === "admin"
                      ? "Administrador"
                      : user?.role === "supervisor"
                        ? "Supervisor"
                        : "Atendente"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={signOut}
                  aria-label="Sair"
                  className="rounded-lg border border-app p-2 text-secondary transition-colors hover:border-alert/50 hover:text-alert"
                >
                  <LogOut size={16} />
                </button>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        </div>
      </NotificationsProvider>
    </DepartmentsProvider>
  );
}
