import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ============================================================================
// BRIEFCARD — o "memory card" que o Brief Flow exporta por casal. Plugado num
// modelo, preenche o `convite.json` com o que os noivos responderam; o desenho
// (cores, fontes, ornamentos, ícones) continua o do modelo.
//
// Regras do encaixe:
// - objetos fundem campo a campo; o que o card não traz fica como no modelo;
// - listas do card substituem as do modelo, MAS os ícones dos eventos e do
//   cronograma vêm do modelo (mesmo tipo/label primeiro, senão mesma posição);
// - cores pedidas pelos noivos não se aplicam: vêm só como sugestão.
// ============================================================================

export type Briefcard = {
  formato: "criarte.briefcard";
  v: 1;
  casal: { noiva: string; noivo: string; slug: string };
  patch: Record<string, unknown>;
  pendentes: { campo: string; motivo: string }[];
};

type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export function validarCard(bruto: unknown): Briefcard {
  if (!ehObj(bruto) || bruto.formato !== "criarte.briefcard") {
    throw new Error("Esse arquivo não é um card do Brief Flow.");
  }
  if (bruto.v !== 1) throw new Error(`Card na versão ${String(bruto.v)} — atualize o Studio.`);
  const casal = bruto.casal;
  if (!ehObj(casal) || typeof casal.noiva !== "string" || typeof casal.noivo !== "string") {
    throw new Error("Card sem os nomes do casal.");
  }
  if (!ehObj(bruto.patch)) throw new Error("Card sem dados do convite.");
  return {
    formato: "criarte.briefcard",
    v: 1,
    casal: { noiva: casal.noiva, noivo: casal.noivo, slug: typeof casal.slug === "string" ? casal.slug : "" },
    patch: bruto.patch,
    pendentes: Array.isArray(bruto.pendentes)
      ? bruto.pendentes.filter((p): p is { campo: string; motivo: string } => ehObj(p) && typeof p.motivo === "string")
      : [],
  };
}

const norm = (s: unknown): string =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

/** "Copo-d'água" → "copo-dagua", "Abertura da Pista" → "abertura-da-pista". */
export function nomeDeArquivo(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Nomes que o casal escreve e o ícone que os assets já têm com outro nome. */
const APELIDOS: Record<string, string> = {
  "cerimonia-religiosa": "cerimonia",
  "cerimonia-civil-e-religiosa": "cerimonia",
  "abertura-da-pista": "pista-de-danca",
  "abertura-da-pista-de-danca": "pista-de-danca",
  recepcao: "copo-dagua",
  jantar: "abertura-do-jantar",
};

/** Procura o ícone pelo nome entre os assets do modelo. */
export type ProcurarIcone = (nome: string, sufixo: "" | "-nd") => string | null;

/**
 * Herda `icone` do modelo: primeiro o item com o mesmo tipo/label; depois um
 * asset com o nome do item (`copo-dagua.svg`, `corte-do-bolo-nd.svg`); só por
 * fim o da mesma posição — melhor um ícone parecido do que nenhum.
 */
function comIcones(novos: unknown[], doModelo: unknown, chave: string, sufixo: "" | "-nd", procurar?: ProcurarIcone): unknown[] {
  const velhos = Array.isArray(doModelo) ? doModelo.filter(ehObj) : [];
  return novos.map((item, i) => {
    if (!ehObj(item)) return item;
    const igual = velhos.find((v) => norm(v[chave]) && norm(v[chave]) === norm(item[chave]));
    if (igual && typeof igual.icone === "string") return { icone: igual.icone, ...item };
    if (procurar) {
      const nome = nomeDeArquivo(item[chave]);
      const achado = procurar(nome, sufixo) ?? (APELIDOS[nome] ? procurar(APELIDOS[nome], sufixo) : null);
      if (achado) return { icone: achado, ...item };
    }
    const par = velhos[i] ?? velhos[velhos.length - 1];
    return par && typeof par.icone === "string" ? { icone: par.icone, ...item } : item;
  });
}

export function fundir(base: unknown, patch: unknown, caminho = "", procurar?: ProcurarIcone): unknown {
  if (Array.isArray(patch)) {
    if (caminho === "eventos.itens") return comIcones(patch, base, "tipo", "", procurar);
    if (caminho === "cronograma.itens") return comIcones(patch, base, "label", "-nd", procurar);
    return patch;
  }
  if (!ehObj(patch)) return patch;
  const saida: Obj = ehObj(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    saida[k] = fundir(saida[k], v, caminho ? `${caminho}.${k}` : k, procurar);
  }
  return saida;
}

/** Aplica o card na pasta do convite e devolve o que ainda pede mão humana. */
export async function aplicarCard(destino: string, card: Briefcard): Promise<string[]> {
  const arquivo = join(destino, "convite.json");
  if (!existsSync(arquivo)) throw new Error("O modelo não tem convite.json — não dá para plugar o card.");
  const doc = JSON.parse(await readFile(arquivo, "utf8")) as unknown;
  // Os ícones vivem em public/assets com nomes previsíveis; a busca ignora
  // maiúsculas porque há modelos com "Corte-do-Bolo.svg" e "corte-do-bolo-nd.svg".
  const pasta = join(destino, "public", "assets");
  const arquivos = existsSync(pasta) ? await readdir(pasta) : [];
  const porNome = new Map(arquivos.map((a) => [a.toLowerCase(), a]));
  const procurar: ProcurarIcone = (nome, sufixo) => {
    for (const tentativa of [`${nome}${sufixo}.svg`, `${nome}.svg`]) {
      const real = porNome.get(tentativa);
      if (real) return `/assets/${real}`;
    }
    return null;
  };
  const novo = fundir(doc, card.patch, "", procurar) as Obj;

  // O título da aba segue os nomes, como o Studio já faz ao editar.
  if (ehObj(novo.meta) && typeof novo.meta.titulo === "string") {
    const prefixo = novo.meta.titulo.includes("|") ? novo.meta.titulo.split("|")[0].trim() : "Convite de Casamento";
    novo.meta = { ...novo.meta, titulo: `${prefixo} | ${card.casal.noiva} & ${card.casal.noivo}` };
  }

  await writeFile(arquivo, `${JSON.stringify(novo, null, 2)}\n`, "utf8");
  return card.pendentes.map((p) => p.motivo);
}
