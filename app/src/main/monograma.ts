import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
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
    // A única referência aceita é a moldura arrastada, embutida como imagem em base64.
    !/<script|<foreignObject|<iframe|\son[a-z]+\s*=|href\s*=|javascript:/i.test(
      svg.replace(/\shref="data:image\/(?:png|svg\+xml);base64,[A-Za-z0-9+/=]+"/g, ""),
    )
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

  const bytes = await readFile(caminho);
  const chave = chaveSegura(caminho);
  await mkdir(pastaFontes(), { recursive: true });
  await writeFile(join(pastaFontes(), chave), bytes);
  return { chave, nome: nomeDaFonte(chave), bytes };
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

// ---------------------------------------------------------------------------
// Molduras arrastadas: mesmo esquema das fontes, guardadas nesta máquina.
// A chave leva um pedaço do hash, então duas "moldura.svg" diferentes não se
// sobrescrevem, e a mesma arte vinda da biblioteca não duplica.
// ---------------------------------------------------------------------------

const EXT_MOLDURA: Record<string, string> = { ".svg": "image/svg+xml", ".png": "image/png" };
const MOLDURA_MAX = 15 * 1024 * 1024;
const pastaMolduras = (): string => join(app.getPath("userData"), "monograma-molduras");

export type MolduraLida = FonteMonograma & { dataUrl: string };

function chaveDeMoldura(nome: string, bytes: Buffer): string {
  const ext = extname(nome).toLowerCase();
  const base = chaveSegura(nome).slice(0, -ext.length || undefined).slice(0, 60);
  return `${base}-${createHash("sha256").update(bytes).digest("hex").slice(0, 8)}${ext}`;
}

const nomeDaMoldura = (chave: string): string => nomeDaFonte(chave).replace(/\s[0-9a-f]{8}$/, "");

function comoDataUrl(chave: string, bytes: Buffer): string {
  return `data:${EXT_MOLDURA[extname(chave).toLowerCase()]};base64,${bytes.toString("base64")}`;
}

/** Grava bytes de moldura (arrastada ou vinda da biblioteca) e devolve já lida. */
export async function guardarMoldura(nome: string, bytes: Buffer): Promise<MolduraLida> {
  const ext = extname(nome).toLowerCase();
  if (!EXT_MOLDURA[ext]) throw new Error("moldura só em .svg ou .png");
  if (bytes.length > MOLDURA_MAX) throw new Error("moldura grande demais");
  if (ext === ".svg" && !/<svg[\s>]/i.test(bytes.subarray(0, 4096).toString("utf8"))) {
    throw new Error("esse .svg não é um SVG");
  }
  if (ext === ".png" && !bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    throw new Error("esse .png não é um PNG");
  }
  const chave = chaveDeMoldura(nome, bytes);
  await mkdir(pastaMolduras(), { recursive: true });
  const destino = join(pastaMolduras(), chave);
  if (!existsSync(destino)) await writeFile(destino, bytes);
  return { chave, nome: nomeDaMoldura(chave), dataUrl: comoDataUrl(chave, bytes) };
}

export async function importarMoldura(caminho: string): Promise<MolduraLida> {
  const info = await stat(caminho);
  if (!info.isFile()) throw new Error("isso não é um arquivo");
  if (info.size > MOLDURA_MAX) throw new Error("moldura grande demais");
  return guardarMoldura(basename(caminho), await readFile(caminho));
}

export async function moldurasRecentes(): Promise<FonteMonograma[]> {
  if (!existsSync(pastaMolduras())) return [];
  return (await readdir(pastaMolduras()))
    .filter((n) => EXT_MOLDURA[extname(n).toLowerCase()])
    .sort((a, b) => a.localeCompare(b))
    .map((chave) => ({ chave, nome: nomeDaMoldura(chave) }));
}

export async function lerMoldura(chave: unknown): Promise<MolduraLida> {
  if (typeof chave !== "string" || !/^[A-Za-z0-9-]{1,80}\.(svg|png)$/.test(chave)) throw new Error("moldura inválida");
  const caminho = join(pastaMolduras(), chave);
  if (!existsSync(caminho)) throw new Error("essa moldura não está nesta máquina — arraste de novo");
  return { chave, nome: nomeDaMoldura(chave), dataUrl: comoDataUrl(chave, await readFile(caminho)) };
}

/** Bytes crus de uma moldura local, pra subir junto do monograma pra biblioteca. */
export async function bytesDaMoldura(chave: unknown): Promise<{ chave: string; bytes: Buffer } | null> {
  if (typeof chave !== "string" || !/^[A-Za-z0-9-]{1,80}\.(svg|png)$/.test(chave)) return null;
  const caminho = join(pastaMolduras(), chave);
  return existsSync(caminho) ? { chave, bytes: await readFile(caminho) } : null;
}
