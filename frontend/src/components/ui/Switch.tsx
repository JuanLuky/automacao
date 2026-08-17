"use client";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

// Toggle simples (botão + role="switch"), sem lib de terceiros — mesmo
// espírito dos outros componentes de ui/ (Button, Select etc.). Usado hoje
// só pelo toggle "ver todos os setores" do supervisor (ver
// useVerTodosSetores), mas é genérico o bastante pra reaproveitar em
// qualquer outro liga/desliga futuro.
export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
        checked ? "bg-tide-500" : "bg-sunken border border-app"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}
