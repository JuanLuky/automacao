import axios, { AxiosError } from "axios";
import type {
  BotSession,
  ApiError,
  AutoMessages,
  BusinessHours,
  ClientTagsMap,
  Contact,
  ConversationsPaginado,
  Conversation,
  ConversationStatus,
  ConversationTipo,
  CreateContactPayload,
  CreateDepartmentPayload,
  CreateQuickReplyPayload,
  CreateStatusUpdatePayload,
  CreateTagPayload,
  CreateUserPayload,
  Department,
  ImportContactsResult,
  LoginPayload,
  LoginResponse,
  Message,
  QuickReply,
  RoleLabels,
  SendMessagePayload,
  StartConversationPayload,
  StartConversationResult,
  StatusAtual,
  StatusUpdate,
  Tag,
  TagComUso,
  TransferPayload,
  UpdateAutoMessagesPayload,
  UpdateBusinessHoursPayload,
  UpdateContactPayload,
  UpdateDepartmentPayload,
  UpdateQuickReplyPayload,
  UpdateRoleLabelsPayload,
  UpdateTagPayload,
  UpdateUserPayload,
  User,
  WhatsappContactRaw,
  WhatsappConversationInfo,
  WhatsappQrCode,
  WhatsappStatus,
} from "@/types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export const EVOLUTION_INSTANCE = process.env.NEXT_PUBLIC_EVOLUTION_INSTANCE ?? "";

const TOKEN_KEY = "atendimento.token";
const USER_KEY = "atendimento.user";

export const tokenStorage = {
  get: (): string | null => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(TOKEN_KEY);
  },
  set: (token: string) => window.localStorage.setItem(TOKEN_KEY, token),
  clear: () => {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  },
};

