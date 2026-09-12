import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { app } from "electron";

// ============================================================================
// MONOGRAMA — o main só guarda e entrega bytes. Desenhar, cortar e rasterizar
// é tudo no renderer, porque o palco refaz o corte a cada arraste.
// ============================================================================

export type FonteMonograma = { chave: string; nome: string };
export type Recursos = {
  serifada: Uint8Array;
  milton: Uint8Array;
  guirlanda: { d: string; viewBox: [number, number, number, number] };
};
export type Exportado = { pasta: string; arquivos: string[] };

const EXT_FONTE = new Set([".otf", ".ttf", ".woff"]);
const FONTE_MAX = 20 * 1024 * 1024;
const SVG_MAX = 8 * 1024 * 1024;
const PNG_MAX = 20 * 1024 * 1024;

/**
 * O SVG do monograma é só path e cor. Script, handler ou link dentro dele não
 * vem do editor — e o arquivo sai servido público pelo R2 e embutido em convite.
 */
export function svgLimpo(svg: unknown, max: number): svg is string {
  return (
    typeof svg === "string" &&
    svg.startsWith("<svg") &&
    svg.length <= max &&
    !/<script|<foreignObject|<iframe|\son[a-z]+\s*=|href\s*=|javascript:/i.test(svg)
  );
}

/** Viajam no app, como as peças da tokenização: o monograma não depende de convite nenhum. */
function recurso(nome: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, "monograma", nome)
    : resolve(app.getAppPath(), "resources", "monograma", nome);
}

/** Fontes arrastadas ficam nesta máquina só. Nunca sobem: fonte comercial não se distribui. */
const pastaFontes = (): string => join(app.getPath("userData"), "monograma-fontes");

export async function recursosMonograma(): Promise<Recursos> {
  // Fora do git (repo público): quem gera o app sem elas no disco tem de saber o quê falta.
  for (const nome of ["Milton_One_Bold.otf", "guirlanda.svg"]) {
    if (!existsSync(recurso(nome))) throw new Error(`falta ${nome} em resources/monograma — este build saiu sem ele`);
  }
  const svg = await readFile(recurso("guirlanda.svg"), "utf8");
  const d = svg.match(/\sd="([^"]+)"/)?.[1];
  const vb = svg.match(/viewBox="([^"]+)"/)?.[1]?.split(/[\s,]+/).map(Number);
  if (!d || !vb || vb.length !== 4 || vb.some((n) => !Number.isFinite(n))) {
    throw new Error("a guirlanda veio estragada no app");
  }
  return {
    serifada: await readFile(recurso("CormorantGaramond-Regular.ttf")),
    milton: await readFile(recurso("Milton_One_Bold.otf")),
    guirlanda: { d, viewBox: vb as [number, number, number, number] },
  };
}

function nomeDaFonte(ficheiro: string): string {
  return basename(ficheiro, extname(ficheiro)).replace(/[_-]+/g, " ").trim();
}

/** Web-safe e sem subpasta: a chave volta do renderer e não pode apontar pra fora. */
function chaveSegura(ficheiro: string): string {
  const ext = extname(ficheiro).toLowerCase();
  const base = basename(ficheiro, extname(ficheiro))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "fonte"}${ext}`;
}

export async function importarFonte(caminho: string): Promise<FonteMonograma & { bytes: Uint8Array }> {
  const ext = extname(caminho).toLowerCase();
  if (!EXT_FONTE.has(ext)) throw new Error("só .otf, .ttf ou .woff");
  const info = await stat(caminho);
  if (!info.isFile()) throw new Error("isso não é um arquivo de fonte");
  if (info.size > FONTE_MAX) throw new Error("fonte grande demais");

  const chave = chaveSegura(caminho);
  await mkdir(pastaFontes(), { recursive: true });
  await copyFile(caminho, join(pastaFontes(), chave));
  return { chave, nome: nomeDaFonte(chave), bytes: await readFile(join(pastaFontes(), chave)) };
}

export async function fontesRecentes(): Promise<FonteMonograma[]> {
  if (!existsSync(pastaFontes())) return [];
  const nomes = await readdir(pastaFontes());
  return nomes
    .filter((n) => EXT_FONTE.has(extname(n).toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
    .map((chave) => ({ chave, nome: nomeDaFonte(chave) }));
}

export async function lerFonte(chave: unknown): Promise<Uint8Array> {
  if (typeof chave !== "string" || chave !== chaveSegura(chave)) throw new Error("fonte inválida");
  const caminho = join(pastaFontes(), chave);
  if (!existsSync(caminho)) throw new Error("essa fonte não está mais nesta máquina — arraste de novo");
  return readFile(caminho);
}

const estado: { pasta: string | null } = { pasta: null };

export const ultimaPasta = (): string | null => estado.pasta;

function nomeArquivo(v: unknown): string {
  const s = String(typeof v === "string" ? v : "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9&]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80);
  return s || "monograma";
}

export async function exportar(pasta: string, carga: unknown): Promise<Exportado> {
  const c = (carga ?? {}) as Record<string, unknown>;
  const svg = c.svg;
  const png = c.png;
  if (!svgLimpo(svg, SVG_MAX)) throw new Error("svg inválido");
  const PREFIXO = "data:image/png;base64,";
  if (typeof png !== "string" || !png.startsWith(PREFIXO) || png.length > PNG_MAX) {
    throw new Error("png inválido");
  }
  // Dois casais com as mesmas iniciais são comuns: nunca por cima de outro monograma.
  const raiz = `monograma-${nomeArquivo(c.nome)}`;
  let base = raiz;
  for (let n = 2; existsSync(join(pasta, `${base}.svg`)) || existsSync(join(pasta, `${base}.png`)); n++) {
    base = `${raiz}-${n}`;
  }
  const arquivos = [`${base}.svg`, `${base}.png`];
  await writeFile(join(pasta, arquivos[0]), svg, "utf8");
  await writeFile(join(pasta, arquivos[1]), Buffer.from(png.slice(PREFIXO.length), "base64"));
  estado.pasta = pasta;
  return { pasta, arquivos };
}
