import type { Config } from "tailwindcss";

// Paleta de cores que os gráficos do Tremor aceitam na prop "colors" — fixa,
// vem do próprio pacote (node_modules/@tremor/react/dist/lib/constants.js).
// Usada só pelo safelist abaixo (o Tremor monta a className em runtime a
// partir do nome, então o Tailwind precisa ser avisado pra não fazer
// tree-shake dessas classes).
const TREMOR_COLORS =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

const config: Config = {
  darkMode: "class",
  // Um único glob cobrindo todo src/ (não mais uma pasta por vez) — evita repetir
  // o bug de 2026-07-29, onde src/hooks/ ficou de fora do scan e o toast de
  // notificação renderizava sem nenhum estilo. Qualquer pasta nova (lib/, types/
  // etc.) que passe a ter JSX/className já entra automaticamente.
  //
  // O glob de node_modules/@tremor é exigido pelo próprio pacote (ver
  // dashboard: BarChart/BarList/AreaChart) — sem ele o Tailwind nunca vê as
  // classes usadas dentro do componente compilado do Tremor.
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@tremor/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    {
      pattern: new RegExp(`^(bg|text|border|ring|stroke|fill)-(${TREMOR_COLORS})-(50|100|200|300|400|500|600|700|800|900|950)$`),
      variants: ["hover", "ui-selected"],
    },
  ],
  theme: {
    extend: {
      colors: {
        // Tokens semânticos exigidos pelo Tremor (Card, Tooltip, eixos dos
        // gráficos etc. — nomes fixos, ver classes "tremor-*"/"dark-tremor-*"
        // dentro de node_modules/@tremor/react/dist/components). Valores
        // espelhando 1:1 os mesmos hex já usados em globals.css (--surface*,
        // --text-*, --border) e tide/abyss abaixo — de propósito, pra não
        // criar uma paleta paralela: se um token de tema mudar, espelhar
        // aqui também.
        tremor: {
          brand: {
            faint: "#F0FDFA",
            muted: "#99F6E4",
            subtle: "#2DD4BF",
            DEFAULT: "#14B8A6",
            emphasis: "#0D9488",
            inverted: "#07161F",
          },
          background: {
            muted: "#ECE4D6",
            subtle: "#F5F1EB",
            DEFAULT: "#FDFBF8",
            emphasis: "#0B1F2A",
          },
          border: { DEFAULT: "#DDD3C2" },
          ring: { DEFAULT: "#DDD3C2" },
          content: {
            subtle: "#56707D",
            DEFAULT: "#3F5C6B",
            emphasis: "#211D16",
            strong: "#211D16",
            inverted: "#FDFBF8",
          },
        },
        "dark-tremor": {
          brand: {
            faint: "#0B1F2A",
            muted: "#123040",
            subtle: "#2DD4BF",
            DEFAULT: "#14B8A6",
            emphasis: "#5EEAD4",
            inverted: "#07161F",
          },
          background: {
            muted: "#050F16",
            subtle: "#07161F",
            DEFAULT: "#0B1F2A",
            emphasis: "#1B4356",
          },
          border: { DEFAULT: "#1B4356" },
          ring: { DEFAULT: "#1B4356" },
          content: {
            subtle: "#7593A3",
            DEFAULT: "#B4C6D0",
            emphasis: "#E8EEF2",
            strong: "#E8EEF2",
            inverted: "#07161F",
          },
        },
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
        // Tamanhos que o Tremor espera (classes "text-tremor-*").
        "tremor-label": "0.75rem",
        "tremor-default": ["0.875rem", { lineHeight: "1.25rem" }],
        "tremor-title": ["1.125rem", { lineHeight: "1.75rem" }],
        "tremor-metric": ["1.875rem", { lineHeight: "2.25rem" }],
      },
      borderRadius: {
        // Raios que o Tremor espera (classes "rounded-tremor-*").
        "tremor-small": "0.375rem",
        "tremor-default": "0.5rem",
        "tremor-full": "9999px",
      },
      boxShadow: {
        panel: "0 24px 60px -20px rgba(0, 0, 0, 0.55)",
        "tide-glow": "0 0 0 1px rgba(45, 212, 191, 0.35), 0 0 28px -6px rgba(45, 212, 191, 0.4)",
        // Sombras que o Tremor espera (classes "shadow-tremor-*"/"shadow-dark-tremor-*").
        "tremor-input": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        "tremor-card": "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
        "tremor-dropdown": "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
        "dark-tremor-input": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        "dark-tremor-card": "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
        "dark-tremor-dropdown": "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
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
        // Sem "forwards" (removido do "both" original) de propósito: com
        // fill-mode "forwards", o elemento mantém "transform: translateY(0)"
        // pra sempre após a animação terminar — e mesmo sendo um deslocamento
        // nulo, qualquer valor de transform diferente de "none" cria um novo
        // stacking context. Isso prendia popovers com z-index alto (ex:
        // ClientTagsPicker) dentro do stacking context do próprio <li>,
        // fazendo o <li> seguinte da lista (fila/grupos) pintar por cima do
        // popover mesmo com z-index maior — bug encontrado em 2026-08-18 com
        // vários clientes na fila. Sem "forwards", ao fim da animação o
        // elemento volta pro valor padrão da cascata (transform: none), que
        // já é visualmente idêntico ao estado final da keyframe, mas sem
        // deixar stacking context nenhum pra trás. "backwards" (a outra
        // metade de "both") já não tinha efeito nenhum aqui, já que nenhum
        // uso desta animação define animation-delay.
        "queue-in": "queue-in 0.45s cubic-bezier(0.22, 1, 0.36, 1)",
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
