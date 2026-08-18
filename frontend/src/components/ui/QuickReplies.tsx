"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { useQuickReplies } from "@/hooks/useQuickReplies";
import type { QuickReply } from "@/types";

interface QuickRepliesProps {
  disabled?: boolean;
  onSelect: (texto: string) => void;
}

export function QuickReplies({ disabled, onSelect }: QuickRepliesProps) {
  const { quickReplies } = useQuickReplies();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Agrupa preservando a ordem de primeira aparição na lista (já ordenada
  // por "ordem" pela API) — não é ordem alfabética de categoria.
  const grupos = useMemo(() => {
    const porCategoria = new Map<string, QuickReply[]>();
    for (const item of quickReplies) {
      const lista = porCategoria.get(item.categoria) ?? [];
      lista.push(item);
      porCategoria.set(item.categoria, lista);
    }
    return Array.from(porCategoria.entries());
  }, [quickReplies]);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
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

  function handleSelect(texto: string) {
    onSelect(texto);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-label="Respostas rápidas"
        aria-expanded={open}
        className="rounded-xl border border-app bg-sunken p-3.5 text-secondary transition-colors hover:border-mist-500 hover:text-primary disabled:cursor-not-allowed disabled:opacity-55"
      >
        <MessageSquarePlus size={17} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-20 mb-2 max-h-80 w-80 overflow-y-auto rounded-xl border border-app bg-raised p-2 shadow-panel"
        >
          {grupos.length === 0 ? (
            <p className="px-2.5 py-2 text-[0.8125rem] text-muted">
              Nenhuma resposta rápida cadastrada.
            </p>
          ) : (
            grupos.map(([categoria, itens]) => (
              <div key={categoria} className="mb-1 last:mb-0">
                <p className="px-2.5 py-1.5 text-eyebrow font-semibold uppercase text-muted">
                  {categoria}
                </p>
                {itens.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    onClick={() => handleSelect(item.texto)}
                    className="block w-full rounded-lg px-2.5 py-2 text-left text-[0.8125rem] leading-snug text-secondary transition-colors hover:bg-sunken hover:text-primary"
                  >
                    {item.texto}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
