import type { ConversationStatus } from "@/types";

const CONFIG: Record<ConversationStatus, { label: string; dot: string; text: string }> = {
  aguardando: { label: "Aguardando", dot: "bg-waiting", text: "text-waiting" },
  em_atendimento: { label: "Em atendimento", dot: "bg-active", text: "text-tide-400" },
  transferido: { label: "Transferido", dot: "bg-sky-400", text: "text-sky-400" },
  finalizado: { label: "Finalizado", dot: "bg-closed", text: "text-mist-500" },
};

export function StatusBadge({ status }: { status: ConversationStatus }) {
  const config = CONFIG[status];

  return (
    <span className={`inline-flex items-center gap-1.5 text-[0.6875rem] font-medium uppercase tracking-wide ${config.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
