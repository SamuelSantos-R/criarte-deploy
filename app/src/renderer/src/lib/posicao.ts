// ============================================================================
// POSIÇÃO DA FOTO — o mesmo `object-position` do CSS, só que como par de
// números. O convite.json guarda texto ("center", "45% center") porque é o
// que o `object-position` do site espera direto; aqui vira {x,y} 0-100 pra dar
// pra arrastar.
// ============================================================================

const EIXO_X: Record<string, number> = { left: 0, center: 50, right: 100 };
const EIXO_Y: Record<string, number> = { top: 0, center: 50, bottom: 100 };

function numero(token: string | undefined, eixo: Record<string, number>): number | null {
  if (!token) return null;
  if (token in eixo) return eixo[token];
  const m = /^(-?\d+(?:\.\d+)?)%$/.exec(token);
  return m ? Math.min(100, Math.max(0, parseFloat(m[1]))) : null;
}

export function lerPosicao(valor: string | undefined): { x: number; y: number } {
  const partes = (valor ?? "").trim().split(/\s+/).filter(Boolean);
  let x = numero(partes[0], EIXO_X);
  let y = numero(partes[1], EIXO_Y);
  if (x === null && y === null) return { x: 50, y: 50 };
  if (x === null) x = 50;
  if (y === null) y = 50;
  return { x, y };
}

export function escreverPosicao(x: number, y: number): string {
  const r = (n: number): string => (Math.round(Math.min(100, Math.max(0, n)) * 10) / 10).toString();
  return `${r(x)}% ${r(y)}%`;
}
