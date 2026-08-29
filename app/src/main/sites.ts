import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { assertSiteId, containedPath, requireSitesRoot } from "./paths";

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

export async function readConvite(id: string): Promise<unknown> {
  const file = await containedPath(await siteDir(id), "convite.json");
  return JSON.parse(await readFile(file, "utf8"));
}

export async function writeConvite(id: string, data: unknown): Promise<void> {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("convite.json tem que ser um objeto");
  }
  const file = await containedPath(await siteDir(id), "convite.json");
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
