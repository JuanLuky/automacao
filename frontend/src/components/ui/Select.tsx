"use client";

import { forwardRef, type ReactNode, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, id, className = "", children, ...props },
  ref,
) {
  return (
    <div className="group relative">
      {label && (
        <label
          htmlFor={id}
          className="mb-2 block text-eyebrow font-semibold uppercase text-muted"
        >
          {label}
        </label>
      )}

      <div className="relative">
        <select
          {...props}
          id={id}
          ref={ref}
          className={`
            w-full appearance-none rounded-xl border border-app bg-sunken py-3 pl-4 pr-10
            text-[0.9375rem] text-primary transition-all duration-200
            hover:border-mist-500/60
            focus:border-tide-500 focus:bg-raised focus:outline-none
            focus:ring-4 focus:ring-tide-500/12
            disabled:cursor-not-allowed disabled:opacity-55
            ${className}
          `}
        >
          {children}
        </select>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted"
        />
      </div>
    </div>
  );
});
