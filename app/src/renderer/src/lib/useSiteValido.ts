import { useEffect } from "react";
import type { Site } from "./api";

/**
 * Mantém a escolha de site apontada para algo que existe. Faz duas coisas que
 * antes só a primeira era feita: escolhe o primeiro quando a lista chega, e
 * larga o id quando a pasta desaparece debaixo do pé — renomear um convite
 * noutro ecrã deixava este a apontar para uma pasta morta, e o job seguinte
 * morria com um ENOENT que nomeava o binário do Electron em vez do site.
 */
export function useSiteValido(
  sites: Site[],
  id: string | null,
  setId: (novo: string | null) => void,
): void {
  useEffect(() => {
    if (sites.length === 0) return;
    if (id === null) {
      setId(sites[0]?.id ?? null);
      return;
    }
    if (!sites.some((s) => s.id === id)) setId(sites[0]?.id ?? null);
  }, [sites, id, setId]);
}
