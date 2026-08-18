"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Tag as TagIcon } from "lucide-react";
import { TagBadge } from "./TagBadge";
import { useTags } from "@/hooks/useTags";
import { attachClientTag, detachClientTag } from "@/lib/api";
import type { Tag } from "@/types";

interface ClientTagsPickerProps {
  telefone: string;
  tagsAtuais: Tag[];
  onChange: (tags: Tag[]) => void;
}

// Atribuir/remover etiqueta é ação do dia a dia de qualquer atendente
// (priorizar atendimento) — não passa por admin, diferente do catálogo em
// si (ver /etiquetas). Cada toggle já chama a API na hora (sem "salvar"),
// mesma imediatez de um like/unlike.
export function ClientTagsPicker({ telefone, tagsAtuais, onChange }: ClientTagsPickerProps) {
  const { tags: catalogo } = useTags();
  const [open, setOpen] = useState(false);
  const [processando, setProcessando] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  async function handleToggle(tag: Tag) {
    const jaTem = tagsAtuais.some((t) => t.id === tag.id);
    setProcessando(tag.id);
    try {
      const atualizado = jaTem
        ? await detachClientTag(telefone, tag.id)
        : await attachClientTag(telefone, tag.id);
      onChange(atualizado);
    } catch {
      // silencioso — picker fica como estava, atendente pode tentar de novo
    } finally {
      setProcessando(null);
    }
  }

  return (
    <div
      ref={containerRef}
      onClick={(event) => event.stopPropagation()}
      className="relative inline-flex flex-wrap items-center gap-1.5"
    >
      {tagsAtuais.map((tag) => (
        <TagBadge key={tag.id} tag={tag} onRemove={() => handleToggle(tag)} />
      ))}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Gerenciar etiquetas"
        aria-expanded={open}
        className="rounded-full border border-dashed border-app p-1 text-muted transition-colors hover:border-mist-500 hover:text-primary"
      >
        <TagIcon size={11} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-2 max-h-64 w-56 overflow-y-auto rounded-xl border border-app bg-raised p-1.5 shadow-panel"
        >
          {catalogo.length === 0 ? (
            <p className="px-2.5 py-2 text-[0.8125rem] text-muted">
              Nenhuma etiqueta cadastrada.
            </p>
          ) : (
            catalogo.map((tag) => {
              const ativa = tagsAtuais.some((t) => t.id === tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={ativa}
                  disabled={processando === tag.id}
                  onClick={() => handleToggle(tag)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[0.8125rem] text-secondary transition-colors hover:bg-sunken hover:text-primary disabled:opacity-55"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: tag.cor }}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate">{tag.nome}</span>
                  {ativa && <Check size={14} className="shrink-0 text-tide-500" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
