import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { siteDir } from "./sites";

// Onde os originais vão parar. O ponto no nome faz o `crd fotos` pular a pasta
// na próxima varredura, e por estar fora de `public/` ela não entra no build.
const PARQUE = ".originais";

const CONVERSIVEIS = new Set([".png", ".jpg", ".jpeg"]);
const PULAR = new Set(["node_modules", ".next", ".git", "out", "dist", "build", ".turbo", ".vercel", PARQUE]);

// Só texto que um humano edita. Nada de varrer binário atrás de nome de arquivo.
const TEXTOS = new Set([".json", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".scss", ".html", ".md"]);
const TEXTO_MAX = 4 * 1024 * 1024;

export type Troca = { nome: string; webp: string; bytes: number; bytesWebp: number; refs: number };
export type Relatorio = { trocas: Troca[]; arquivos: string[]; semPar: string[]; parqueadas: number };

async function varrer(raiz: string, dentro: string): Promise<string[]> {
  const achados: string[] = [];
  const fila = [dentro];
  while (fila.length > 0) {
    const dir = fila.shift() as string;
    let entradas;
    try {
      entradas = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entradas) {
      if (PULAR.has(e.name) || e.name.startsWith(".")) continue;
      const cheio = join(dir, e.name);
      if (e.isDirectory()) fila.push(cheio);
      else if (e.isFile()) achados.push(cheio);
    }
  }
  return achados.filter((f) => !relative(raiz, f).startsWith(".."));
}

const escapar = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Troca `nome.jpg` por `nome.webp` no texto. As bordas impedem que `gallery-1.jpg`
 * case dentro de `hero-gallery-1.jpg` — nome de arquivo é palavra inteira.
 */
function trocarRefs(texto: string, de: string, para: string): { texto: string; n: number } {
  const re = new RegExp(`(?<![\\w.-])${escapar(de)}(?![\\w])`, "g");
  const n = texto.match(re)?.length ?? 0;
  return { texto: n > 0 ? texto.replace(re, para) : texto, n };
}

/**
 * Depois do `crd fotos` o site fica com os dois arquivos e continua servindo o
 * pesado — o `.webp` nasce ao lado, ninguém aponta pra ele. Aqui reescrevemos as
 * referências e tiramos o original da frente.
 *
 * A ordem importa: reescrever antes de mover. Se a mudança de pasta falhar no
 * meio, as referências já apontam pro `.webp`, que existe — o site não quebra.
 */
export async function trocarPorWebp(siteId: string): Promise<Relatorio> {
  const raiz = await siteDir(siteId);
  const publico = join(raiz, "public");
  if (!existsSync(publico)) return { trocas: [], arquivos: [], semPar: [], parqueadas: 0 };

  const pares: { origem: string; webp: string; troca: Troca }[] = [];
  const semPar: string[] = [];

  for (const arquivo of await varrer(raiz, publico)) {
    if (!CONVERSIVEIS.has(extname(arquivo).toLowerCase())) continue;
    const webp = arquivo.replace(/\.(png|jpe?g)$/i, ".webp");
    if (!existsSync(webp)) {
      semPar.push(basename(arquivo));
      continue;
    }
    pares.push({
      origem: arquivo,
      webp,
      troca: {
        nome: basename(arquivo),
        webp: basename(webp),
        bytes: (await stat(arquivo)).size,
        bytesWebp: (await stat(webp)).size,
        refs: 0,
      },
    });
  }
  if (pares.length === 0) return { trocas: [], arquivos: [], semPar, parqueadas: 0 };

  const tocados: string[] = [];
  for (const arquivo of await varrer(raiz, raiz)) {
    if (!TEXTOS.has(extname(arquivo).toLowerCase())) continue;
    if ((await stat(arquivo)).size > TEXTO_MAX) continue;
    const antes = await readFile(arquivo, "utf8");
    let depois = antes;
    for (const p of pares) {
      const r = trocarRefs(depois, p.troca.nome, p.troca.webp);
      depois = r.texto;
      p.troca.refs += r.n;
    }
    if (depois === antes) continue;
    await writeFile(arquivo, depois, "utf8");
    tocados.push(relative(raiz, arquivo));
  }

  let parqueadas = 0;
  for (const p of pares) {
    const destino = join(raiz, PARQUE, relative(raiz, p.origem));
    await mkdir(dirname(destino), { recursive: true });
    await rename(p.origem, destino);
    parqueadas += 1;
  }

  return { trocas: pares.map((p) => p.troca), arquivos: tocados, semPar, parqueadas };
}
