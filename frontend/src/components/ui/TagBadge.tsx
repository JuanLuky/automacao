"use client";

import { X } from "lucide-react";
import type { Tag } from "@/types";

interface TagBadgeProps {
  tag: Tag;
  onRemove?: () => void;
}

// Pill colorido a partir de um hex arbitrário escolhido pelo admin — usa
// estilo inline (não dá pra gerar classe Tailwind pra uma cor dinâmica).
// Fundo em baixa opacidade ("1f" ~12%) + texto na cor cheia, mesmo truque já
// documentado no CLAUDE.md — evita ter que calcular contraste/luminância
// pra um badge pequeno.
export function TagBadge({ tag, onRemove }: TagBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium leading-none"
      style={{
        backgroundColor: `${tag.cor}1f`,
        color: tag.cor,
        border: `1px solid ${tag.cor}55`,
      }}
    >
      {tag.nome}
      {onRemove && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          aria-label={`Remover etiqueta ${tag.nome}`}
          className="rounded-full opacity-70 transition-opacity hover:opacity-100"
        >
          <X size={10} />
        </button>
      )}
    </span>
  );
}
