/**
 * Templates de resposta rápida usados no chat (painel do atendente) e nas
 * mensagens automáticas disparadas ao Assumir/Finalizar uma conversa.
 *
 * "[nome do atendente]" é o único placeholder resolvido automaticamente
 * (ver resolverTemplate) — os demais ("[setor]", "[horário]") ficam como
 * texto literal pro atendente editar à mão antes de enviar, porque não há
 * um valor certo pra preencher sozinho no momento em que o template é usado
 * (ex: setor de destino da transferência ainda não foi escolhido).
 */

export interface QuickReplyGroup {
  categoria: string;
  templates: string[];
}

export const QUICK_REPLY_GROUPS: QuickReplyGroup[] = [
  {
    categoria: "Abertura/Acolhimento",
    templates: [
      "Olá! Tudo bem? Meu nome é [nome do atendente], vou te ajudar por aqui.",
      "Oi! Recebi sua mensagem, já estou verificando.",
    ],
  },
  {
    categoria: "Aguarde/Em análise",
    templates: [
      "Só um momento, estou verificando isso pra você.",
      "Vou confirmar essa informação e já te retorno.",
      "Peço desculpas pela demora, ainda estou analisando seu caso.",
    ],
  },
  {
    categoria: "Pedido de informação",
    templates: [
      "Poderia me confirmar seu nome completo e CPF, por favor?",
      "Você pode me enviar mais detalhes sobre isso?",
      "Tem algum número de pedido/protocolo relacionado?",
    ],
  },
  {
    categoria: "Encerramento",
    templates: [
      "Fico feliz em ajudar! Precisando, é só chamar por aqui.",
      "Fico à disposição! Tenha um ótimo dia.",
    ],
  },
  {
    categoria: "Transferência",
    templates: [
      "Vou te transferir para o setor de [setor], que vai continuar seu atendimento.",
      "Um momento, vou direcionar você para quem pode te ajudar melhor com isso.",
    ],
  },
  {
    categoria: "Fora do horário / alta demanda",
    templates: [
      "No momento estamos com um volume alto de atendimentos, mas já já te respondo.",
      "Nosso horário de atendimento é de [horário] — já anotei sua mensagem e responderemos assim que possível.",
    ],
  },
];

export function resolverTemplate(texto: string, nomeAtendente: string): string {
  return texto.replace("[nome do atendente]", nomeAtendente);
}

/** Disparada automaticamente ao clicar em "Assumir" (ver fila/page.tsx). */
export function mensagemAutomaticaAssumir(nomeAtendente: string): string {
  return resolverTemplate(
    "Olá! Tudo bem? Meu nome é [nome do atendente], vou te ajudar por aqui.",
    nomeAtendente,
  );
}

/** Disparada automaticamente ao confirmar "Finalizar" (ver conversas/[id]/page.tsx). */
export const MENSAGEM_AUTOMATICA_FINALIZAR = "Fico à disposição! Tenha um ótimo dia.";
