export type ConversationStatus =
  | "aguardando"
  | "em_atendimento"
  | "transferido"
  | "finalizado";

export type ConversationTipo = "cliente" | "grupo";

export type MessageOrigin = "cliente" | "atendente" | "sistema";

export type MessageTipo = "texto" | "imagem" | "audio" | "documento" | "video";

// supervisor: como atendente por padrão (só o próprio setor), mas pode
// alternar pra ver todos os setores via um toggle no painel — ver
// useVerTodosSetores.
export type UserRole = "admin" | "atendente" | "supervisor";

export interface Department {
  id: string;
  nome: string;
  codigo: string;
  ativo: boolean;
}

export interface User {
  id: string;
  nome: string;
  email: string;
  role: UserRole;
  ativo: boolean;
  departamento?: Department;
  departamento_id?: string;
}

export interface Message {
  id: string;
  origem: MessageOrigin;
  mensagem: string;
  criado_em: string;
  conversation_id: string;
  atendente?: User | null;
  // Ausente/'texto' = mensagem de texto comum. Nos outros tipos, buscar o
  // arquivo via getMediaUrl(conversationId, messageId) — ver lib/api.ts.
  tipo?: MessageTipo;
  midia_mimetype?: string | null;
  midia_nome_arquivo?: string | null;
  // Só vêm preenchidos no payload do evento "nova_mensagem" via socket
  // (ver MessagesService.create no backend) — não fazem parte do histórico
  // retornado por GET /conversations/:id/messages.
  cliente_nome?: string | null;
  conversa_atendente_id?: string | null;
  // Só preenchidos quando origem = cliente E a conversa é um grupo (várias
  // pessoas escrevem na mesma conversa) — quem realmente mandou essa
  // mensagem. Ver "Grupos do WhatsApp" no CLAUDE.md.
  remetente_nome?: string | null;
  remetente_telefone?: string | null;
}

export interface Conversation {
  id: string;
  telefone: string;
  cliente_nome: string | null;
  // "grupo" não tem fila/status/setor — ver "Grupos" no CLAUDE.md.
  tipo: ConversationTipo;
  status: ConversationStatus;
  departamento_id: string | null;
  departamento?: Department | null;
  atendente_id: string | null;
  atendente?: User;
  criado_em: string;
  finalizado_em: string | null;
}

export interface ConversationsPaginado {
  dados: Conversation[];
  total: number;
  pagina: number;
  por_pagina: number;
}

export interface CreateDepartmentPayload {
  nome: string;
  codigo: string;
}

export interface UpdateDepartmentPayload {
  nome?: string;
  codigo?: string;
}

export interface CreateUserPayload {
  nome: string;
  email: string;
  senha: string;
  departamento_id?: string;
  role?: UserRole;
}

export interface UpdateUserPayload {
  nome?: string;
  email?: string;
  senha?: string;
  departamento_id?: string | null;
  role?: UserRole;
}

export interface LoginPayload {
  email: string;
  senha: string;
}

export interface LoginResponse {
  access_token: string;
  user: User;
}

export interface TransferPayload {
  departamento_destino_id: string;
  motivo?: string;
}

export interface SendMessagePayload {
  origem: MessageOrigin;
  mensagem: string;
  instance?: string;
  // Presentes só ao anexar um arquivo (ver Anexo em conversas/[id]/page.tsx).
  tipo?: MessageTipo;
  midia_base64?: string;
  midia_mimetype?: string;
  midia_nome_arquivo?: string;
  // Obrigatório só ao responder um grupo (tipo = grupo não tem "assumir",
  // então o backend não sabe quem está respondendo sem isso) — ver
  // conversas/[id]/page.tsx.
  atendente_id?: string;
}

/** Erro normalizado para exibição na interface. */
export interface ApiError {
  message: string;
  statusCode?: number;
}

/**
 * Passthrough do payload cru da Evolution API (GET /instance/connectionState)
 * — o formato varia entre versões, por isso os campos são todos opcionais.
 */
export interface WhatsappStatus {
  state?: string;
  instance?: { instanceName?: string; state?: string };
}

