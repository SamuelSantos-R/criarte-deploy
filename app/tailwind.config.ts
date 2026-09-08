import type { Config } from "tailwindcss";

export default {
  content: ["./src/renderer/index.html", "./src/renderer/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Papéis — o valor vem da região (cabine por omissão, mesa em .light).
        ground: "var(--ground)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        rule: "var(--rule)",
        "rule-strong": "var(--rule-strong)",
        muted: "var(--muted)",
        text: "var(--text)",
        focus: "var(--focus)",

        // Tinta de processo — fixa, cada uma com o seu cargo.
        cyan: "var(--cyan)",
        magenta: "var(--magenta)",
        yellow: "var(--yellow)",
        reg: "var(--reg)",
        pencil: "var(--pencil)",
      },
      fontFamily: {
        sans: ["Archivo", "ui-sans-serif", "sans-serif"],
        narrow: ['"Archivo Narrow"', "Archivo", "ui-sans-serif", "sans-serif"],
        // Só para saída literal de máquina: consola, caminhos, endereços.
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      // Saltos reais, não 1.125 em tudo.
      fontSize: {
        gauge: ["10px", { lineHeight: "1.1", letterSpacing: "0.18em" }],
        label: ["11px", { lineHeight: "1.2", letterSpacing: "0.14em" }],
        body: ["13px", { lineHeight: "1.5" }],
        read: ["15px", { lineHeight: "1.5" }],
        head: ["20px", { lineHeight: "1.15", letterSpacing: "-0.01em" }],
        readout: ["34px", { lineHeight: "1", letterSpacing: "0.18em" }],
      },
    },
  },
  plugins: [],
} satisfies Config;