export const userStorage = {
  get: () => {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  set: (user: unknown) =>
    window.localStorage.setItem(USER_KEY, JSON.stringify(user)),
};

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Converte qualquer falha do axios em uma mensagem que faz sentido para
 * quem está olhando a tela — nunca expõe stack trace ou jargão de rede.
 */
export function normalizeError(error: unknown): ApiError {
  const err = error as AxiosError<{ message?: string | string[] }>;

  if (err.code === "ECONNABORTED") {
    return { message: "O servidor demorou demais para responder. Tente de novo." };
  }

  if (!err.response) {
    return {
      message:
        "Não foi possível falar com o servidor. Verifique se o backend está rodando.",
    };
  }

  const { status, data } = err.response;

  if (status === 401) {
    return { message: "E-mail ou senha incorretos.", statusCode: 401 };
  }

  if (status === 403) {
    return { message: "Você não tem acesso a esta área.", statusCode: 403 };
  }

  if (status >= 500) {
    return {
      message: "O servidor encontrou um erro. Tente novamente em instantes.",
      statusCode: status,
    };
  }

  const raw = data?.message;
  const message = Array.isArray(raw) ? raw[0] : raw;

  return { message: message ?? "Não foi possível concluir a ação.", statusCode: status };
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/auth/login", payload);
  return data;
}

export async function getCurrentUser() {
  const { data } = await api.post("/auth/me");
  return data;
}

export async function getDepartments(): Promise<Department[]> {
  const { data } = await api.get<Department[]>("/departments");
  return data;
}

/** Inclui setores inativos — só pra tela de administração (/departamentos). */
export async function getDepartmentsAdmin(): Promise<Department[]> {
  const { data } = await api.get<Department[]>("/departments/all");
  return data;
}

export async function createDepartment(
  payload: CreateDepartmentPayload,
): Promise<Department> {
  const { data } = await api.post<Department>("/departments", payload);
  return data;
}

export async function updateDepartment(
  id: string,
  payload: UpdateDepartmentPayload,
): Promise<Department> {
  const { data } = await api.patch<Department>(`/departments/${id}`, payload);
  return data;
}

export async function inactivateDepartment(id: string): Promise<Department> {
  const { data } = await api.patch<Department>(`/departments/${id}/inactivate`);
  return data;
}

export async function reactivateDepartment(id: string): Promise<Department> {
  const { data } = await api.patch<Department>(`/departments/${id}/reactivate`);
  return data;
}

export async function getConversations(filtros: {
  status?: ConversationStatus;
  departamento_id?: string;
  busca?: string;
  data_inicio?: string;
  data_fim?: string;
  tipo?: ConversationTipo;
  tag_id?: string;
}): Promise<Conversation[]> {
  const { data } = await api.get<Conversation[]>("/conversations", {
    params: filtros,
  });
  return data;
}

/** Igual a getConversations, mas paginado — usado pelas abas da fila e por /grupos. */
export async function getConversationsPaginado(filtros: {
  status?: ConversationStatus;
  departamento_id?: string;
  busca?: string;
  data_inicio?: string;
  data_fim?: string;
  pagina: number;
  por_pagina: number;
  tipo?: ConversationTipo;
  tag_id?: string;
  /** Esconde clientes que já têm atendimento em aberto (usado na aba de finalizados). */
  sem_ativo?: boolean;
}): Promise<ConversationsPaginado> {
  const { data } = await api.get<ConversationsPaginado>("/conversations", {
    params: filtros,
  });
  return data;
}

/**
 * Foto de quem escreveu uma mensagem dentro de um grupo — resolve "lid"
 * (id vinculado, ver Message.remetente_telefone) pro telefone real via a
 * lista de participantes do grupo antes de buscar a foto (por isso
 * precisa da conversa/grupo, não só do número).
 */
export async function getConversationParticipantAvatar(
  conversationId: string,
  instance: string,
  participante: string,
): Promise<{ foto_url: string | null }> {
  const { data } = await api.get<{ foto_url: string | null }>(
    `/conversations/${conversationId}/participant-avatar`,
    { params: { instance, participante } },
  );
  return data;
}

/** Nome (só grupo)/foto ao vivo do WhatsApp — nunca cacheado no backend. */
export async function getConversationWhatsappInfo(
  id: string,
  instance: string,
): Promise<WhatsappConversationInfo> {
  const { data } = await api.get<WhatsappConversationInfo>(
    `/conversations/${id}/whatsapp-info`,
    { params: { instance } },
  );
  return data;
}

export async function getConversation(id: string): Promise<Conversation | null> {
  try {
    const { data } = await api.get<Conversation>(`/conversations/${id}`);
    return data;
  } catch (error) {
    if ((error as AxiosError).response?.status === 404) return null;
    throw error;
  }
}

/**
 * Abre um atendimento a partir do painel, sem o cliente ter escrito antes.
 * O backend valida o número no WhatsApp e devolve ja_existia = true se já
 * houver conversa em aberto (nesse caso não cria nada). Não manda mensagem
 * nenhuma — quem envia a primeira é sendMessage, no fluxo normal.
 */
export async function startConversation(
  payload: StartConversationPayload,
): Promise<StartConversationResult> {
  const { data } = await api.post<StartConversationResult>(
    "/conversations/outbound",
    payload,
  );
  return data;
}

/** Quem está parado no menu do bot, sem ter escolhido setor ainda. */
export async function getBotSessions(): Promise<BotSession[]> {
  const { data } = await api.get<BotSession[]>("/bot-sessions");
  return data;
}

/** Tira da lista do bot sem abrir atendimento (número errado, spam). */
export async function dismissBotSession(telefone: string): Promise<void> {
  await api.delete(`/bot-sessions/${encodeURIComponent(telefone)}`);
}

export async function assumeConversation(id: string): Promise<Conversation> {
  const { data } = await api.patch<Conversation>(`/conversations/${id}/assume`);
  return data;
}

export async function transferConversation(
  id: string,
  payload: TransferPayload,
): Promise<Conversation> {
  const { data } = await api.patch<Conversation>(
    `/conversations/${id}/transfer`,
    payload,
  );
  return data;
}

export async function finishConversation(id: string): Promise<Conversation> {
  const { data } = await api.patch<Conversation>(`/conversations/${id}/finish`);
  return data;
}

export async function reopenConversation(id: string): Promise<Conversation> {
  const { data } = await api.patch<Conversation>(`/conversations/${id}/reopen`);
  return data;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const { data } = await api.get<Message[]>(
    `/conversations/${conversationId}/messages`,
  );
  return data;
}

export async function sendMessage(
  conversationId: string,
  payload: SendMessagePayload,
): Promise<Message> {
  const { data } = await api.post<Message>(
    `/conversations/${conversationId}/messages`,
    payload,
  );
  return data;
}

// Busca o arquivo de uma mensagem de mídia como blob (via client autenticado,
// evita expor o token em query string) e devolve uma object URL pronta pra
// usar em <img>/<audio>/link — quem chama é responsável por revogar
// (URL.revokeObjectURL) quando não precisar mais.
export async function getMediaObjectUrl(
  conversationId: string,
  messageId: string,
): Promise<string> {
  const { data } = await api.get(
    `/conversations/${conversationId}/messages/${messageId}/media`,
    { responseType: "blob" },
  );
  return URL.createObjectURL(data as Blob);
}

export async function getUsers(): Promise<User[]> {
  const { data } = await api.get<User[]>("/users");
  return data;
}

export async function createUser(payload: CreateUserPayload): Promise<User> {
  const { data } = await api.post<User>("/users", payload);
  return data;
}

export async function updateUser(
  id: string,
  payload: UpdateUserPayload,
): Promise<User> {
  const { data } = await api.patch<User>(`/users/${id}`, payload);
  return data;
}

export async function inactivateUser(id: string): Promise<User> {
  const { data } = await api.patch<User>(`/users/${id}/inactivate`);
  return data;
}

export async function reactivateUser(id: string): Promise<User> {
  const { data } = await api.patch<User>(`/users/${id}/reactivate`);
  return data;
}

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`/users/${id}`);
}