/** Passthrough do payload cru da Evolution API (GET /instance/connect). */
export interface WhatsappQrCode {
  base64?: string;
  pairingCode?: string;
  code?: string;
  state?: string;
  instance?: { instanceName?: string; state?: string };
}

export type StatusEstado = "operacional" | "instabilidade" | "indisponivel";

export interface StatusUpdate {
  id: string;
  estado: StatusEstado;
  mensagem: string;
  criado_em: string;
}

/** GET /status/atual pode devolver isso sem nenhum post ainda existir (criado_em null). */
export interface StatusAtual {
  id?: string;
  estado: StatusEstado;
  mensagem: string;
  criado_em: string | null;
}

export interface CreateStatusUpdatePayload {
  estado: StatusEstado;
  mensagem: string;
}

export interface BusinessHours {
  id: string;
  dias_funcionamento: number[];
  hora_inicio: string;
  hora_fim: string;
  mensagem_fora_horario: string;
  atualizado_em: string;
  aberto: boolean;
}

export interface UpdateBusinessHoursPayload {
  dias_funcionamento?: number[];
  hora_inicio?: string;
  hora_fim?: string;
  mensagem_fora_horario?: string;
}

/**
 * Rótulos de exibição dos três papéis (UserRole é fixo no código — isso é
 * só o texto mostrado, ver /perfis no painel).
 */
export interface RoleLabels {
  atendente: string;
  supervisor: string;
  admin: string;
}

export interface UpdateRoleLabelsPayload {
  atendente?: string;
  supervisor?: string;
  admin?: string;
}

/** Contato gerenciado pelo Maré (adicionar/editar/excluir/importar) — ver aba /contatos. */
export interface Contact {
  id: string;
  nome: string;
  telefone: string;
  criado_em: string;
}

export interface CreateContactPayload {
  nome: string;
  telefone: string;
}

export interface UpdateContactPayload {
  nome?: string;
  telefone?: string;
}

export interface ImportContactsResult {
  criados: number;
  ignorados: number;
}

/**
 * Mensagens automáticas disparadas ao Assumir/Finalizar uma conversa —
 * editáveis em /mensagens (só admin). "[nome do atendente]" em
 * mensagem_iniciar é resolvido no frontend (ver resolverTemplate).
 */
export interface AutoMessages {
  mensagem_iniciar: string;
  mensagem_finalizar: string;
}

export interface UpdateAutoMessagesPayload {
  mensagem_iniciar?: string;
  mensagem_finalizar?: string;
}

/** Template de resposta rápida do chat — editável em /mensagens (só admin). */
export interface QuickReply {
  id: string;
  categoria: string;
  texto: string;
  ordem: number;
  criado_em: string;
}

export interface CreateQuickReplyPayload {
  categoria: string;
  texto: string;
  ordem?: number;
}

export interface UpdateQuickReplyPayload {
  categoria?: string;
  texto?: string;
  ordem?: number;
}

/**
 * Etiqueta do catálogo (ex: "Devedor", "Cliente Premium") — editável em
 * /etiquetas (só admin). "cor" é um hex (#rrggbb).
 */
export interface Tag {
  id: string;
  nome: string;
  cor: string;
  criado_em: string;
}

export interface CreateTagPayload {
  nome: string;
  cor: string;
}

export interface UpdateTagPayload {
  nome?: string;
  cor?: string;
}

/** Mapa telefone -> etiquetas atribuídas a esse cliente (ver GET /client-tags). */
export type ClientTagsMap = Record<string, Tag[]>;

/**
 * Passthrough do payload cru da Evolution API (POST /chat/findContacts) —
 * formato varia entre versões, normalizado em contatos/page.tsx.
 */
export type WhatsappContactRaw = Record<string, unknown>;

/**
 * Nome (só grupo) + foto de perfil ao vivo do WhatsApp de uma conversa —
 * ver GET /conversations/:id/whatsapp-info. Nunca persistido; usado pelo
 * componente Avatar/useWhatsappAvatar.
 */
export interface WhatsappConversationInfo {
  nome: string | null;
  foto_url: string | null;
}
