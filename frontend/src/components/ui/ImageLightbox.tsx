"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";

interface ImageLightboxProps {
  src: string;
  alt: string;
  downloadName?: string;
  onClose: () => void;
}

// Visualização de imagem em tela cheia (fundo com blur) — antes clicar numa
// imagem de mensagem abria o arquivo numa aba nova do navegador; pedido do
// usuário pra ficar tudo dentro do painel, com um botão de download
// explícito. Mesmo padrão de portal/backdrop/Escape do ConfirmModal.
export function ImageLightbox({ src, alt, downloadName, onClose }: ImageLightboxProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-50 flex items-center justify-center bg-abyss-900/70 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div className="absolute right-4 top-4 flex gap-2">
        <a
          href={src}
          download={downloadName ?? "imagem"}
          onClick={(event) => event.stopPropagation()}
          aria-label="Baixar imagem"
          title="Baixar imagem"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-raised/90 text-primary shadow-panel transition-colors hover:bg-raised"
        >
          <Download size={18} />
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          title="Fechar"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-raised/90 text-primary shadow-panel transition-colors hover:bg-raised"
        >
          <X size={18} />
        </button>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-panel"
      />
    </div>,
    document.body,
  );
}
