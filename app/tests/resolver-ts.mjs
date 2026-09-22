// O código do Studio importa sem extensão (quem resolve é o electron-vite). Pro
// teste correr no Node cru, este gancho tenta o mesmo caminho com `.ts`.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(especificador, contexto, proximo) {
  if (especificador.startsWith(".") && !/\.[cm]?[jt]s$/.test(especificador)) {
    const url = new URL(especificador + ".ts", contexto.parentURL);
    if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true, format: "module-typescript" };
  }
  return proximo(especificador, contexto);
}
