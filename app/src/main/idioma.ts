import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ============================================================================
// IDIOMA — o convite em inglês para os convidados de fora. Não há segundo site
// nem segundo build: o link do convidado leva `&l=en`, e o convite troca o texto
// no próprio browser. O que o casal escreve vem do bloco `en` do convite.json,
// por cima do português; o que vive cravado nos componentes passa pelo `t()`.
//
// Sem nada importado do Electron de propósito: assim os testes correm em Node
// puro contra cópias reais dos convites.
// ============================================================================

/**
 * O ficheiro que o convite recebe em `src/lib/idioma.ts`. Decide o idioma na
 * avaliação do módulo, antes de qualquer componente ler o convite: as constantes
 * de topo (`mes`, `casal`, as frases do RSVP) já nascem no idioma certo.
 *
 * O HTML exportado vem sempre em português. Em inglês o React percebe a
 * diferença ao hidratar e redesenha no cliente — por baixo do envelope, que é a
 * primeira coisa que a pessoa vê, por isso a troca não aparece.
 */
export const IDIOMA_TS = `// Criado pelo Criarte Studio — o convite em inglês para os convidados de fora.
// Não editar à mão: o Studio reescreve este ficheiro quando o dicionário cresce.
export type Idioma = "pt" | "en";

export const idioma: Idioma =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("l") === "en"
    ? "en"
    : "pt";

// A chave é o próprio texto em português: o componente continua legível e o
// que faltar aqui sai em português em vez de sair vazio.
const EN: Record<string, string> = {
  Janeiro: "January",
  Fevereiro: "February",
  "Março": "March",
  Abril: "April",
  Maio: "May",
  Junho: "June",
  Julho: "July",
  Agosto: "August",
  Setembro: "September",
  Outubro: "October",
  Novembro: "November",
  Dezembro: "December",
  "Deslize para baixo": "Scroll down",
  "Acessar Localização": "View location",
  "Hoje é o grande dia!": "Today is the big day!",
  dias: "days",
  horas: "hours",
  seg: "sec",
  "Correio do Amor": "Love Letters",
  "Seu nome": "Your name",
  "Mensagem de carinho aos noivos ♡": "A loving note for the couple ♡",
  "Deixe uma mensagem especial para este momento.": "Leave a special message for this moment.",
  "Prometemos ler com muito carinho!": "We promise to read it with love!",
  "❌ Não foi possível enviar a tua mensagem. Tenta novamente em instantes.":
    "❌ We couldn't send your message. Please try again in a moment.",
  "✉️ Obrigado, {}! A tua mensagem foi recebida com muito carinho.":
    "✉️ Thank you, {}! Your message was received with love.",
  "Ativar som": "Turn sound on",
  "Silenciar som": "Mute",
  "Desenvolvido com amor por": "Made with love by",
  "Copiar IBAN": "Copy IBAN",
  "IBAN Copiado!": "IBAN copied!",
  "Por favor, confirme a sua presença": "Please confirm your attendance",
  "Por favor, confirme até {}": "Please confirm by {}",
  "Confirmações encerradas": "RSVP closed",
  "Sim, estarei lá!": "Yes, I'll be there!",
  "Não poderei ir": "I can't make it",
  "Nome completo do acompanhante": "Full name of your plus-one",
  "Nome completo do acompanhante {}": "Full name of plus-one {}",
  "Enviando...": "Sending...",
  "Confirmar Presença": "Confirm attendance",
  "Ausência Informada": "Absence noted",
  "Presença Confirmada": "Attendance confirmed",
};

export function t(pt: string): string {
  return idioma === "en" ? EN[pt] ?? pt : pt;
}

/** Para frase com um valor no meio: \`tf("Por favor, confirme até {}", prazo)\`. */
export function tf(pt: string, ...valores: unknown[]): string {
  let i = 0;
  return t(pt).replace(/\\{\\}/g, () => String(valores[i++] ?? ""));
}

const objeto = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

// Só o que foi traduzido sobe por cima: campo vazio ou ausente no \`en\` fica em
// português. Listas de objetos (eventos, história) casam posição a posição para
// a hora e o local não precisarem de ser escritos duas vezes; listas de texto
// (linhas de uma chamada) trocam inteiras, porque a tradução raramente tem o
// mesmo número de linhas.
function fundir(pt: unknown, en: unknown): unknown {
  if (en === null || en === undefined) return pt;
  // Formato diferente do português (lista contra objeto, texto contra lista):
  // tradução estragada não pode partir a página, fica o original.
  if (Array.isArray(pt) !== Array.isArray(en) || objeto(pt) !== objeto(en)) return pt;
  if (Array.isArray(pt) && Array.isArray(en)) {
    if (pt.some(objeto)) return pt.map((item, i) => (i < en.length ? fundir(item, en[i]) : item));
    const linhas = en.filter((l) => typeof l === "string" && l.trim() !== "");
    return linhas.length > 0 ? linhas : pt;
  }
  if (objeto(pt) && objeto(en)) {
    const junto: Record<string, unknown> = { ...pt };
    for (const k of Object.keys(en)) junto[k] = k in pt ? fundir(pt[k], en[k]) : en[k];
    return junto;
  }
  if (typeof en === "string") return en.trim() === "" ? pt : en;
  return en ?? pt;
}

export function emIdioma<T>(convite: T): T {
  const en = (convite as { en?: unknown }).en;
  return idioma === "en" && objeto(en) ? (fundir(convite, en) as T) : convite;
}
`;

