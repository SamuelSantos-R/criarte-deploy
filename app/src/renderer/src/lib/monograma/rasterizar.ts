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
