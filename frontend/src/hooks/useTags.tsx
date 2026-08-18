"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getTags } from "@/lib/api";
import type { Tag } from "@/types";

interface TagsContextValue {
  tags: Tag[];
  isLoading: boolean;
  /** Chamado pela tela /etiquetas depois de criar/editar/excluir, pro picker do chat/fila atualizar sem F5. */
  refresh: () => Promise<void>;
}

const TagsContext = createContext<TagsContextValue | undefined>(undefined);

export function TagsProvider({ children }: { children: ReactNode }) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await getTags();
      setTags(data);
    } catch {
      // silencioso — catálogo só fica vazio, não bloqueia o painel
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setIsLoading(false));
  }, [refresh]);

  return (
    <TagsContext.Provider value={{ tags, isLoading, refresh }}>
      {children}
    </TagsContext.Provider>
  );
}

export function useTags() {
  const context = useContext(TagsContext);
  if (!context) {
    throw new Error("useTags precisa estar dentro de um TagsProvider");
  }
  return context;
}
