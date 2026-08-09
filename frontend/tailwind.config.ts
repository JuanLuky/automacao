import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  // Um único glob cobrindo todo src/ (não mais uma pasta por vez) — evita repetir
  // o bug de 2026-07-29, onde src/hooks/ ficou de fora do scan e o toast de
  // notificação renderizava sem nenhum estilo. Qualquer pasta nova (lib/, types/
  // etc.) que passe a ter JSX/className já entra automaticamente.
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Fundo — azul-petróleo profundo, não preto
        abyss: {
          900: "#07161F",
          800: "#0B1F2A",
          700: "#123040",
          600: "#1B4356",
        },
        // Cor de ação: assumir, enviar, online
        tide: {
          400: "#2DD4BF",
          500: "#14B8A6",
          600: "#0D9488",
        },
        // Hierarquia secundária
        mist: {
          100: "#E8EEF2",
          300: "#B4C6D0",
          500: "#7593A3",
          700: "#3F5C6B",
        },
        // Status
        waiting: "#F59E0B",
        active: "#2DD4BF",
        closed: "#64748B",
        alert: "#F87171",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      fontSize: {
        "display-lg": ["3.25rem", { lineHeight: "1.02", letterSpacing: "-0.03em" }],
        "display-md": ["2.25rem", { lineHeight: "1.08", letterSpacing: "-0.025em" }],
        eyebrow: ["0.6875rem", { lineHeight: "1", letterSpacing: "0.16em" }],
      },
      boxShadow: {
        panel: "0 24px 60px -20px rgba(0, 0, 0, 0.55)",
        "tide-glow": "0 0 0 1px rgba(45, 212, 191, 0.35), 0 0 28px -6px rgba(45, 212, 191, 0.4)",
      },
      keyframes: {
        "tide-sweep": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "queue-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.45", transform: "scale(0.82)" },
        },
      },
      animation: {
        "tide-sweep": "tide-sweep 3.5s ease-in-out infinite",
        "queue-in": "queue-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) both",
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
