"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  loading?: boolean;
  variant?: "primary" | "ghost";
  fullWidth?: boolean;
}

export function Button({
  children,
  loading,
  variant = "primary",
  fullWidth,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const base =
    "relative inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-[0.9375rem] font-semibold transition-all duration-200 disabled:cursor-not-allowed";

  const variants = {
    primary:
      "bg-tide-500 text-abyss-900 hover:bg-tide-400 hover:shadow-tide-glow active:scale-[0.985] disabled:bg-mist-500/40 disabled:text-muted disabled:shadow-none",
    ghost:
      "border border-app bg-transparent text-secondary hover:border-mist-500 hover:text-primary",
  };

  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
    >
      {loading && <Loader2 size={17} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
