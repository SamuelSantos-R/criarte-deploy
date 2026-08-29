import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve("src/main/index.ts") } } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve("src/preload/index.ts") },
        // Preload em ESM não carrega com sandbox ligado (limitação do Electron).
        // Entre abrir mão do sandbox e emitir CJS, emite CJS.
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    root: resolve("src/renderer"),
    resolve: { alias: { "@": resolve("src/renderer/src") } },
    build: { rollupOptions: { input: { index: resolve("src/renderer/index.html") } } },
    plugins: [react()],
  },
});
