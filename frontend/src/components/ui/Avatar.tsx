"use client";

import { useState } from "react";
import { MessagesSquare, User } from "lucide-react";
import type { ConversationTipo } from "@/types";

interface AvatarProps {
  src?: string | null;
  alt: string;
  tipo: ConversationTipo;
  size?: number;
  className?: string;
  /** Mostra um skeleton pulsante em vez do ícone genérico — enquanto a busca (ver useWhatsappAvatar) ainda não voltou. */
  loading?: boolean;
}

// Foto de perfil (cliente) ou do grupo, vinda direto da URL da Evolution
// API (CDN do WhatsApp, ver useWhatsappAvatar) — sem proxy pelo backend,
// é servida publicamente pela própria URL assinada que a Evolution API
// devolve. Cai pro ícone genérico (mesmo padrão "sem nome" já usado em
// cliente_nome/telefone) se não tiver foto ou a URL falhar ao carregar.
export function Avatar({ src, alt, tipo, size = 40, className = "", loading = false }: AvatarProps) {
  const [erro, setErro] = useState(false);

  const estiloTamanho = { width: size, height: size };

  if (loading && !src) {
    return (
      <div
        style={estiloTamanho}
        aria-hidden="true"
        className={`shrink-0 animate-pulse rounded-full bg-sunken ${className}`}
      />
    );
  }

  if (src && !erro) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={alt}
        style={estiloTamanho}
        onError={() => setErro(true)}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  const Icon = tipo === "grupo" ? MessagesSquare : User;
  return (
    <div
      style={estiloTamanho}
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-sunken text-muted ${className}`}
    >
      <Icon size={size * 0.5} />
    </div>
  );
}
