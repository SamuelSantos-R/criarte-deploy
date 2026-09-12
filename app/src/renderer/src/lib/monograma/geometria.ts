import * as ClipperNs from "clipper-lib";
import type { Font } from "opentype.js";
import type { Composicao, Letra, Papel } from "./composicao";

// O clipper-lib é CJS com `module.exports = ClipperLib`; conforme o bundler, o
// objeto chega no namespace ou no `default`.
const C = ((ClipperNs as unknown as { default?: typeof ClipperNs }).default ?? ClipperNs) as typeof ClipperNs;

type Pt = ClipperNs.IntPoint;
type Polys = ClipperNs.Paths;

export const PRANCHETA = 1000;
/** O clipper só trabalha com inteiro: 1px da prancheta vale 100 unidades. */
const K = 100;
const PASSOS_CURVA = 20;
/** Cruzamento menor que isso (em px²) é encosto de serifa, não entrelaçamento. */
const AREA_MINIMA = 4;

/** Glifo achatado em polígonos, com a origem no centro da caixa e altura conhecida. */
export type Glifo = { polys: { x: number; y: number }[][]; altura: number; vazio: boolean };

export function achatarGlifo(fonte: Font, char: string): Glifo {
  // Letra que a fonte não tem cai no .notdef (índice 0), que desenha um caixote.
  if (!char || fonte.charToGlyph(char).index === 0) return { polys: [], altura: 1, vazio: true };
  const caminho = fonte.getPath(char, 0, 0, 1000);
  const bb = caminho.getBoundingBox();
  const cx = (bb.x1 + bb.x2) / 2;
  const cy = (bb.y1 + bb.y2) / 2;
  const polys: { x: number; y: number }[][] = [];
  let atual: { x: number; y: number }[] = [];
  let ax = 0;
  let ay = 0;
  const pt = (x: number, y: number): void => {
    atual.push({ x: x - cx, y: y - cy });
  };
  for (const c of caminho.commands) {
    if (c.type === "M") {
      if (atual.length > 2) polys.push(atual);
      atual = [];
      pt(c.x, c.y);
      [ax, ay] = [c.x, c.y];
    } else if (c.type === "L") {
      pt(c.x, c.y);
      [ax, ay] = [c.x, c.y];
    } else if (c.type === "Q") {
      for (let i = 1; i <= PASSOS_CURVA; i++) {
        const t = i / PASSOS_CURVA;
        const u = 1 - t;
        pt(u * u * ax + 2 * u * t * c.x1 + t * t * c.x, u * u * ay + 2 * u * t * c.y1 + t * t * c.y);
      }
      [ax, ay] = [c.x, c.y];
    } else if (c.type === "C") {
      for (let i = 1; i <= PASSOS_CURVA; i++) {
        const t = i / PASSOS_CURVA;
        const u = 1 - t;
        pt(
          u * u * u * ax + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
          u * u * u * ay + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
        );
      }
      [ax, ay] = [c.x, c.y];
    } else if (c.type === "Z") {
      if (atual.length > 2) polys.push(atual);
      atual = [];
    }
  }
  if (atual.length > 2) polys.push(atual);
  return { polys, altura: Math.max(1, bb.y2 - bb.y1), vazio: polys.length === 0 };
}

