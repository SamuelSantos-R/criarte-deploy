import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { containedPath } from "./paths";
import { siteDir } from "./sites";

// O `crd deploy` já separa leve de pesado sozinho: tudo nasce em public/assets
// e o que passa do limite sobe pro R2 com a referência reescrita. Aqui só
// aceitamos o que faz sentido virar asset de convite.
const EXTENSOES = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".svg",
  ".mp4", ".webm", ".mov",
  ".mp3", ".m4a", ".ogg", ".wav",
  ".woff", ".woff2", ".ttf", ".otf",
]);

const TAMANHO_MAX = 300 * 1024 * 1024;
const MAX_ARQUIVOS = 200;

export type AssetImportado = { nome: string; web: string; bytes: number };

/** Vira nome de arquivo web-safe: sem acento, sem espaço, sem maiúscula. */
function nomeSeguro(caminho: string): string {
  const ext = extname(caminho).toLowerCase();
  const base = basename(caminho, extname(caminho))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "asset"}${ext}`;
}

async function arquivosDe(origem: string): Promise<string[]> {
  const info = await stat(origem);
  if (info.isFile()) return [origem];
  if (!info.isDirectory()) return [];
  const encontrados: string[] = [];
  const fila = [origem];
  while (fila.length > 0 && encontrados.length < MAX_ARQUIVOS) {
    const dir = fila.shift() as string;
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const cheio = join(dir, e.name);
      if (e.isDirectory()) fila.push(cheio);
      else if (e.isFile() && EXTENSOES.has(extname(e.name).toLowerCase())) encontrados.push(cheio);
    }
  }
  return encontrados;
}

/**
 * Copia arquivos ou pastas escolhidos pelo Heatz pra `public/assets` do site.
 * A origem é caminho absoluto vindo do drag-and-drop ou do diálogo — nunca é
 * usada pra escrever, só pra ler; o destino é sempre validado dentro do site.
 */
export async function importAssets(siteId: string, origens: string[]): Promise<AssetImportado[]> {
  if (!Array.isArray(origens) || origens.length === 0) throw new Error("nenhum arquivo");
  const dir = await siteDir(siteId);
  const destinoDir = await containedPath(dir, "public", "assets");
  await mkdir(destinoDir, { recursive: true });

  const importados: AssetImportado[] = [];
  for (const origem of origens.slice(0, MAX_ARQUIVOS)) {
    if (typeof origem !== "string" || origem.length === 0) continue;
    for (const arquivo of await arquivosDe(origem)) {
      const ext = extname(arquivo).toLowerCase();
      if (!EXTENSOES.has(ext)) throw new Error(`extensão não aceita: ${ext || "sem extensão"}`);
      const info = await stat(arquivo);
      if (info.size > TAMANHO_MAX) throw new Error(`${basename(arquivo)} passa de 300 MB`);
      const nome = nomeSeguro(arquivo);
      const destino = await containedPath(destinoDir, nome);
      await copyFile(arquivo, destino);
      importados.push({ nome, web: `/assets/${nome}`, bytes: info.size });
    }
  }
  if (importados.length === 0) throw new Error("nenhum arquivo aceito na seleção");
  return importados;
}

export const FILTROS = [
  { name: "Tudo que serve de asset", extensions: [...EXTENSOES].map((e) => e.slice(1)) },
  { name: "Imagens", extensions: ["jpg", "jpeg", "png", "webp", "avif", "gif", "svg"] },
  { name: "Vídeo", extensions: ["mp4", "webm", "mov"] },
  { name: "Áudio", extensions: ["mp3", "m4a", "ogg", "wav"] },
  { name: "Fontes", extensions: ["woff", "woff2", "ttf", "otf"] },
];