export async function getWhatsappStatus(instance: string): Promise<WhatsappStatus> {
  const { data } = await api.get<WhatsappStatus>("/whatsapp/status", {
    params: { instance },
  });
  return data;
}

export async function getWhatsappQrCode(instance: string): Promise<WhatsappQrCode> {
  const { data } = await api.get<WhatsappQrCode>("/whatsapp/qrcode", {
    params: { instance },
  });
  return data;
}

/** Público — usado na página /status, sem login. */
export async function getStatusAtual(): Promise<StatusAtual> {
  const { data } = await api.get<StatusAtual>("/status/atual");
  return data;
}

/** Público — usado na página /status, sem login. */
export async function getStatusHistorico(): Promise<StatusUpdate[]> {
  const { data } = await api.get<StatusUpdate[]>("/status/historico");
  return data;
}

export async function postStatusUpdate(
  payload: CreateStatusUpdatePayload,
): Promise<StatusUpdate> {
  const { data } = await api.post<StatusUpdate>("/status", payload);
  return data;
}

/** Público — o n8n consulta sem autenticação, mesmo padrão de getDepartments. */
export async function getBusinessHours(): Promise<BusinessHours> {
  const { data } = await api.get<BusinessHours>("/business-hours");
  return data;
}

export async function updateBusinessHours(
  payload: UpdateBusinessHoursPayload,
): Promise<BusinessHours> {
  const { data } = await api.patch<BusinessHours>("/business-hours", payload);
  return data;
}

/** Busca ao vivo na Evolution API (findContacts) — nunca cacheado no backend. */
export async function getWhatsappContacts(
  instance: string,
): Promise<WhatsappContactRaw[]> {
  const { data } = await api.get<WhatsappContactRaw[]>("/contacts/whatsapp", {
    params: { instance },
  });
  return data;
}

export async function getContacts(): Promise<Contact[]> {
  const { data } = await api.get<Contact[]>("/contacts");
  return data;
}

