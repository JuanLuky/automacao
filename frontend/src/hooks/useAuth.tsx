"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { login as loginRequest, tokenStorage, userStorage } from "@/lib/api";
import type { LoginPayload, User } from "@/types";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (payload: LoginPayload) => Promise<User>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const stored = userStorage.get();
    const token = tokenStorage.get();
    if (stored && token) setUser(stored);
    setIsLoading(false);
  }, []);

  const signIn = useCallback(async (payload: LoginPayload) => {
    const data = await loginRequest(payload);
    tokenStorage.set(data.access_token);
    userStorage.set(data.user);
    setUser(data.user);
    return data.user;
  }, []);

  const signOut = useCallback(() => {
    tokenStorage.clear();
    setUser(null);
    router.push("/login");
  }, [router]);

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
