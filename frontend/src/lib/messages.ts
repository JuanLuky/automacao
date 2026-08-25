// Mensagens origem "sistema" cobrem dois casos bem diferentes: avisos
// administrativos curtos gerados pelo próprio backend (transferência,
// reabertura, divisor de histórico) e conteúdo de verdade que o bot manda
// pro cliente no WhatsApp (menu de setores, confirmação de setor — via n8n).
// Usado por ConversaPanel e ConversaPreviewPopover pra estilizar cada um
// diferente (pílula discreta vs. balão de mensagem) sem duplicar a lista.
const PREFIXOS_AVISO_ADMINISTRATIVO = [
  "Conversa transferida",
  "Conversa reaberta.",
  "Mensagens recebidas antes da escolha do setor:",
];

export function ehAvisoAdministrativo(mensagem: string): boolean {
  return PREFIXOS_AVISO_ADMINISTRATIVO.some((prefixo) => mensagem.startsWith(prefixo));
}
