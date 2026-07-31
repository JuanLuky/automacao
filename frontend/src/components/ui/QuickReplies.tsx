"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { QUICK_REPLY_GROUPS } from "@/lib/quickReplies";

interface QuickRepliesProps {
  disabled?: boolean;
  onSelect: (texto: string) => void;
}

export function QuickReplies({ disabled, onSelect }: QuickRepliesProps) {
  const [open, setOpen] = useState(false);
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
          {QUICK_REPLY_GROUPS.map((grupo) => (
            <div key={grupo.categoria} className="mb-1 last:mb-0">
              <p className="px-2.5 py-1.5 text-eyebrow font-semibold uppercase text-muted">
                {grupo.categoria}
              </p>
              {grupo.templates.map((texto) => (
                <button
                  key={texto}
                  type="button"
                  role="menuitem"
                  onClick={() => handleSelect(texto)}
                  className="block w-full rounded-lg px-2.5 py-2 text-left text-[0.8125rem] leading-snug text-secondary transition-colors hover:bg-sunken hover:text-primary"
                >
                  {texto}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
