import { useSyncExternalStore } from "react";
import { previewStart, previewStop, type Servidor } from "./api";

/**
 * Só existe um `next dev` de cada vez no main. Com as telas todas montadas ao
 * mesmo tempo, Convites e Preview têm que ler o mesmo estado — senão uma delas
 * fica apontando um iframe pra porta que a outra derrubou.
 */
let atual: Servidor | null = null;
const ouvintes = new Set<() => void>();

function avisar(): void {
  for (const f of ouvintes) f();
}

export function usarServidor(): Servidor | null {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => {
        ouvintes.delete(f);
      };
    },
    () => atual,
  );
}

export async function subirServidor(siteId: string): Promise<Servidor> {
  atual = await previewStart(siteId);
  avisar();
  return atual;
}

export async function derrubarServidor(): Promise<void> {
  await previewStop().catch(() => {});
  atual = null;
  avisar();
}
