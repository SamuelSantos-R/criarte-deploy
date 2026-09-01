import { copyFile, mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import subsetFont from "subset-font";
import { containedPath, requireSitesRoot } from "./paths";

/**
 * O banco vive em `<sites>/fontes/`, ao lado das categorias, e vai no git — e
 * por isso que chega às duas máquinas sozinho. O convite publicado leva só a
 * fonte que usa: na gravação o Studio copia o ficheiro do banco para o
 * `public/fonts/` daquele site.
 */
const EXTENSOES = new Set([".ttf", ".otf", ".woff2", ".woff"]);

/**
 * Desempate quando a mesma chave aparece em dois formatos: ganha o woff2, que é
 * o que o Studio instala. Os outros só existem se alguém largar o ficheiro na
 * pasta à mão — e por ordem alfabética o `.ttf` gordo ganhava do `.woff2`.
 */
const PESO: Record<string, number> = { ".woff2": 0, ".woff": 1, ".otf": 2, ".ttf": 3 };

/** Vale para o ficheiro que entra, antes do recorte. */
const MAXIMO = 8 * 1024 * 1024;

/**
 * Latin-1 e Latin Extended-A mais a pontuação tipográfica: cobre os nomes
 * portugueses e o resto da Europa com folga. Glifo de fora cai na fonte de
 * recurso — que é o que o browser já faz caractere a caractere, e o mural de
 * recados é o único texto que ninguém controla.
 */
const FAIXAS: [number, number][] = [
  [0x20, 0x7e],
  [0xa0, 0xff],
  [0x100, 0x17f],
  [0x2010, 0x2015],
  [0x2018, 0x201f],
  [0x2022, 0x2022],
  [0x2026, 0x2026],
  [0x20ac, 0x20ac],
];

function alfabeto(): string {
  let s = "";
  for (const [a, b] of FAIXAS) for (let c = a; c <= b; c++) s += String.fromCodePoint(c);
  return s;
}

export type Fonte = { chave: string; nome: string; ficheiro: string; bytes: number };

export function chaveDaFonte(ficheiro: string): string {
  return basename(ficheiro, extname(ficheiro))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function nomeDaFonte(ficheiro: string): string {
  return basename(ficheiro, extname(ficheiro))
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\p{Ll}/gu, (c) => c.toUpperCase());
}

async function pastaDoBanco(): Promise<string> {
  const dir = join(requireSitesRoot(), "fontes");
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function listarFontes(): Promise<Fonte[]> {
  const dir = await pastaDoBanco();
  const entradas = await readdir(dir, { withFileTypes: true });
  const vistas = new Set<string>();
  const lista: Fonte[] = [];
  const ordenadas = entradas.sort((a, b) => {
    const pa = PESO[extname(a.name).toLowerCase()] ?? 9;
    const pb = PESO[extname(b.name).toLowerCase()] ?? 9;
    return pa - pb || a.name.localeCompare(b.name);
  });
  for (const e of ordenadas) {
    if (!e.isFile() || !EXTENSOES.has(extname(e.name).toLowerCase())) continue;
    const chave = chaveDaFonte(e.name);
    if (!chave || vistas.has(chave)) continue;
    vistas.add(chave);
    lista.push({
      chave,
      nome: nomeDaFonte(e.name),
      ficheiro: e.name,
      bytes: (await stat(join(dir, e.name))).size,
    });
  }
  return lista;
}

/**
 * Recortar corta ~90% do peso: uma Cormorant Infant inteira são 913 KB e o
 * convite usa uns 30 caracteres dela. O ficheiro sai sempre em woff2, que é
 * comprimido, e os eixos de fonte variável sobrevivem ao recorte.
 */
export async function recortar(bruto: Buffer): Promise<Buffer> {
  return subsetFont(bruto, alfabeto(), { targetFormat: "woff2" });
}

/**
 * O ficheiro entra com o nome da chave e não com o nome original: é a chave que
 * fica gravada no convite.json, e um `Playfair Display.otf` ao lado de um
 * `playfair-display.otf` daria duas entradas para a mesma fonte. Instalar a
 * mesma chave noutro formato substitui em vez de acumular, senão as duas
 * disputavam a chave e o desempate era a ordem alfabética.
 */
export async function instalarFonte(origem: string): Promise<Fonte[]> {
  const ext = extname(origem).toLowerCase();
  if (!EXTENSOES.has(ext)) throw new Error("só .ttf, .otf, .woff ou .woff2");
  const info = await stat(origem);
  if (!info.isFile()) throw new Error("não é um ficheiro");
  if (info.size > MAXIMO) throw new Error("ficheiro grande demais para ser uma fonte");
  const chave = chaveDaFonte(origem);
  if (!chave) throw new Error("nome de ficheiro sem letras nem números");

  const banco = await pastaDoBanco();
  const ficheiro = `${chave}.woff2`;
  await writeFile(await containedPath(banco, ficheiro), await recortar(await readFile(origem)));
  for (const antigo of await readdir(banco)) {
    if (antigo !== ficheiro && chaveDaFonte(antigo) === chave && EXTENSOES.has(extname(antigo).toLowerCase())) {
      await unlink(join(banco, antigo)).catch(() => {});
    }
  }
  return listarFontes();
}

/**
 * Sem isto a fonte fica só na máquina de quem a instalou e o convite publicado
 * sai com a fonte de recurso. Falhar aqui não pode impedir a gravação do
 * convite: quem chama trata o `false` como aviso.
 */
export async function levarFonteParaSite(raizDoSite: string, chave: unknown): Promise<boolean> {
  if (typeof chave !== "string" || !/^[a-z0-9-]{1,64}$/.test(chave)) return false;
  const fonte = (await listarFontes()).find((f) => f.chave === chave);
  if (!fonte) return false;
  const origem = await containedPath(await pastaDoBanco(), fonte.ficheiro);
  const pasta = join(raizDoSite, "public", "fonts");
  await mkdir(pasta, { recursive: true });
  await copyFile(origem, await containedPath(pasta, fonte.ficheiro));
  return true;
}