export async function createContact(
  payload: CreateContactPayload,
): Promise<Contact> {
  const { data } = await api.post<Contact>("/contacts", payload);
  return data;
}

export async function updateContact(
  id: string,
  payload: UpdateContactPayload,
): Promise<Contact> {
  const { data } = await api.patch<Contact>(`/contacts/${id}`, payload);
  return data;
}

export async function deleteContact(id: string): Promise<void> {
  await api.delete(`/contacts/${id}`);
}

export async function importContacts(
  contatos: CreateContactPayload[],
): Promise<ImportContactsResult> {
  const { data } = await api.post<ImportContactsResult>("/contacts/import", {
    contatos,
  });
  return data;
}

/** Qualquer atendente autenticado pode ler — o rótulo aparece pra todo mundo. */
export async function getRoleLabels(): Promise<RoleLabels> {
  const { data } = await api.get<RoleLabels>("/role-labels");
  return data;
}

export async function updateRoleLabels(
  payload: UpdateRoleLabelsPayload,
): Promise<RoleLabels> {
  const { data } = await api.patch<RoleLabels>("/role-labels", payload);
  return data;
}

/** Qualquer atendente autenticado pode ler — disparada ao Assumir/Finalizar por qualquer um. */
export async function getAutoMessages(): Promise<AutoMessages> {
  const { data } = await api.get<AutoMessages>("/auto-messages");
  return data;
}

export async function updateAutoMessages(
  payload: UpdateAutoMessagesPayload,
): Promise<AutoMessages> {
  const { data } = await api.patch<AutoMessages>("/auto-messages", payload);
  return data;
}

/** Qualquer atendente autenticado pode ler — usado no popover de respostas rápidas do chat. */
export async function getQuickReplies(): Promise<QuickReply[]> {
  const { data } = await api.get<QuickReply[]>("/quick-replies");
  return data;
}

export async function createQuickReply(
  payload: CreateQuickReplyPayload,
): Promise<QuickReply> {
  const { data } = await api.post<QuickReply>("/quick-replies", payload);
  return data;
}

export async function updateQuickReply(
  id: string,
  payload: UpdateQuickReplyPayload,
): Promise<QuickReply> {
  const { data } = await api.patch<QuickReply>(`/quick-replies/${id}`, payload);
  return data;
}

export async function deleteQuickReply(id: string): Promise<void> {
  await api.delete(`/quick-replies/${id}`);
}

/** Qualquer atendente autenticado pode ler — usado pro pill/picker de etiquetas na fila/chat. */
export async function getTags(): Promise<TagComUso[]> {
  const { data } = await api.get<TagComUso[]>("/tags");
  return data;
}

export async function createTag(payload: CreateTagPayload): Promise<Tag> {
  const { data } = await api.post<Tag>("/tags", payload);
  return data;
}

export async function updateTag(
  id: string,
  payload: UpdateTagPayload,
): Promise<Tag> {
  const { data } = await api.patch<Tag>(`/tags/${id}`, payload);
  return data;
}

export async function deleteTag(id: string): Promise<void> {
  await api.delete(`/tags/${id}`);
}

/** Busca em lote (evita N chamadas por linha visível na fila). */
export async function getClientTags(telefones: string[]): Promise<ClientTagsMap> {
  if (telefones.length === 0) return {};
  const { data } = await api.get<ClientTagsMap>("/client-tags", {
    params: { telefones: telefones.join(",") },
  });
  return data;
}

export async function attachClientTag(
  telefone: string,
  tagId: string,
): Promise<Tag[]> {
  const { data } = await api.post<Tag[]>("/client-tags", {
    telefone,
    tag_id: tagId,
  });
  return data;
}

export async function detachClientTag(
  telefone: string,
  tagId: string,
): Promise<Tag[]> {
  const { data } = await api.delete<Tag[]>(
    `/client-tags/${encodeURIComponent(telefone)}/${tagId}`,
  );
  return data;
}
