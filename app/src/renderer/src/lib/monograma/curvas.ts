// ============================================================================
// CURVAS — polígono de volta a bézier. O corte trabalha com polígono (é o que o
// clipper entende), mas polígono facetado aparece em impressão grande e pesa no
// convite. Ajuste de curvas de Schneider (Graphics Gems, 1990), cantos à parte.
// ============================================================================

type P = [number, number];

const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const soma = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const esc = (a: P, s: number): P => [a[0] * s, a[1] * s];
const pesc = (a: P, b: P): number => a[0] * b[0] + a[1] * b[1];
const dist = (a: P, b: P): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const unit = (a: P): P => {
  const l = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / l, a[1] / l];
};

type Bez = [P, P, P, P];

function bezier(b: Bez, t: number): P {
  const u = 1 - t;
  return [
    u * u * u * b[0][0] + 3 * u * u * t * b[1][0] + 3 * u * t * t * b[2][0] + t * t * t * b[3][0],
    u * u * u * b[0][1] + 3 * u * u * t * b[1][1] + 3 * u * t * t * b[2][1] + t * t * t * b[3][1],
  ];
}
function derivada(b: Bez, t: number): P {
  const u = 1 - t;
  return soma(soma(esc(sub(b[1], b[0]), 3 * u * u), esc(sub(b[2], b[1]), 6 * u * t)), esc(sub(b[3], b[2]), 3 * t * t));
}
function derivada2(b: Bez, t: number): P {
  return soma(esc(soma(sub(b[2], esc(b[1], 2)), b[0]), 6 * (1 - t)), esc(soma(sub(b[3], esc(b[2], 2)), b[1]), 6 * t));
}

function parametrizar(pts: P[]): number[] {
  const u = [0];
  for (let i = 1; i < pts.length; i++) u.push(u[i - 1] + dist(pts[i], pts[i - 1]));
  const total = u[u.length - 1] || 1;
  return u.map((v) => v / total);
}

