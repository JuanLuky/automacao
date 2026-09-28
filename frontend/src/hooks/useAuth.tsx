"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  atividadeStorage,
  login as loginRequest,
  registrarAoSessaoExpirar,
  tokenStorage,
  userStorage,
} from "@/lib/api";
import type { LoginPayload, User } from "@/types";

/** Sem interação por esse tempo, o painel desloga sozinho. */
const LIMITE_INATIVIDADE_MS = 30 * 60 * 1000;
const EVENTOS_ATIVIDADE = ["mousedown", "keydown", "scroll", "touchstart", "wheel"] as const;

/** Vai na URL do /login (?motivo=) pra tela explicar por que deslogou. */
export type MotivoSaida = "inatividade" | "expirou";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (payload: LoginPayload) => Promise<User>;
  signOut: (motivo?: MotivoSaida) => void;
}

/** Sessão salva que não serve mais: token vencido, ou parada há mais de 30 min. */
function sessaoSalvaInvalida(token: string): MotivoSaida | null {
  if (tokenStorage.expirado(token)) return "expirou";
  const ultima = atividadeStorage.get();
  if (!ultima || Date.now() - ultima > LIMITE_INATIVIDADE_MS) return "inatividade";
  return null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Antes daqui o painel confiava em qualquer token salvo: no dia seguinte
  // abria "logado" com o token vencido, e toda chamada voltava 401.
  useEffect(() => {
    const stored = userStorage.get();
    const token = tokenStorage.get();
    if (stored && token && !sessaoSalvaInvalida(token)) {
      setUser(stored);
    } else if (token) {
      tokenStorage.clear();
    }
    setIsLoading(false);
  }, []);

  const signIn = useCallback(async (payload: LoginPayload) => {
    const data = await loginRequest(payload);
    tokenStorage.set(data.access_token);
    userStorage.set(data.user);
    atividadeStorage.marcar();
    setUser(data.user);
    return data.user;
  }, []);

  // Evita redirecionar várias vezes quando vários requests voltam 401 juntos.
  const saindo = useRef(false);

  const signOut = useCallback(
    (motivo?: MotivoSaida) => {
      if (saindo.current) return;
      saindo.current = true;
      tokenStorage.clear();
      setUser(null);
      router.push(motivo ? `/login?motivo=${motivo}` : "/login");
    },
    [router],
  );

  useEffect(() => {
    if (user) saindo.current = false;
  }, [user]);

  // Qualquer 401 fora do login (token vencido no meio do uso) desloga.
  useEffect(() => {
    registrarAoSessaoExpirar(() => signOut("expirou"));
    return () => registrarAoSessaoExpirar(null);
  }, [signOut]);

  // Inatividade: marca a última interação (no máximo a cada 15s, pra não
  // escrever no localStorage a cada movimento de rolagem) e confere a cada
  // 30s. Mensagem chegando pelo socket não conta — só ação do atendente.
  useEffect(() => {
    if (!user) return;

    let ultimaMarcacao = 0;
    function marcar() {
      const agora = Date.now();
      if (agora - ultimaMarcacao < 15_000) return;
      ultimaMarcacao = agora;
      atividadeStorage.marcar();
    }

    function conferir() {
      const token = tokenStorage.get();
      // Outra aba deslogou (token some do localStorage compartilhado).
      if (!token) return signOut();
      const motivo = sessaoSalvaInvalida(token);
      if (motivo) signOut(motivo);
    }

    marcar();
    EVENTOS_ATIVIDADE.forEach((e) => window.addEventListener(e, marcar, { passive: true }));
    // Depois de suspender o notebook o intervalo pode atrasar — confere
    // também quando a aba volta a ficar visível.
    document.addEventListener("visibilitychange", conferir);
    const intervalo = window.setInterval(conferir, 30_000);

    return () => {
      EVENTOS_ATIVIDADE.forEach((e) => window.removeEventListener(e, marcar));
      document.removeEventListener("visibilitychange", conferir);
      window.clearInterval(intervalo);
    };
  }, [user, signOut]);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      signIn,
      signOut,
    }),
    [user, isLoading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth precisa estar dentro de um AuthProvider");
  }
  return context;
}
