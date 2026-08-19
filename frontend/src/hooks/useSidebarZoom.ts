"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "atendimento.sidebarZoom";

const MIN = 1;
const MAX = 1.6;
const STEP = 0.15;
const PADRAO = 1;

// Largura "lógica" da coluna de lista em zoom 1 — o próprio container
// cresce na mesma proporção do zoom (ver BASE_WIDTH * fator em
// atendimentos/page.tsx), então aumentar o zoom não empurra o conteúdo pra
// fora nem espreme o texto: é o mesmo efeito de um Ctrl+"+" do navegador,
// só que restrito à sidebar.
export const SIDEBAR_BASE_WIDTH = 360;

// Zoom da sidebar de /atendimentos — pedido: cliente com dificuldade de
// visualização precisa de texto/avatar/ícones maiores, não só de uma coluna
// mais larga (uma coluna larga com texto pequeno não ajuda). Usa a
// propriedade CSS `zoom` (não `transform: scale`) porque `zoom` participa
// do reflow normal — o navegador recalcula layout como se essa região
// tivesse outra densidade de pixel, então texto, ícones, avatares e
// espaçamento crescem juntos sem cortar nem sobrepor conteúdo, ao contrário
// de `transform`, que exigiria compensar manualmente o tamanho da caixa.
// Persiste no navegador, mesmo padrão de useVerTodosSetores/useTheme
// (hidratação depois do mount, pra não dar mismatch de SSR).
export function useSidebarZoom() {
  const [fator, setFatorState] = useState(PADRAO);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const salvo = Number(window.localStorage.getItem(KEY));
    if (salvo && salvo >= MIN && salvo <= MAX) {
      setFatorState(salvo);
    }
    setMounted(true);
  }, []);

  const definir = useCallback((valor: number) => {
    const clamped = Math.min(MAX, Math.max(MIN, Math.round(valor * 100) / 100));
    window.localStorage.setItem(KEY, String(clamped));
    setFatorState(clamped);
  }, []);

  const aumentar = useCallback(() => {
    definir(fator + STEP);
  }, [fator, definir]);

  const diminuir = useCallback(() => {
    definir(fator - STEP);
  }, [fator, definir]);

  return {
    fator: mounted ? fator : PADRAO,
    aumentar,
    diminuir,
    podeAumentar: fator < MAX,
    podeDiminuir: fator > MIN,
  };
}
