import { gravarSvgDoSite, lerSvgDoSite } from "@/lib/api";
import { recortarAoDesenho } from "@/lib/monograma/rasterizar";

// ÍCONE DO CRONOGRAMA — a arte sai do Illustrator numa prancheta de 1000×1000 e
// quase nunca a enche. Como a máscara do IconeTinta é `contain`, a caixa fica
// alinhada mas o desenho boia lá dentro: encostar o ícone na linha não o encosta
// na hora que está logo abaixo. Apertar o viewBox até ao desenho é o que faz o
// ícone e o número passarem a ter a mesma borda.
//
// Uma vez por ficheiro: apertar de novo não acha sobra nenhuma, mas ler e medir
// custa, e a mesma pasta é partilhada por convites.
const jaArrumados = new Set<string>();

/**
 * Corta a sobra transparente do SVG do ícone, no sítio onde ele já está.
 * Devolve `true` se o ficheiro mudou — quem chamou decide se recarrega o preview.
 */
export async function arrumarIconeSvg(siteId: string, caminho: string): Promise<boolean> {
  if (!caminho.toLowerCase().endsWith(".svg")) return false;
  const chave = `${siteId}|${caminho}`;
  if (jaArrumados.has(chave)) return false;
  jaArrumados.add(chave);
  try {
    const svg = await lerSvgDoSite(siteId, caminho);
    if (!svg) return false;
    const apertado = await recortarAoDesenho(svg, 0);
    if (apertado === svg) return false;
    return await gravarSvgDoSite(siteId, caminho, apertado);
  } catch {
    // Ícone que não se deixa medir fica como está: melhor desalinhado do que perdido.
    jaArrumados.delete(chave);
    return false;
  }
}
