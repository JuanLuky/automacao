"use client";

import { useParams, useRouter } from "next/navigation";
import { ConversaPanel } from "@/components/conversa/ConversaPanel";

// Rota dedicada de um atendimento. Continua existindo depois do inbox
// (/atendimentos) porque é o alvo de deep link, do clique na notificação e
// do botão "Abrir" da fila — o corpo em si vive no ConversaPanel, que as
// duas telas compartilham.
export default function ConversaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  // 8rem = header fixo (4rem) + o py-8 do <main> do layout.
  return (
    <div className="h-[calc(100vh-8rem)]">
      <ConversaPanel conversationId={id} onSair={() => router.push("/fila")} />
    </div>
  );
}
