"use client";

import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: ReactNode;
  error?: boolean;
  /** Ativa o botão de mostrar/ocultar. Use em campos de senha. */
  revealable?: boolean;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, icon, error, revealable, id, className = "", ...props },
  ref,
) {
  const [revealed, setRevealed] = useState(false);
  const inputType = revealable ? (revealed ? "text" : "password") : props.type;

  return (
    <div className="group relative">
      <label
        htmlFor={id}
        className="mb-2 block text-eyebrow font-semibold uppercase text-muted"
      >
        {label}
      </label>

      <div className="relative">
        {icon && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted transition-colors group-focus-within:text-tide-500"
          >
            {icon}
          </span>
        )}

        <input
          {...props}
          id={id}
          ref={ref}
          type={inputType}
          aria-invalid={error || undefined}
          className={`
            w-full rounded-xl border bg-sunken py-3.5 text-[0.9375rem]
            text-primary transition-all duration-200
            placeholder:text-muted/60
            hover:border-mist-500/60
            focus:border-tide-500 focus:bg-raised focus:outline-none
            focus:ring-4 focus:ring-tide-500/12
            disabled:cursor-not-allowed disabled:opacity-55
            ${icon ? "pl-11" : "pl-4"}
            ${revealable ? "pr-12" : "pr-4"}
            ${error ? "border-alert focus:border-alert focus:ring-alert/12" : "border-app"}
            ${className}
          `}
        />

        {revealable && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? "Ocultar senha" : "Mostrar senha"}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted transition-colors hover:text-primary"
          >
            {revealed ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        )}
      </div>
    </div>
  );
});
