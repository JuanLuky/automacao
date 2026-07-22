"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    // O painel entra aqui na próxima etapa.
    if (!isAuthenticated) router.replace("/login");
  }, [isAuthenticated, isLoading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <Loader2 size={22} className="animate-spin text-tide-500" />
      <span className="sr-only">Carregando</span>
    </div>
  );
}
