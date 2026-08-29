import type { Config } from "tailwindcss";

export default {
  content: ["./src/renderer/index.html", "./src/renderer/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ground: "var(--ground)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        rule: "var(--rule)",
        "rule-strong": "var(--rule-strong)",
        muted: "var(--muted)",
        text: "var(--text)",
        accent: "var(--accent)",
        "accent-deep": "var(--accent-deep)",
        sage: "var(--sage)",
        ok: "var(--ok)",
        bad: "var(--bad)",
        paper: "var(--paper)",
        "paper-ink": "var(--paper-ink)",
        "paper-muted": "var(--paper-muted)",
      },
      fontFamily: {
        display: ['"Instrument Serif"', "Georgia", "serif"],
        sans: ['"IBM Plex Sans"', "ui-sans-serif", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      // Saltos reais, não 1.125 em tudo.
      fontSize: {
        serial: ["10px", { lineHeight: "1.1", letterSpacing: "0.14em" }],
        label: ["11px", { lineHeight: "1.3", letterSpacing: "0.16em" }],
        body: ["14px", { lineHeight: "1.55" }],
        h2: ["24px", { lineHeight: "1.15" }],
        display: ["42px", { lineHeight: "1.02", letterSpacing: "-0.015em" }],
      },
    },
  },
  plugins: [],
} satisfies Config;
