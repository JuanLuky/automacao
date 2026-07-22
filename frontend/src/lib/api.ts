import axios, { AxiosError } from "axios";
import type { ApiError, LoginPayload, LoginResponse } from "@/types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

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
