"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getDepartments } from "@/lib/api";
import type { Department } from "@/types";

interface DepartmentsContextValue {
  departments: Department[];
  isLoading: boolean;
}

const DepartmentsContext = createContext<DepartmentsContextValue | undefined>(
  undefined,
);

export function DepartmentsProvider({ children }: { children: ReactNode }) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getDepartments()
      .then(setDepartments)
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <DepartmentsContext.Provider value={{ departments, isLoading }}>
      {children}
    </DepartmentsContext.Provider>
  );
}

export function useDepartments() {
  const context = useContext(DepartmentsContext);
  if (!context) {
    throw new Error("useDepartments precisa estar dentro de um DepartmentsProvider");
  }
  return context;
}
