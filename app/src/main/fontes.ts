import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { containedPath, requireSitesRoot } from "./paths";

/**
 * O banco vive em `<sites>/fontes/`, ao lado das categorias, e vai no git — e
 * por isso que chega às duas máquinas sozinho. O convite publicado leva só a
 * fonte que usa: na gravação o Studio copia o ficheiro do banco para o
 * `public/fonts/` daquele site.
 */
const EXTENSOES = new Set([".ttf", ".otf", ".woff2", ".woff"]);

/** Um ficheiro grande aqui é engano — a maior das que já usamos tem 913 KB. */
const MAXIMO = 8 * 1024 * 1024;

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
  for (const e of entradas.sort((a, b) => a.name.localeCompare(b.name))) {
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
 * O ficheiro entra com o nome da chave e não com o nome original: é a chave que
 * fica gravada no convite.json, e um `Playfair Display.otf` ao lado de um
 * `playfair-display.otf` daria duas entradas para a mesma fonte.
 */
export async function instalarFonte(origem: string): Promise<Fonte[]> {
  const ext = extname(origem).toLowerCase();
  if (!EXTENSOES.has(ext)) throw new Error("só .ttf, .otf, .woff ou .woff2");
  const info = await stat(origem);
  if (!info.isFile()) throw new Error("não é um ficheiro");
  if (info.size > MAXIMO) throw new Error("ficheiro grande demais para ser uma fonte");
  const chave = chaveDaFonte(origem);
  if (!chave) throw new Error("nome de ficheiro sem letras nem números");
  const destino = join(await pastaDoBanco(), `${chave}${ext}`);
  await copyFile(origem, destino);
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