/** Texto com valor no meio, escrito como template literal nos componentes. */
const MOLDES = Object.keys(chavesDoDicionario()).filter((k) => k.includes("{}"));

function chavesDoDicionario(): Record<string, true> {
  const chaves: Record<string, true> = {};
  for (const m of IDIOMA_TS.matchAll(/^ {2}(?:"((?:[^"\\]|\\.)*)"|([A-Za-zÀ-ú]+)):/gm)) {
    chaves[m[1] ?? m[2]] = true;
  }
  return chaves;
}

const CHAVES = Object.keys(chavesDoDicionario()).filter((k) => !k.includes("{}"));

const escapar = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Embrulha no `t()` o texto cravado que o dicionário conhece. Só casa a frase
 * inteira, nunca um pedaço: `"min"` dentro de uma classe ou um nome de chave
 * não se parece com nenhuma entrada. Palavras soltas e curtas (dias, horas, os
 * meses) só no `label=` e no array dos meses, onde não há como confundir.
 */
export function embrulhar(codigo: string): string {
  let novo = codigo;
  for (const pt of CHAVES) {
    const lit = escapar(pt);
    const curta = /^[A-Za-zÀ-ú]+$/.test(pt) && pt.length < 12;
    if (curta) {
      novo = novo.replace(new RegExp(`(\\blabel=)"${lit}"`, "g"), `$1{t("${pt}")}`);
      continue;
    }
    // Atributo JSX: placeholder="Seu nome" → placeholder={t("Seu nome")}
    novo = novo.replace(new RegExp(`(\\s[a-zA-Z-]+=)"${lit}"`, "g"), `$1{t("${pt}")}`);
    // Literal em expressão, que ainda não esteja dentro de um t(
    novo = novo.replace(new RegExp(`(?<!\\bt\\()(?<![=\\w])"${lit}"`, "g"), `t("${pt}")`);
    // Texto JSX entre tags na mesma linha: >Hoje é o grande dia!<
    novo = novo.replace(new RegExp(`>(\\s*)${lit}(\\s*)<`, "g"), `>$1{t("${pt}")}$2<`);
    // Texto JSX sozinho numa linha
    novo = novo.replace(new RegExp(`^(\\s+)${lit}(\\s*)$`, "gm"), `$1{t("${pt}")}$2`);
  }
  for (const molde of MOLDES) {
    const [antes, depois] = molde.split("{}").map(escapar);
    novo = novo.replace(
      new RegExp("`" + antes + "\\$\\{([^}`]+)\\}" + depois + "`", "g"),
      (_m, expr: string) => `tf("${molde}", ${expr.trim()})`,
    );
  }
  if (novo === codigo) return novo;
  // Só o que o ficheiro usa: um import a sobrar acende o lint do build.
  const usados = ["t", "tf"].filter((n) => new RegExp(`\\b${n}\\("`).test(novo));
  const imp = /^import \{ ([^}]*) \} from "@\/lib\/idioma";$/m.exec(novo);
  if (!imp) return importar(novo, `import { ${usados.join(", ")} } from "@/lib/idioma";`);
  const juntos = [...new Set([...imp[1].split(",").map((s) => s.trim()), ...usados])].sort();
  return novo.replace(imp[0], `import { ${juntos.join(", ")} } from "@/lib/idioma";`);
}

