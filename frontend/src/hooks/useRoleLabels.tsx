"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getRoleLabels } from "@/lib/api";
import type { RoleLabels } from "@/types";

const PADRAO: RoleLabels = {
  atendente: "Atendente",
  supervisor: "Supervisor",
  admin: "Administrador",
};

interface RoleLabelsContextValue {
  roleLabels: RoleLabels;
  isLoading: boolean;
  /** Chamado pela tela /perfis depois de salvar, pra header/usuários atualizarem sem F5. */
  refresh: () => Promise<void>;
}

const RoleLabelsContext = createContext<RoleLabelsContextValue | undefined>(
  undefined,
);

export function RoleLabelsProvider({ children }: { children: ReactNode }) {
  const [roleLabels, setRoleLabels] = useState<RoleLabels>(PADRAO);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await getRoleLabels();
      setRoleLabels(data);
    } catch {
      // silencioso — cai no padrão em memória, não bloqueia o painel
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setIsLoading(false));
  }, [refresh]);

  return (
    <RoleLabelsContext.Provider value={{ roleLabels, isLoading, refresh }}>
      {children}
    </RoleLabelsContext.Provider>
  );
}

export function useRoleLabels() {
  const context = useContext(RoleLabelsContext);
  if (!context) {
    throw new Error("useRoleLabels precisa estar dentro de um RoleLabelsProvider");
  }
  return context;
}
