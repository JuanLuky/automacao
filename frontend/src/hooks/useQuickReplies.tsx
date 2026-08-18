"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getQuickReplies } from "@/lib/api";
import type { QuickReply } from "@/types";

interface QuickRepliesContextValue {
  quickReplies: QuickReply[];
  isLoading: boolean;
  /** Chamado pela tela /mensagens depois de criar/editar/excluir, pro popover do chat atualizar sem F5. */
  refresh: () => Promise<void>;
}

const QuickRepliesContext = createContext<QuickRepliesContextValue | undefined>(
  undefined,
);

export function QuickRepliesProvider({ children }: { children: ReactNode }) {
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await getQuickReplies();
      setQuickReplies(data);
    } catch {
      // silencioso — popover de respostas rápidas só fica vazio, não bloqueia o painel
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setIsLoading(false));
  }, [refresh]);

  return (
    <QuickRepliesContext.Provider value={{ quickReplies, isLoading, refresh }}>
      {children}
    </QuickRepliesContext.Provider>
  );
}

export function useQuickReplies() {
  const context = useContext(QuickRepliesContext);
  if (!context) {
    throw new Error("useQuickReplies precisa estar dentro de um QuickRepliesProvider");
  }
  return context;
}