/** Depois do último import do ficheiro, que é onde o resto do convite os põe. */
function importar(codigo: string, linha: string): string {
  const imports = [...codigo.matchAll(/^import [\s\S]*?;\r?\n/gm)];
  const ultimo = imports.at(-1);
  if (!ultimo) return codigo;
  const fim = (ultimo.index ?? 0) + ultimo[0].length;
  return codigo.slice(0, fim) + linha + "\n" + codigo.slice(fim);
}

/**
 * `convite.ts`: o JSON importado passa pelo `emIdioma` antes de tudo o resto, e
 * o mês sai do dicionário. O `import convite` muda de nome em vez de ganhar uma
 * linha depois, para nenhuma constante do ficheiro ler o português por engano.
 */
export function conviteEmIdioma(codigo: string): string {
  if (codigo.includes("emIdioma(")) return codigo;
  const imp = /^import convite from "(\.\.\/\.\.\/convite\.json)";\r?\n/m;
  if (!imp.test(codigo)) return codigo;
  return codigo
    .replace(
      imp,
      'import bruto from "$1";\nimport { emIdioma, t } from "./idioma";\n\nconst convite = emIdioma(bruto);\n',
    )
    .replace(/export const mes = MESES\[([^\]]+)\];/, "export const mes = t(MESES[$1]);");
}

/**
 * `guest.tsx`: a entrada do convidado pode vir como `{ name, lang }`, e o idioma
 * do link tem de bater com o da lista. Quem recebeu o link antes de entrar na
 * lista de fora (ou saiu dela) cai no idioma certo sem precisar de link novo.
 */
export function guestComIdioma(codigo: string): string {
  if (codigo.includes("emIngles")) return codigo;
  return codigo.replace(
    /^([ \t]*)const name = data\.guests\?\.\[token\];/m,
    (_m, esp: string) =>
      [
        `${esp}const entrada = data.guests?.[token] as unknown;`,
        `${esp}const name =`,
        `${esp}  typeof entrada === "string"`,
        `${esp}    ? entrada`,
        `${esp}    : ((entrada as { name?: string } | null)?.name ?? null);`,
        `${esp}const emIngles = (entrada as { lang?: string } | null)?.lang === "en";`,
        `${esp}if (name && emIngles !== (params.get("l") === "en")) {`,
        `${esp}  const certo = new URL(window.location.href);`,
        `${esp}  if (emIngles) certo.searchParams.set("l", "en");`,
        `${esp}  else certo.searchParams.delete("l");`,
        `${esp}  window.location.replace(certo.toString());`,
        `${esp}  return;`,
        `${esp}}`,
      ].join("\n"),
  );
}

/** Ficheiros com texto cravado que o dicionário cobre. */
const COM_TEXTO = [
  "Hero.tsx",
  "Evento.tsx",
  "Countdown.tsx",
  "Mensagens.tsx",
  "MuteButton.tsx",
  "Footer.tsx",
  "Presentes.tsx",
  "RSVP.tsx",
];

/** Idempotente: só escreve o que mudou e devolve o nome do que mexeu. */
export async function idiomaNoConvite(dir: string): Promise<string[]> {
  const lib = join(dir, "src", "lib");
  const conviteTs = join(lib, "convite.ts");
  // Sem o convite.ts que lê o JSON não há onde ligar a troca — convite de outra base.
  if (!existsSync(conviteTs)) return [];
  const feitos: string[] = [];

  const idiomaTs = join(lib, "idioma.ts");
  const atual = existsSync(idiomaTs) ? await readFile(idiomaTs, "utf8") : null;
  if (atual !== IDIOMA_TS) {
    await writeFile(idiomaTs, IDIOMA_TS, "utf8");
    feitos.push("idioma.ts");
  }

  const alvos: [string, (c: string) => string][] = [
    [conviteTs, conviteEmIdioma],
    [join(lib, "guest.tsx"), guestComIdioma],
    ...COM_TEXTO.map((f): [string, (c: string) => string] => [join(dir, "src", "components", f), embrulhar]),
  ];
  for (const [alvo, consertar] of alvos) {
    if (!existsSync(alvo)) continue;
    const codigo = await readFile(alvo, "utf8");
    const novo = consertar(codigo);
    if (novo === codigo) continue;
    await writeFile(alvo, novo, "utf8");
    feitos.push(alvo.split("/").pop() ?? alvo);
  }
  return feitos;
}
