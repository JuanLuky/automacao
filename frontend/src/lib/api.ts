import axios, { AxiosError } from "axios";
import type {
  ApiError,
  BusinessHours,
  Conversation,
  ConversationsPaginado,
  ConversationStatus,
  ConversationTipo,
  CreateDepartmentPayload,
  CreateStatusUpdatePayload,
  CreateUserPayload,
  Department,
  LoginPayload,
  LoginResponse,
  Message,
  SendMessagePayload,
  StatusAtual,
  StatusUpdate,
  TransferPayload,
  UpdateBusinessHoursPayload,
  UpdateDepartmentPayload,
  UpdateUserPayload,
  User,
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
}): Promise<ConversationsPaginado> {
  const { data } = await api.get<ConversationsPaginado>("/conversations", {
    params: filtros,
  });
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
