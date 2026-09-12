export type Papel = "serifada" | "cursiva";

/** Posição na prancheta de 1000px; `altura` é a altura da letra, `largura` estica só na horizontal. */
export type Letra = { char: string; x: number; y: number; altura: number; rot: number; largura: number };

export type Moldura = { tipo: "nenhuma" | "guirlanda"; escala: number; rot: number };

export type Composicao = {
  serifada: Letra;
  cursiva: Letra;
  /** Chave da fonte da cursiva: "milton" ou o nome de uma fonte arrastada. */
  fonte: string;
  /** Largura do respiro nos cruzamentos, em px da prancheta. */
  corte: number;
  cor: string;
  /** Escala do conjunto das duas letras, em torno do centro — encolhe pra caber na moldura. */
  escala: number;
  moldura: Moldura;
  comeca: Papel;
  /** Cruzamentos que ela trocou na mão, lembrados pela posição. */
  toques: { x: number; y: number; cima: Papel }[];
};

export const FONTE_PADRAO = "milton";

export function composicaoInicial(serifada: string, cursiva: string): Composicao {
  return {
    serifada: { char: serifada, x: 520, y: 500, altura: 620, rot: 0, largura: 1 },
    cursiva: { char: cursiva, x: 470, y: 505, altura: 720, rot: -4, largura: 1 },
    fonte: FONTE_PADRAO,
    corte: 6,
    cor: "#76855E",
    escala: 1,
    moldura: { tipo: "nenhuma", escala: 1, rot: 0 },
    comeca: "cursiva",
    toques: [],
  };
}

const entre = (min: number, max: number): number => min + Math.random() * (max - min);
const arred = (n: number): number => Math.round(n * 10) / 10;

/**
 * Sorteia outra disposição das mesmas letras. Os limites saem dos monogramas
 * que ela já fez: a serifada quase não se mexe, a cursiva é que passeia.
 * Cor, fonte, corte e moldura ficam — só a assinatura muda.
 */
export function variar(atual: Composicao): Composicao {
  const sx = arred(entre(480, 540));
  return {
    ...atual,
    serifada: {
      ...atual.serifada,
      x: sx,
      y: arred(entre(485, 515)),
      altura: arred(entre(560, 680)),
      rot: arred(entre(-2, 2)),
      largura: arred(entre(0.84, 1)),
    },
    cursiva: {
      ...atual.cursiva,
      x: arred(sx + entre(-90, 70)),
      y: arred(entre(430, 570)),
      altura: arred(entre(600, 820)),
      rot: arred(entre(-14, 6)),
      largura: arred(entre(0.9, 1.12)),
    },
    comeca: Math.random() < 0.5 ? "cursiva" : "serifada",
    toques: [],
  };
}

export type Guirlanda = { d: string; viewBox: [number, number, number, number] };

/** A moldura ocupa 76% da prancheta em escala 1, centrada — é a proporção do EO. */
export function transformMoldura(m: Moldura, g: Guirlanda): string {
  const [vx, vy, vw, vh] = g.viewBox;
  const s = (760 / Math.max(vw, vh)) * m.escala;
  return `translate(500 500) rotate(${m.rot}) scale(${s}) translate(${-(vx + vw / 2)} ${-(vy + vh / 2)})`;
}

export function montarSvg(comp: Composicao, d: string, guirlanda: Guirlanda | null): string {
  const moldura =
    comp.moldura.tipo === "guirlanda" && guirlanda
      ? `<path transform="${transformMoldura(comp.moldura, guirlanda)}" d="${guirlanda.d}"/>`
      : "";
  // A cor entra crua num atributo do SVG exportado: só hex passa.
  const cor = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(comp.cor) ? comp.cor : "#000000";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">` +
    `<g fill="${cor}">${moldura}<path d="${d}"/></g></svg>`
  );
}