function gerar(pts: P[], u: number[], t1: P, t2: P): Bez {
  const p0 = pts[0];
  const p3 = pts[pts.length - 1];
  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;
  for (let i = 0; i < pts.length; i++) {
    const t = u[i];
    const s = 1 - t;
    const a1 = esc(t1, 3 * s * s * t);
    const a2 = esc(t2, 3 * s * t * t);
    c00 += pesc(a1, a1);
    c01 += pesc(a1, a2);
    c11 += pesc(a2, a2);
    const tmp = sub(pts[i], bezier([p0, p0, p3, p3], t));
    x0 += pesc(a1, tmp);
    x1 += pesc(a2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  const segLen = dist(p0, p3);
  let alfa1 = det === 0 ? 0 : (x0 * c11 - x1 * c01) / det;
  let alfa2 = det === 0 ? 0 : (c00 * x1 - c01 * x0) / det;
  // Solução degenerada ou alça que estoura (ponta fina da cursiva, lados quase
  // colados): cai no terço clássico, que nunca faz laço — o erro manda partir.
  const eps = 1e-6 * segLen;
  if (alfa1 < eps || alfa2 < eps || alfa1 > segLen * 1.5 || alfa2 > segLen * 1.5) alfa1 = alfa2 = segLen / 3;
  return [p0, soma(p0, esc(t1, alfa1)), soma(p3, esc(t2, alfa2)), p3];
}

function erroMaximo(pts: P[], b: Bez, u: number[]): { erro: number; onde: number } {
  let erro = 0;
  let onde = Math.floor(pts.length / 2);
  for (let i = 1; i < pts.length - 1; i++) {
    const d = dist(bezier(b, u[i]), pts[i]);
    if (d > erro) {
      erro = d;
      onde = i;
    }
  }
  return { erro, onde };
}

function reparametrizar(b: Bez, pts: P[], u: number[]): number[] {
  return u.map((t, i) => {
    const d = sub(bezier(b, t), pts[i]);
    const d1 = derivada(b, t);
    const d2 = derivada2(b, t);
    const den = pesc(d1, d1) + pesc(d, d2);
    return den === 0 ? t : Math.min(1, Math.max(0, t - pesc(d, d1) / den));
  });
}

function ajustar(pts: P[], t1: P, t2: P, tol: number, saida: Bez[]): void {
  if (pts.length === 2) {
    const l = dist(pts[0], pts[1]) / 3;
    saida.push([pts[0], soma(pts[0], esc(t1, l)), soma(pts[1], esc(t2, l)), pts[1]]);
    return;
  }
  let u = parametrizar(pts);
  let b = gerar(pts, u, t1, t2);
  let { erro, onde } = erroMaximo(pts, b, u);
  if (erro < tol) {
    saida.push(b);
    return;
  }
  if (erro < tol * 4) {
    for (let i = 0; i < 12; i++) {
      u = reparametrizar(b, pts, u);
      b = gerar(pts, u, t1, t2);
      ({ erro, onde } = erroMaximo(pts, b, u));
      if (erro < tol) {
        saida.push(b);
        return;
      }
    }
  }
  const meio = unit(sub(pts[onde - 1], pts[onde + 1]));
  ajustar(pts.slice(0, onde + 1), t1, meio, tol, saida);
  ajustar(pts.slice(onde), esc(meio, -1), t2, tol, saida);
}

/** Canto = vértice onde a direção vira mais que isto. Serifa e ponta de corte ficam vivas. */
const COS_CANTO = Math.cos((40 * Math.PI) / 180);

/**
 * Um contorno fechado vira subpath de bézier. Onde há canto a curva parte;
 * no resto as tangentes casam, então não aparece emenda em zoom nenhum.
 */
function contornoParaD(anel: P[], tol: number, fmt: (n: number) => string): string {
  // Tira pontos repetidos e o fecho duplicado.
  const pts = anel.filter((p, i) => i === 0 || dist(p, anel[i - 1]) > 1e-3);
  if (pts.length > 1 && dist(pts[0], pts[pts.length - 1]) < 1e-3) pts.pop();
  const n = pts.length;
  if (n < 3) return "";

  const cantos: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = unit(sub(pts[i], pts[(i - 1 + n) % n]));
    const b = unit(sub(pts[(i + 1) % n], pts[i]));
    if (pesc(a, b) < COS_CANTO) cantos.push(i);
  }
  // Sem canto nenhum (um "O"), parte no ponto mais à esquerda e fecha liso.
  const inicios = cantos.length ? cantos : [pts.reduce((m, p, i) => (p[0] < pts[m][0] ? i : m), 0)];
  const liso = cantos.length === 0;

  let d = `M${fmt(pts[inicios[0]][0])} ${fmt(pts[inicios[0]][1])}`;
  for (let k = 0; k < inicios.length; k++) {
    const de = inicios[k];
    const ate = inicios[(k + 1) % inicios.length];
    const trecho: P[] = [];
    for (let i = de; ; i = (i + 1) % n) {
      trecho.push(pts[i]);
      if (trecho.length > 1 && i === ate) break;
      if (trecho.length > n + 1) break;
    }
    if (trecho.length === 2) {
      d += `L${fmt(trecho[1][0])} ${fmt(trecho[1][1])}`;
      continue;
    }
    const t1 = liso
      ? unit(sub(pts[(de + 1) % n], pts[(de - 1 + n) % n]))
      : unit(sub(trecho[1], trecho[0]));
    const t2 = liso
      ? esc(t1, -1)
      : unit(sub(trecho[trecho.length - 2], trecho[trecho.length - 1]));
    const bez: Bez[] = [];
    ajustar(trecho, t1, t2, tol, bez);
    for (const b of bez) {
      d += `C${fmt(b[1][0])} ${fmt(b[1][1])} ${fmt(b[2][0])} ${fmt(b[2][1])} ${fmt(b[3][0])} ${fmt(b[3][1])}`;
    }
  }
  return d + "Z";
}

/** `tol` em px da prancheta: o quanto a curva pode se afastar do polígono. */
export function curvasParaD(aneis: P[][], tol = 0.08): string {
  const fmt = (v: number): string => {
    const s = (Math.round(v * 10) / 10).toString();
    return s.replace(/^(-?)0\./, "$1.");
  };
  return aneis.map((a) => contornoParaD(a, tol, fmt)).join("");
}
