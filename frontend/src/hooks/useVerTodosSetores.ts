"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "atendimento.verTodosSetores";

// Preferência pessoal do supervisor (ver UserRole no backend) — liga/desliga
// se ele vê a fila/dashboard de todos os setores ou só do próprio, salva no
// navegador (mesmo padrão de useTheme) pra sobreviver a navegação entre
// /fila e /dashboard e a um refresh da página. Puramente client-side: quem
// decide o que aparece é o frontend passando (ou não) departamento_id nas
// chamadas — mesmo nível de confiança já usado pro filtro de admin.
export function useVerTodosSetores() {
  const [verTodos, setVerTodosState] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setVerTodosState(window.localStorage.getItem(KEY) === "1");
    setMounted(true);
  }, []);

  const setVerTodos = useCallback((valor: boolean) => {
    window.localStorage.setItem(KEY, valor ? "1" : "0");
    setVerTodosState(valor);
  }, []);

  return { verTodos: mounted && verTodos, setVerTodos, mounted };
}
