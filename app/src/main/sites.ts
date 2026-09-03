import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertSiteId, containedPath, requireSitesRoot } from "./paths";
import { levarFonteParaSite } from "./fontes";

export type Site = {
  id: string;
  categoria: string;
  slug: string;
  temConvite: boolean;
  temPackage: boolean;
  atualizado: number | null;
};

const IGNORE = new Set(["node_modules", ".git", ".next", "out", "dist", ".DS_Store"]);

async function dirs(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !IGNORE.has(e.name) && !e.name.startsWith("."))
    .map((e) => e.name);
}

export async function listSites(): Promise<Site[]> {
  const root = requireSitesRoot();
  const found: Site[] = [];
  for (const categoria of await dirs(root)) {
    for (const slug of await dirs(join(root, categoria))) {
      const dir = join(root, categoria, slug);
      const convite = join(dir, "convite.json");
      const temConvite = existsSync(convite);
      let atualizado: number | null = null;
      if (temConvite) {
        try {
          atualizado = (await stat(convite)).mtimeMs;
        } catch {
          atualizado = null;
        }
      }
      found.push({
        id: `${categoria}/${slug}`,
        categoria,
        slug,
        temConvite,
        temPackage: existsSync(join(dir, "package.json")),
        atualizado,
      });
    }
  }
  return found.sort((a, b) => (b.atualizado ?? 0) - (a.atualizado ?? 0) || a.id.localeCompare(b.id));
}

export async function siteDir(id: string): Promise<string> {
  const root = requireSitesRoot();
  const [categoria, slug] = assertSiteId(id).split("/");
  return containedPath(root, categoria, slug);
}

/**
 * O mesmo caminho, mas exigindo que exista. O `spawn` com um cwd que sumiu
 * falha com ENOENT nomeando o binário do Electron — mensagem que manda procurar
 * no sítio errado. Renomear um convite deixava exatamente esse rasto.
 */
export async function siteDirExistente(id: string): Promise<string> {
  const dir = await siteDir(id);
  if (!existsSync(dir)) throw new Error(`o site "${id}" já não existe nesta pasta — foi renomeado ou apagado?`);
  return dir;
}

export async function conviteFile(id: string): Promise<string> {
  return containedPath(await siteDir(id), "convite.json");
}

export type Convite = { dados: unknown; marca: number };
/** `conflito` verdadeiro quer dizer que nada foi gravado. */
export type Gravacao = { conflito: boolean; marca: number };

/**
 * mtimes das últimas gravações feitas pelo próprio Studio, por site.
 *
 * Lista e não um número só: a digitação grava de 400 em 400ms e o vigia só vem
 * perguntar 150ms depois do evento. Com um valor só, a gravação seguinte já
 * tinha apagado a marca da anterior e o vigia dava o ficheiro por mexido de
 * fora — que é o "conflito" que aparecia do nada.
 */
const LEMBRA = 8;
const gravadas = new Map<string, number[]>();

function anotar(id: string, marca: number): void {
  gravadas.set(id, [...(gravadas.get(id) ?? []), marca].slice(-LEMBRA));
}

export async function readConvite(id: string): Promise<Convite> {
  const file = await conviteFile(id);
  const texto = await readFile(file, "utf8");
  return { dados: JSON.parse(texto), marca: (await stat(file)).mtimeMs };
}

/**
 * A `marca` é o mtime que o renderer leu. Sem ela a gravação passa por cima de
 * tudo; com ela, arquivo mexido por fora faz a gravação parar em vez de apagar
 * o trabalho de quem editou o convite.json à mão ou noutra máquina.
 */
export async function writeConvite(id: string, data: unknown, marca?: number): Promise<Gravacao> {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("convite.json tem que ser um objeto");
  }
  const file = await conviteFile(id);
  if (typeof marca === "number") {
    const noDisco = await stat(file)
      .then((s) => s.mtimeMs)
      .catch(() => null);
    if (noDisco !== null && noDisco !== marca) return { conflito: true, marca: noDisco };
  }
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  // Anotar antes de qualquer outro `await`: a cópia da fonte demora mais que os
  // 150ms de repique do vigia, e ele chegava a perguntar enquanto a marca nova
  // ainda não existia.
  const nova = (await stat(file)).mtimeMs;
  anotar(id, nova);
  // A fonte escolhida tem de viajar do banco para o site, senão o convite
  // publicado sai com a fonte de recurso. Falha aqui não desfaz a gravação: o
  // convite ficou bom, só a fonte é que não foi.
  const escolhida = (data as { medidas?: Record<string, unknown> }).medidas?.noivosFonte;
  await levarFonteParaSite(dirname(file), escolhida).catch(() => false);
  return { conflito: false, marca: nova };
}

export function gravadaPeloStudio(id: string, marca: number): boolean {
  return gravadas.get(id)?.includes(marca) ?? false;
}
