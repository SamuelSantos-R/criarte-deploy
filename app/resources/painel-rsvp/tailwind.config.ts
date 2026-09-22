import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // As cores vêm do tema do painel (convite.json → custom properties no
        // <html>), não de um casal em particular.
        gold: "var(--p-destaque)",
        "gold-dark": "var(--p-destaque)",
        "gold-light": "var(--p-card-borda)",
        cream: "var(--p-fundo)",
        "cream-dark": "var(--p-card-borda)",
        text: "var(--p-texto)",
      },
      fontFamily: {
        // Cormorant – usada nos textos serif do form (labels, etc)
        cormorant: ["var(--font-cormorant)", "serif"],
        garamond: ["var(--font-garamond)", "serif"],
        // Cormorant Infant – usada nos NÚMEROS (21, 2026 etc) por ter dígitos arredondados
        infant: ["var(--font-infant)", "serif"],
        // Manstein – nome dos noivos (arquivo local em public/fonts/)
        manstein: ["var(--font-manstein)"],
        cinzel: ["var(--font-cinzel)", "serif"],
        noah: ["var(--font-noah)", "system-ui", "sans-serif"],
      },
      ringWidth: {
        "3": "3px",
      },
    },
  },
  plugins: [],
};

export default config;
