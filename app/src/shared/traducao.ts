import { sugestao } from "./ingles";

/**
 * Que textos do convite.json o convidado de fora lê, e como se escreve a
 * tradução no bloco `en`/`fr`. Vive aqui porque são dois a usá-lo: o painel
 * Traduções (renderer) e a publicação (main), que traduz o que ficou em falta
 * antes de o convite ir ao ar com lista em inglês ou francês.
 */

export type LinguaTraducao = "en" | "fr";
export type Caminho = (string | number)[];

/** Secções sem texto para o convidado ler: cores, medidas, ficheiros, controlo. */
export const FORA = new Set([
  "en",
  "fr",
  "secoes",
  "tema",
  "medidas",
  "ornamentos",
  "molduras",
  "assets",
  "r2",
  "data",
  "noivos",
  "envelope",
  "musica",
]);

/** Chaves que guardam dados, não frases — mesmo sendo texto. */
const CHAVES_DE_DADO =
  /^(posicao|mapa|url|link|iban|cor|cores|fonte|icone|olha|foto|telefone|email|limite|prazo|hora|horario|zoom|aliancas|monograma|capa|arquivo|video)$/i;

/** Texto que é hora, data, número ou cor: igual nos dois idiomas. */
const SEM_PALAVRAS = /^[\d\s:.,h/\-–+#()%]*$/i;

const EXTENSAO = /\.(jpe?g|png|webp|avif|gif|svg|mp4|webm|mov|mp3|m4a|ogg|wav|woff2?|ttf|otf)$/i;

export function traduzivel(chave: string, v: string): boolean {
  if (v.trim() === "" || CHAVES_DE_DADO.test(chave) || EXTENSAO.test(v)) return false;
  // `entry.123` é o campo do Google Form do RSVP, não frase.
  if (/^https?:\/\//.test(v) || /^entry\.\d+$/.test(v) || SEM_PALAVRAS.test(v)) return false;
  return true;
}

export function temTexto(v: unknown, chave = ""): boolean {
  if (typeof v === "string") return traduzivel(chave, v);
  if (Array.isArray(v)) return v.some((x) => temTexto(x, chave));
  if (v && typeof v === "object") return Object.entries(v).some(([k, x]) => temTexto(x, k));
  return false;
}

/**
 * Como o `setIn`, mas um índice numérico cria lista, não objeto: o site funde a
 * tradução por cima posição a posição, e `{ "0": … }` no lugar de `[…]` seria
 * deitado fora como formato errado. Buraco fica `null`, que no site é "igual ao
 * português".
 */
export function gravar(alvo: unknown, caminho: Caminho, valor: unknown): unknown {
  if (caminho.length === 0) return valor;
  const [chave, ...resto] = caminho;
  if (typeof chave === "number") {
    const lista = Array.isArray(alvo) ? alvo.slice() : [];
    while (lista.length <= chave) lista.push(null);
    lista[chave] = gravar(lista[chave], resto, valor);
    return lista;
  }
  const obj = alvo && typeof alvo === "object" && !Array.isArray(alvo) ? (alvo as Record<string, unknown>) : {};
  return { ...obj, [chave]: gravar(obj[chave], resto, valor) };
}

export function ler(alvo: unknown, caminho: Caminho): unknown {
  return caminho.reduce<unknown>(
    (acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[String(k)] : undefined),
    alvo,
  );
}

/**
 * Nomes de gente e de sítios, moradas: o tradutor automático mexe-lhes
 * ("Próx. Embarcadouro" → "Embarkation"). Ficam vazios no bloco da língua, e no
 * site saem como estão em português — que é o certo para um nome.
 */
function proprio(caminho: Caminho): boolean {
  const chaves = caminho.filter((k): k is string => typeof k === "string");
  const ultima = chaves[chaves.length - 1] ?? "";
  if (/^(titular|endereco|morada|local|detalhe)$/i.test(ultima)) return true;
  if (chaves[0] === "pais" && /^(noiva|noivo)$/.test(ultima)) return true;
  if (ultima === "nome" && chaves.some((k) => k === "local" || k === "fixa")) return true;
  return false;
}

/** Uma caixa vazia do bloco da língua: um texto, ou as linhas de uma chamada. */
type Falta = { caminho: Caminho; pt: string | string[] };

/** Tudo o que tem português e ainda não tem tradução. Nunca o que já foi escrito. */
export function emFalta(dados: Record<string, unknown>, lingua: LinguaTraducao): Falta[] {
  const bloco = dados[lingua];
  const faltas: Falta[] = [];
  const andar = (pt: unknown, caminho: Caminho, chave: string): void => {
    const atual = ler(bloco, caminho);
    if (typeof pt === "string") {
      if (traduzivel(chave, pt) && !(typeof atual === "string" && atual.trim() !== "")) faltas.push({ caminho, pt });
    } else if (Array.isArray(pt) && pt.length > 0 && pt.every((x) => typeof x === "string")) {
      if (!temTexto(pt, chave)) return;
      if (Array.isArray(atual) && atual.some((l) => typeof l === "string" && l.trim() !== "")) return;
      faltas.push({ caminho, pt: pt as string[] });
    } else if (Array.isArray(pt)) {
      pt.forEach((x, i) => andar(x, [...caminho, i], chave));
    } else if (pt && typeof pt === "object") {
      for (const [k, x] of Object.entries(pt)) andar(x, [...caminho, k], k);
    }
  };
  for (const [secao, v] of Object.entries(dados)) {
    if (!FORA.has(secao)) andar(v, [secao], secao);
  }
  return faltas;
}

/**
 * Preenche as caixas vazias: primeiro com as frases padrão (revistas à mão), e
 * o resto — a história, o recado, o versículo — com o `maquina`, se vier.
 * Sem `maquina` é o "Preencher o padrão" de sempre. Texto que a máquina não
 * devolveu fica vazio, e no site sai em português.
 */
export async function preencher(
  dados: Record<string, unknown>,
  lingua: LinguaTraducao,
  maquina?: (textos: string[]) => Promise<(string | null)[]>,
): Promise<{ bloco: Record<string, unknown>; quantos: number }> {
  let bloco: unknown = dados[lingua] ?? {};
  let quantos = 0;
  const pendentes: { caminho: Caminho; texto: string; linhas: boolean }[] = [];

  for (const { caminho, pt } of emFalta(dados, lingua)) {
    if (typeof pt === "string") {
      const s = sugestao(pt, lingua);
      if (s) {
        bloco = gravar(bloco, caminho, s);
        quantos++;
      } else if (!proprio(caminho)) pendentes.push({ caminho, texto: pt, linhas: false });
      continue;
    }
    const linhas = pt.map((l) => sugestao(l, lingua));
    // Linhas de uma frase só: ou se traduz tudo, ou nada — meia chamada numa
    // língua e meia em português lia-se pior do que tudo em português.
    if (linhas.every((l): l is string => l !== null)) {
      bloco = gravar(bloco, caminho, linhas);
      quantos++;
    } else if (!proprio(caminho)) pendentes.push({ caminho, texto: pt.join("\n"), linhas: true });
  }

  if (maquina && pendentes.length > 0) {
    const traduzidos = await maquina(pendentes.map((p) => p.texto));
    pendentes.forEach((p, i) => {
      const t = traduzidos[i]?.trim();
      if (!t) return;
      bloco = gravar(bloco, p.caminho, p.linhas ? t.split("\n") : t);
      quantos++;
    });
  }
  return { bloco: bloco as Record<string, unknown>, quantos };
}
