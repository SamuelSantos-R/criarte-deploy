import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { preencher, type LinguaTraducao } from "../shared/traducao";

// ============================================================================
// TRADUÇÃO AUTOMÁTICA — o convite com lista em inglês/francês saía só com os
// botões traduzidos: o resto vem do bloco `en`/`fr` do convite.json, e ninguém
// o preenchia à mão. Agora a publicação escreve nas caixas vazias antes do
// build. O que alguém já escreveu nunca é tocado; o que falhar sai em português.
//
// O endpoint `gtx` do Google não pede chave nem conta. Não é API oficial: se um
// dia deixar de responder, a publicação continua e o convite sai como antes.
// ============================================================================

const TEMPO_MAX_MS = 15_000;
const EM_PARALELO = 4;

async function umTexto(texto: string, lingua: LinguaTraducao): Promise<string | null> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=pt&dt=t&tl=${lingua}`;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: `q=${encodeURIComponent(texto)}`,
      signal: AbortSignal.timeout(TEMPO_MAX_MS),
    });
    if (!r.ok) return null;
    const corpo = (await r.json()) as unknown;
    const partes = Array.isArray(corpo) && Array.isArray(corpo[0]) ? (corpo[0] as unknown[]) : [];
    const junto = partes.map((p) => (Array.isArray(p) && typeof p[0] === "string" ? p[0] : "")).join("");
    return junto.trim() === "" ? null : junto;
  } catch {
    return null;
  }
}

export function traduzirTextos(textos: string[], lingua: LinguaTraducao): Promise<(string | null)[]> {
  const saida: (string | null)[] = new Array(textos.length).fill(null);
  let proximo = 0;
  const trabalhador = async (): Promise<void> => {
    while (proximo < textos.length) {
      const i = proximo++;
      saida[i] = await umTexto(textos[i], lingua);
    }
  };
  return Promise.all(Array.from({ length: Math.min(EM_PARALELO, textos.length) }, trabalhador)).then(() => saida);
}

/** Preenche o bloco da língua inteiro: padrão primeiro, máquina no resto. */
export function traduzirDoc(
  dados: Record<string, unknown>,
  lingua: LinguaTraducao,
): Promise<{ bloco: Record<string, unknown>; quantos: number }> {
  return preencher(dados, lingua, (textos) => traduzirTextos(textos, lingua));
}

/**
 * Antes de publicar com lista em inglês ou francês. Devolve quantos textos
 * entraram por língua, para a consola dizer o que aconteceu.
 */
export async function traduzirConvite(cwd: string, linguas: LinguaTraducao[]): Promise<Record<string, number>> {
  const arquivo = join(cwd, "convite.json");
  if (linguas.length === 0 || !existsSync(arquivo)) return {};
  const bruto = await readFile(arquivo, "utf8");
  let dados = JSON.parse(bruto) as Record<string, unknown>;
  const feitos: Record<string, number> = {};
  for (const lingua of linguas) {
    const { bloco, quantos } = await traduzirDoc(dados, lingua);
    feitos[lingua] = quantos;
    if (quantos > 0) dados = { ...dados, [lingua]: bloco };
  }
  if (Object.values(feitos).some((n) => n > 0)) {
    await writeFile(arquivo, `${JSON.stringify(dados, null, 2)}\n`, "utf8");
  }
  return feitos;
}
