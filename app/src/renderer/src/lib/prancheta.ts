// PRANCHETA — o retrato de telemóvel (452×786) em que as molduras do painel
// RSVP são desenhadas. A conta vive aqui, fora do componente: é ela que decide
// onde a moldura fica, e assim pode ser medida sem abrir a janela.
export const LARGURA = 452;
export const ALTURA = 786;

export type Canto = "superior-esquerdo" | "superior-direito" | "inferior-esquerdo" | "inferior-direito";

/**
 * A conta do arrasto, sozinha: onde a moldura ficou no quadro, qual canto lhe
 * fica mais perto e que folga sobra até ele. Fora do componente porque é isto
 * que decide o desenho — e o que se pode medir sem abrir a janela.
 */
export function cantoEFolga(
  x: number,
  y: number,
  larguraPx: number,
  alturaPx: number,
  caixa: { width: number; height: number },
): { canto: Canto; folgaX: number; folgaY: number } {
  const naDireita = x + larguraPx / 2 > caixa.width / 2;
  const embaixo = y + alturaPx / 2 > caixa.height / 2;
  const canto = `${embaixo ? "inferior" : "superior"}-${naDireita ? "direito" : "esquerdo"}` as Canto;
  const folgaX = naDireita ? (caixa.width - (x + larguraPx)) / caixa.width : x / caixa.width;
  const folgaY = embaixo ? (caixa.height - (y + alturaPx)) / caixa.height : y / caixa.height;
  // Uma casa decimal chega para o olho e deixa o json legível; e a moldura não
  // sai do quadro nem vai parar ao meio dele.
  const preso = (v: number): number => Math.round(Math.min(Math.max(v, 0), 0.9) * 1000) / 10;
  return { canto, folgaX: preso(folgaX), folgaY: preso(folgaY) };
}

