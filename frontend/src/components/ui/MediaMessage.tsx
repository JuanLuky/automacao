"use client";

import { useEffect, useState } from "react";
import { AlertCircle, FileText, Loader2 } from "lucide-react";
import { getMediaObjectUrl } from "@/lib/api";
import type { Message } from "@/types";
import { ImageLightbox } from "./ImageLightbox";

interface MediaMessageProps {
  message: Message;
}

// Busca o arquivo da mídia (imagem/áudio/documento) via endpoint autenticado
// e renderiza conforme o tipo. Usado tanto para mensagens recebidas do
// cliente quanto enviadas pelo atendente — o mesmo endpoint serve as duas.
export function MediaMessage({ message }: MediaMessageProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  const [lightboxAberto, setLightboxAberto] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelado = false;

    getMediaObjectUrl(message.conversation_id, message.id)
      .then((criada) => {
        if (cancelado) {
          URL.revokeObjectURL(criada);
          return;
        }
        objectUrl = criada;
        setUrl(criada);
      })
      .catch(() => {
        if (!cancelado) setErro(true);
      });

    return () => {
      cancelado = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [message.conversation_id, message.id]);

  if (erro) {
    return (
      <p className="flex items-center gap-1.5 text-[0.8125rem] text-muted">
        <AlertCircle size={14} />
        Não foi possível carregar a mídia.
      </p>
    );
  }

  if (!url) {
    return (
      <p className="flex items-center gap-1.5 text-[0.8125rem] text-muted">
        <Loader2 size={14} className="animate-spin" />
        Carregando mídia...
      </p>
    );
  }

  if (message.tipo === "imagem") {
    return (
      <>
        <button
          type="button"
          onClick={() => setLightboxAberto(true)}
          className="block cursor-zoom-in"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={message.midia_nome_arquivo ?? "Imagem"}
            className="max-h-64 max-w-[240px] rounded-lg object-cover"
          />
        </button>
        {lightboxAberto && (
          <ImageLightbox
            src={url}
            alt={message.midia_nome_arquivo ?? "Imagem"}
            downloadName={message.midia_nome_arquivo ?? undefined}
            onClose={() => setLightboxAberto(false)}
          />
        )}
      </>
    );
  }

  if (message.tipo === "audio") {
    return (
      <audio controls className="max-w-full" style={{ height: 36 }}>
        <source src={url} type={message.midia_mimetype ?? undefined} />
      </audio>
    );
  }

  if (message.tipo === "video") {
    return (
      <video controls className="max-h-64 max-w-[280px] rounded-lg">
        <source src={url} type={message.midia_mimetype ?? undefined} />
      </video>
    );
  }

  // documento
  return (
    <a
      href={url}
      download={message.midia_nome_arquivo ?? undefined}
      className="flex items-center gap-2 rounded-lg border border-app bg-sunken px-3 py-2 text-[0.8125rem] hover:border-mist-500"
    >
      <FileText size={18} className="shrink-0" />
      <span className="truncate">
        {message.midia_nome_arquivo ?? "Documento"}
      </span>
    </a>
  );
}
