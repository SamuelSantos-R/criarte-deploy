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
