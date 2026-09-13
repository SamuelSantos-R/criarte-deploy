/**
 * SVG → PNG sem fundo, pelo próprio Chromium do Electron. O SVG entra como
 * data: porque a CSP do app não aceita blob: em imagem.
 */
export async function paraPng(svg: string, lado: number): Promise<string> {
  const img = new Image();
  img.decoding = "async";
  img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  await img.decode();

  const canvas = document.createElement("canvas");
  canvas.width = lado;
  canvas.height = lado;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("o canvas não abriu");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, lado, lado);
  return canvas.toDataURL("image/png");
}

const num = (n: number): string => String(Math.round(n * 100) / 100);

/**
 * Aperta o viewBox do SVG na caixa do que está pintado. A prancheta é sempre
 * 1000×1000 e o desenho quase nunca a enche: no convite essa sobra transparente
 * vira espaço dentro da imagem, que nenhuma folga do layout consegue tirar.
 *
 * Mede pelos pixels e não pela geometria porque a moldura pode ser uma imagem
 * arrastada, com transparência própria — o path das letras não sabe dela.
 */
export async function recortarAoDesenho(svg: string, folgaPx = 4): Promise<string> {
  const raiz = svg.match(/^<svg\b[^>]*>/)?.[0];
  const vb = raiz?.match(/\sviewBox="([^"]+)"/)?.[1]?.trim().split(/[\s,]+/).map(Number);
  if (!raiz || !vb || vb.length !== 4 || vb.some((n) => !Number.isFinite(n)) || vb[2] <= 0 || vb[3] <= 0) return svg;
  const [vx, vy, vw, vh] = vb;

  const img = new Image();
  img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  await img.decode();
  // 1 px por unidade na prancheta de 1000: fino o bastante pra folga de 4 px.
  const k = 1000 / Math.max(vw, vh);
  const largura = Math.max(1, Math.round(vw * k));
  const altura = Math.max(1, Math.round(vh * k));
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return svg;
  ctx.drawImage(img, 0, 0, largura, altura);
  const px = ctx.getImageData(0, 0, largura, altura).data;

  let x1 = largura;
  let y1 = altura;
  let x2 = -1;
  let y2 = -1;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      // Alfa baixo é poeira do antialias, não desenho.
      if (px[(y * largura + x) * 4 + 3] <= 8) continue;
      if (x < x1) x1 = x;
      if (x > x2) x2 = x;
      if (y < y1) y1 = y;
      if (y > y2) y2 = y;
    }
  }
  if (x2 < 0) return svg;

  const nx1 = Math.max(0, x1 - folgaPx) / k + vx;
  const ny1 = Math.max(0, y1 - folgaPx) / k + vy;
  const nx2 = Math.min(largura, x2 + 1 + folgaPx) / k + vx;
  const ny2 = Math.min(altura, y2 + 1 + folgaPx) / k + vy;
  const w = nx2 - nx1;
  const h = ny2 - ny1;
  const nova = raiz
    .replace(/\s(?:width|height|viewBox)="[^"]*"/g, "")
    .replace(/^<svg\b/, `<svg width="${num(w)}" height="${num(h)}" viewBox="${num(nx1)} ${num(ny1)} ${num(w)} ${num(h)}"`);
  return nova + svg.slice(raiz.length);
}

/** Tamanho natural de uma imagem em data URL. SVG sem width/height cai em 1000×1000. */
export async function medirImagem(dataUrl: string): Promise<{ largura: number; altura: number }> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  return { largura: img.naturalWidth || 1000, altura: img.naturalHeight || 1000 };
}

/**
 * As cores que mais aparecem na moldura, pra ela pôr as letras no mesmo tom.
 * Ignora transparente e quase branco (fundo), e junta tons vizinhos em caixas
 * de 16 níveis por canal — senão o antialias vira dez "cores" iguais.
 */
export async function paletaDe(dataUrl: string, quantas = 6): Promise<string[]> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const lado = 96;
  const canvas = document.createElement("canvas");
  canvas.width = lado;
  canvas.height = lado;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, lado, lado);
  const px = ctx.getImageData(0, 0, lado, lado).data;
  const contas = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < px.length; i += 4) {
    const [r, g, b, a] = [px[i], px[i + 1], px[i + 2], px[i + 3]];
    if (a < 200 || (r > 235 && g > 235 && b > 235)) continue;
    const k = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const c = contas.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    c.n++;
    c.r += r;
    c.g += g;
    c.b += b;
    contas.set(k, c);
  }
  const hex = (v: number): string => Math.round(v).toString(16).padStart(2, "0");
  return [...contas.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, quantas)
    .map((c) => `#${hex(c.r / c.n)}${hex(c.g / c.n)}${hex(c.b / c.n)}`.toUpperCase());
}
