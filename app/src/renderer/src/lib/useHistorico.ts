import { useCallback, useRef, useState } from "react";

// Cada tecla digitada vira uma chamada de `definir`. Sem juntar as que chegam
// coladas, um Cmd+Z apagaria uma letra por vez e voltar um campo inteiro viraria
// trabalho braçal. Meio segundo é a pausa que separa "ainda digitando" de
// "mudei de ideia".
const JANELA_MS = 500;
const TETO = 200;

type Trilha<T> = { pilha: T[]; pos: number };

export type Historico<T> = {
  valor: T | null;
  /** `podeJuntar: false` para gesto que é um passo inteiro (sortear) mesmo repetido em rajada. */
  definir: (v: T, podeJuntar?: boolean) => void;
  /** Recomeça do zero — usado ao abrir outro convite ou ao descartar. */
  recomecar: (v: T | null) => void;
  desfazer: () => void;
  refazer: () => void;
  podeDesfazer: boolean;
  podeRefazer: boolean;
};

export function useHistorico<T>(): Historico<T> {
  const [trilha, setTrilha] = useState<Trilha<T>>({ pilha: [], pos: -1 });
  const carimbo = useRef(0);

  const definir = useCallback((v: T, podeJuntar = true) => {
    const agora = Date.now();
    const juntar = podeJuntar && agora - carimbo.current < JANELA_MS;
    // Passo inteiro também não aceita que o próximo ajuste se funda nele.
    carimbo.current = podeJuntar ? agora : 0;
    setTrilha(({ pilha, pos }) => {
      // Refazer morre assim que se digita por cima — é o galho abandonado.
      const cortada = pilha.slice(0, pos + 1);
      // A entrada 0 é o que veio do disco; fundir nela apagaria o ponto de volta.
      if (juntar && cortada.length > 1) cortada[cortada.length - 1] = v;
      else cortada.push(v);
      const sobra = Math.max(0, cortada.length - TETO);
      return { pilha: cortada.slice(sobra), pos: cortada.length - 1 - sobra };
    });
  }, []);

  const recomecar = useCallback((v: T | null) => {
    carimbo.current = 0;
    setTrilha(v === null ? { pilha: [], pos: -1 } : { pilha: [v], pos: 0 });
  }, []);

  // Zerar o carimbo: sem isso a próxima tecla funde com o passo pra onde
  // acabamos de voltar e o desfazer se desfaz sozinho.
  const desfazer = useCallback(() => {
    carimbo.current = 0;
    setTrilha((t) => ({ ...t, pos: Math.max(0, t.pos - 1) }));
  }, []);

  const refazer = useCallback(() => {
    carimbo.current = 0;
    setTrilha((t) => ({ ...t, pos: Math.min(t.pilha.length - 1, t.pos + 1) }));
  }, []);

  return {
    valor: trilha.pilha[trilha.pos] ?? null,
    definir,
    recomecar,
    desfazer,
    refazer,
    podeDesfazer: trilha.pos > 0,
    podeRefazer: trilha.pos >= 0 && trilha.pos < trilha.pilha.length - 1,
  };
}
