export type ConversationStatus =
  | "aguardando"
  | "em_atendimento"
  | "transferido"
  | "finalizado";

export type MessageOrigin = "cliente" | "atendente" | "sistema";

export type UserRole = "admin" | "atendente";

export interface Department {
  id: string;
  nome: string;
  codigo: string;
}

export interface User {
  id: string;
  nome: string;
  email: string;
  role: UserRole;
  departamento?: Department;
  departamento_id?: string;
}

export interface Message {
  id: string;
  origem: MessageOrigin;
  mensagem: string;
  criado_em: string;
  conversation_id: string;
}

export interface Conversation {
  id: string;
  telefone: string;
  cliente_nome: string | null;
  status: ConversationStatus;
  departamento_id: string;
  departamento?: Department;
  atendente_id: string | null;
  atendente?: User;
  criado_em: string;
  finalizado_em: string | null;
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
}

/** Erro normalizado para exibição na interface. */
export interface ApiError {
  message: string;
  statusCode?: number;
}
