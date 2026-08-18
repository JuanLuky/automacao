"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getAutoMessages } from "@/lib/api";
import type { AutoMessages } from "@/types";

const PADRAO: AutoMessages = {
  mensagem_iniciar: "Olá! Tudo bem? Meu nome é [nome do atendente], vou te ajudar por aqui.",
  mensagem_finalizar: "Fico à disposição! Tenha um ótimo dia.",
};

interface AutoMessagesContextValue {
  autoMessages: AutoMessages;
  isLoading: boolean;
  /** Chamado pela tela /mensagens depois de salvar, pra fila/chat usarem o texto novo sem F5. */
  refresh: () => Promise<void>;
}

const AutoMessagesContext = createContext<AutoMessagesContextValue | undefined>(
  undefined,
);

export function AutoMessagesProvider({ children }: { children: ReactNode }) {
  const [autoMessages, setAutoMessages] = useState<AutoMessages>(PADRAO);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await getAutoMessages();
      setAutoMessages(data);
    } catch {
      // silencioso — cai no padrão em memória, não bloqueia o painel
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setIsLoading(false));
  }, [refresh]);

  return (
    <AutoMessagesContext.Provider value={{ autoMessages, isLoading, refresh }}>
      {children}
    </AutoMessagesContext.Provider>
  );
}

export function useAutoMessages() {
  const context = useContext(AutoMessagesContext);
  if (!context) {
    throw new Error("useAutoMessages precisa estar dentro de um AutoMessagesProvider");
  }
  return context;
}
