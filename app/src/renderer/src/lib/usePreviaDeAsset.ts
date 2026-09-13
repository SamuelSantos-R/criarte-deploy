import { useEffect, useState } from "react";
import { previaDeAsset } from "@/lib/api";

/** A foto de um campo, lida do disco (ou do R2) como `data:` pra recortar. */
export function usePreviaDeAsset(siteId: string | null, caminho: string): { dataUrl: string | null; carregando: boolean } {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!siteId || !caminho) {
      setDataUrl(null);
      return;
    }
    let vivo = true;
    setCarregando(true);
    previaDeAsset(siteId, caminho)
      .then((r) => vivo && setDataUrl(r))
      .catch(() => vivo && setDataUrl(null))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [siteId, caminho]);

  return { dataUrl, carregando };
}
