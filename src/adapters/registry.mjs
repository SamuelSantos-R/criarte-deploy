// ============================================================================
// ADAPTER REGISTRY — Detecta qual base está sendo usada e retorna o adapter
// ============================================================================
import { ConviteTokenAdapter } from "./convite-token.mjs";
import { CasamentoAdapter } from "./casamento.mjs";
import { RsvpAdapter } from "./rsvp.mjs";
import { GenericoAdapter } from "./generico.mjs";
import { BaseAdapter } from "./base.mjs";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Ordem de detecção: configuração explícita primeiro, depois heurísticas.
// convite-token ANTES de casamento — casamento captura qualquer projeto Next.
const adapters = [
  new ConviteTokenAdapter(),
  new RsvpAdapter(),
  new CasamentoAdapter(),
  new GenericoAdapter(),
];

/**
 * Detecta qual adapter usar para o projeto no stagingDir.
 * 1. Se houver criarte.config.json com "base", usa o adapter correspondente
 * 2. Senão, tenta cada adapter em ordem (rsvp → casamento → generico)
 *
 * Retorna o adapter detectado.
 */
export function detectAdapter(stagingDir) {
  // Prioridade máxima: criarte.config.json explícito
  const configPath = join(stagingDir, "criarte.config.json");
  if (existsSync(configPath)) {
    try {
      const cfg = JSON.parse(readFileSync(configPath, "utf8"));
      if (cfg.base) {
        const found = adapters.find((a) => a.name === cfg.base);
        if (found) return found;
      }
    } catch {}
  }

  // Heurísticas
  for (const adapter of adapters) {
    if (adapter.detect(stagingDir)) return adapter;
  }

  // Fallback: adapter genérico
  return new BaseAdapter();
}

export { BaseAdapter, ConviteTokenAdapter, CasamentoAdapter, RsvpAdapter, GenericoAdapter };
export default adapters;
