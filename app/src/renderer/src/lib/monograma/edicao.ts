import type { Glifo } from "./geometria";
import type { Composicao, Papel } from "./composicao";

/**
 * O que vai pro `edicao.json` da biblioteca. Os glifos viajam junto: quem abre
 * noutra máquina, sem a fonte arrastada, ainda ajusta posição, corte e cor.
 * Só trocar a letra é que pede a fonte de volta.
 */
export type Edicao = {
  v: 1;
  comp: Composicao;
  fonteNome: string;
  glifos: Record<Papel, { char: string; fonte: string; glifo: Glifo }>;
};

const arred = (g: Glifo): Glifo => ({
  ...g,
  polys: g.polys.map((p) => p.map(({ x, y }) => ({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }))),
});

export function montarEdicao(comp: Composicao, fonteNome: string, glifos: Record<Papel, Glifo>): Edicao {
  return {
    v: 1,
    comp,
    fonteNome,
    glifos: {
      serifada: { char: comp.serifada.char, fonte: "serifada", glifo: arred(glifos.serifada) },
      cursiva: { char: comp.cursiva.char, fonte: comp.fonte, glifo: arred(glifos.cursiva) },
    },
  };
}

function glifoValido(v: unknown): v is Glifo {
  const g = v as Glifo;
  return (
    !!g &&
    Array.isArray(g.polys) &&
    typeof g.altura === "number" &&
    g.polys.every((p) => Array.isArray(p) && p.every((q) => Number.isFinite(q?.x) && Number.isFinite(q?.y)))
  );
}

/** O JSON vem do bucket: confere a forma antes de o palco confiar nele. */
export function lerEdicao(bruto: unknown): Edicao {
  const e = bruto as Edicao;
  const letraOk = (l: unknown): boolean => {
    const x = l as Composicao["serifada"];
    return !!x && typeof x.char === "string" && ["x", "y", "altura", "rot", "largura"].every((k) => Number.isFinite((x as Record<string, unknown>)[k]));
  };
  if (
    !e ||
    e.v !== 1 ||
    !e.comp ||
    !letraOk(e.comp.serifada) ||
    !letraOk(e.comp.cursiva) ||
    typeof e.comp.fonte !== "string" ||
    !glifoValido(e.glifos?.serifada?.glifo) ||
    !glifoValido(e.glifos?.cursiva?.glifo)
  ) {
    throw new Error("a edição salva desse monograma está estragada");
  }
  return e;
}
