/**
 * Utilitário compartilhado pelas mensagens automáticas (Assumir/Finalizar,
 * ver useAutoMessages) e pelo popover de respostas rápidas do chat (ver
 * useQuickReplies/QuickReplies.tsx) — os textos em si vêm da API agora
 * (editáveis em /mensagens, só admin), não são mais fixos aqui.
 *
 * "[nome do atendente]" é o único placeholder resolvido automaticamente —
 * os demais ("[setor]", "[horário]") ficam como texto literal pro atendente
 * editar à mão antes de enviar, porque não há um valor certo pra preencher
 * sozinho no momento em que o template é usado (ex: setor de destino da
 * transferência ainda não foi escolhido).
 */
export function resolverTemplate(texto: string, nomeAtendente: string): string {
  return texto.replace("[nome do atendente]", nomeAtendente);
}
