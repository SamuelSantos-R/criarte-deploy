import { createContext, useCallback, useContext, useMemo, useState, type ReactElement, type ReactNode } from "react";

/**
 * O estado que a barra de cor mostra. Vive aqui em cima porque a barra é uma
 * peça só, atravessa a janela inteira e tem de ser legível de qualquer aba —
 * a promessa é ler os quatro estados sem clicar em nada.
 */
export type Prova = {
  /** Convite em cima da mesa. */
  site: string | null;
  /** Há edição no ecrã que ainda não foi para o disco. */
  porGravar: boolean;
  /** Endereço do `next dev` a correr, ou null. */
  servidor: string | null;
  coopLigado: boolean;
  coopPares: number;
  /** Nome de quem está a segurar um campo do outro lado. Fora de registo. */
  coopTranca: string | null;
  publicacao: "parada" | "a-correr" | "publicado";
};

const INICIO: Prova = {
  site: null,
  porGravar: false,
  servidor: null,
  coopLigado: false,
  coopPares: 0,
  coopTranca: null,
  publicacao: "parada",
};

type Ctx = { prova: Prova; marcar: (p: Partial<Prova>) => void };

const ProvaCtx = createContext<Ctx>({ prova: INICIO, marcar: () => {} });

export function ProvaProvider({ children }: { children: ReactNode }): ReactElement {
  const [prova, setProva] = useState<Prova>(INICIO);
  const marcar = useCallback((p: Partial<Prova>) => {
    setProva((a) => {
      // Sem isto cada render de ecrã reescreveria o estado e a barra piscava.
      const igual = (Object.keys(p) as (keyof Prova)[]).every((k) => a[k] === p[k]);
      return igual ? a : { ...a, ...p };
    });
  }, []);
  const valor = useMemo(() => ({ prova, marcar }), [prova, marcar]);
  return <ProvaCtx.Provider value={valor}>{children}</ProvaCtx.Provider>;
}

export function useProva(): Ctx {
  return useContext(ProvaCtx);
}
