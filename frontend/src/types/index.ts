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
  // Só vêm preenchidos no payload do evento "nova_mensagem" via socket
  // (ver MessagesService.create no backend) — não fazem parte do histórico
  // retornado por GET /conversations/:id/messages.
  cliente_nome?: string | null;
  conversa_atendente_id?: string | null;
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
