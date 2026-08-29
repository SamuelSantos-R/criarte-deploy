import { app } from "electron";
import { realpath } from "node:fs/promises";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

// Um id de site é sempre "<categoria>/<slug>". Nada de ponto, nada de barra
// extra — assim ".." nunca chega a virar caminho.
const SITE_ID = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
const SEGMENT = /^[a-z0-9][a-z0-9._-]*$/i;

export class PathDenied extends Error {}

export function assertSiteId(id: unknown): string {
  if (typeof id !== "string" || !SITE_ID.test(id) || id.includes("..")) {
    throw new PathDenied(`id de site inválido: ${String(id)}`);
  }
  return id;
}

/**
 * Só devolve o caminho se ele estiver mesmo dentro de `root` depois de
 * resolver symlinks — comparar strings antes do realpath deixa passar link
 * plantado dentro da pasta de sites apontando pra fora.
 */
export async function containedPath(root: string, ...segments: string[]): Promise<string> {
  for (const s of segments) {
    if (s.split(/[/\\]/).some((part) => part && !SEGMENT.test(part))) {
      throw new PathDenied(`segmento de caminho inválido: ${s}`);
    }
  }
  const target = resolve(root, ...segments);
  const realRoot = await realpath(root);
  let realTarget: string;
  try {
    realTarget = await realpath(target);
  } catch {
    // Arquivo ainda não existe (ex.: vamos criar). Valida o texto do caminho.
    const rel = relative(realRoot, target);
    if (rel.startsWith("..") || isAbsolute(rel)) throw new PathDenied("fora da raiz de sites");
    return target;
  }
  const rel = relative(realRoot, realTarget);
  if (rel !== "" && (rel.startsWith("..") || isAbsolute(rel))) {
    throw new PathDenied("fora da raiz de sites");
  }
  return realTarget;
}

type Settings = { sitesRoot: string | null };

function settingsFile(): string {
  const dir = app.getPath("userData");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "settings.json");
}

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(readFileSync(settingsFile(), "utf8"));
    return { sitesRoot: typeof raw.sitesRoot === "string" ? raw.sitesRoot : null };
  } catch {
    return { sitesRoot: null };
  }
}

export function saveSettings(next: Settings): void {
  writeFileSync(settingsFile(), JSON.stringify(next, null, 2), "utf8");
}

export function requireSitesRoot(): string {
  const { sitesRoot } = loadSettings();
  if (!sitesRoot || !existsSync(sitesRoot)) {
    throw new PathDenied("Nenhuma pasta de sites configurada. Abra Configurações.");
  }
  return sitesRoot;
}

/** Caminho do cli.mjs — no dev sobe uma pasta, no empacotado vem de resources/. */
export function cliPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "cli", "cli.mjs")
    : resolve(app.getAppPath(), "..", "cli.mjs");
}