/** Posiciona o glifo: escala pela altura, estica na largura, gira e leva ao ponto. */
function posicionar(g: Glifo, l: Letra, escalaGeral: number): Polys {
  const s = (l.altura / g.altura) * escalaGeral;
  const r = (l.rot * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const meio = PRANCHETA / 2;
  const ox = meio + (l.x - meio) * escalaGeral;
  const oy = meio + (l.y - meio) * escalaGeral;
  const polys = g.polys.map((p) =>
    p.map(({ x, y }) => {
      const dx = x * s * l.largura;
      const dy = y * s;
      return { X: Math.round((ox + dx * cos - dy * sin) * K), Y: Math.round((oy + dx * sin + dy * cos) * K) };
    }),
  );
  return operar(polys, [], C.ClipType.ctUnion);
}

function operar(sujeito: Polys, recorte: Polys, tipo: ClipperNs.ClipType): Polys {
  const c = new C.Clipper();
  c.AddPaths(sujeito, C.PolyType.ptSubject, true);
  if (recorte.length) c.AddPaths(recorte, C.PolyType.ptClip, true);
  const saida: Polys = [];
  c.Execute(tipo, saida, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return saida;
}

function engordar(polys: Polys, px: number): Polys {
  const o = new C.ClipperOffset(2, 0.25 * K);
  o.AddPaths(polys, C.JoinType.jtRound, C.EndType.etClosedPolygon);
  const saida: Polys = [];
  o.Execute(saida, px * K);
  return saida;
}

/** Cada mancha da interseção é um cruzamento independente. */
function manchas(polys: Polys): Polys[] {
  const c = new C.Clipper();
  const arvore = new C.PolyTree();
  c.AddPaths(polys, C.PolyType.ptSubject, true);
  c.Execute(C.ClipType.ctUnion, arvore, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return C.JS.PolyTreeToExPolygons(arvore).map((e) => [e.outer, ...e.holes]);
}

function centro(p: Polys): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const pt of p[0]) {
    sx += pt.X;
    sy += pt.Y;
    n++;
  }
  return { x: sx / n / K, y: sy / n / K };
}

export type Cruzamento = { x: number; y: number; cima: Papel };
export type Desenho = {
  /** Path único, já com os cortes, em polígono — rápido, é o que o palco redesenha no arraste. */
  d: string;
  /** Os mesmos contornos em px da prancheta, pra virar bézier só na hora de exportar. */
  aneis: [number, number][][];
  /** Contorno de cada letra sem corte, pra clicar e arrastar no palco. */
  contorno: Record<Papel, string>;
  cruzamentos: Cruzamento[];
};

const RAIO_TOQUE = 30;

/**
 * Quem passa por cima num cruzamento: o toque que ela deu perto dali, se deu;
 * senão alterna a partir de `comeca`, de cima pra baixo — é o que dá o trançado.
 */
function quemPorCima(comp: Composicao, i: number, c: { x: number; y: number }): Papel {
  const toque = comp.toques.find((t) => Math.hypot(t.x - c.x, t.y - c.y) < RAIO_TOQUE);
  if (toque) return toque.cima;
  const outro: Papel = comp.comeca === "serifada" ? "cursiva" : "serifada";
  return i % 2 === 0 ? comp.comeca : outro;
}

/** Caixa do desenho já cortado, em px da prancheta. */
export function caixa(aneis: [number, number][][]): { x1: number; y1: number; x2: number; y2: number } | null {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const a of aneis) {
    for (const [x, y] of a) {
      if (x < x1) x1 = x;
      if (y < y1) y1 = y;
      if (x > x2) x2 = x;
      if (y > y2) y2 = y;
    }
  }
  return Number.isFinite(x1) ? { x1, y1, x2, y2 } : null;
}

export function desenhar(comp: Composicao, glifos: Record<Papel, Glifo>): Desenho {
  const letras: Record<Papel, Polys> = {
    serifada: posicionar(glifos.serifada, comp.serifada, comp.escala),
    cursiva: posicionar(glifos.cursiva, comp.cursiva, comp.escala),
  };
  // O corte é medido na escala 1 e encolhe junto com o conjunto: numa guirlanda
  // a 0,55× o respiro tem a mesma cara que ela desenhou, e não fica grosso.
  const corte = comp.corte * comp.escala;
  const gordas: Record<Papel, Polys> = {
    serifada: corte > 0 ? engordar(letras.serifada, corte) : letras.serifada,
    cursiva: corte > 0 ? engordar(letras.cursiva, corte) : letras.cursiva,
  };

  const regioes = manchas(operar(letras.serifada, letras.cursiva, C.ClipType.ctIntersection))
    .filter((m) => Math.abs(C.JS.AreaOfPolygons(m)) > AREA_MINIMA * K * K)
    .map((m) => ({ m, c: centro(m) }))
    .sort((a, b) => a.c.y - b.c.y || a.c.x - b.c.x);

  const cortadas = { ...letras };
  const cruzamentos: Cruzamento[] = regioes.map(({ m, c }, i) => {
    const cima = quemPorCima(comp, i, c);
    const baixo: Papel = cima === "serifada" ? "cursiva" : "serifada";
    // O corte fica restrito à vizinhança do cruzamento; senão a letra de cima
    // abriria respiro em todo sítio onde só encosta na de baixo.
    const vizinhanca = engordar(m, corte * 4 + 6 * comp.escala);
    const faca = operar(gordas[cima], vizinhanca, C.ClipType.ctIntersection);
    cortadas[baixo] = operar(cortadas[baixo], faca, C.ClipType.ctDifference);
    return { ...c, cima };
  });

  const final = operar(cortadas.serifada, cortadas.cursiva, C.ClipType.ctUnion);
  return {
    d: paraD(final),
    aneis: final.map((p) => p.map((q): [number, number] => [q.X / K, q.Y / K])),
    contorno: { serifada: paraD(letras.serifada), cursiva: paraD(letras.cursiva) },
    cruzamentos,
  };
}

function paraD(polys: Polys): string {
  let d = "";
  for (const p of polys) {
    if (p.length < 3) continue;
    d += "M" + p.map((q: Pt) => `${+(q.X / K).toFixed(1)} ${+(q.Y / K).toFixed(1)}`).join("L") + "Z";
  }
  return d;
}
