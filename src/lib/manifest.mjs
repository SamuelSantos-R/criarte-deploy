// ============================================================================
// MANIFEST — registro local de cada deploy
// ============================================================================
// Cada deploy grava um JSON em ~/.criarte-deploy/manifests/<categoria>/<slug>/<timestamp>.json
// pra rastreabilidade. Não substitui o registry da VPS, é um diário local.
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const MANIFEST_ROOT = join(homedir(), ".criarte-deploy", "manifests");
const DEPLOY_DOMAIN = "https://criartedesing.ao";

export function createManifest({ category, slug, base, action, commitSha }) {
  const finalUrl = `${DEPLOY_DOMAIN}/${slug}`;
  return {
    schemaVersion: 1,
    domain: DEPLOY_DOMAIN,
    category,
    slug,
    finalUrl,
    base,
    action: action || "deploy",
    commitSha: commitSha || null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    status: "in_progress",
    r2: { uploaded: [], skipped: [], failed: [], prefix: null, totalBytes: 0 },
    healthChecks: [],
    notes: [],
  };
}

export function finalizeManifest(m, { status, error }) {
  m.finishedAt = new Date().toISOString();
  m.durationMs = new Date(m.finishedAt).getTime() - new Date(m.startedAt).getTime();
  m.status = status;
  if (error) m.notes.push({ level: "error", message: String(error) });
  return m;
}

export function saveManifest(m) {
  try {
    const dir = join(MANIFEST_ROOT, m.slug);
    mkdirSync(dir, { recursive: true });
    const ts = m.startedAt.replace(/[:.]/g, "-");
    const path = join(dir, `${ts}.json`);
    writeFileSync(path, JSON.stringify(m, null, 2));
    return path;
  } catch (e) {
    return null;
  }
}

export function lastManifestFor(slug) {
  try {
    const dir = join(MANIFEST_ROOT, slug);
    if (!existsSync(dir)) return null;
    const files = readdirSync(dir).filter(f => f.endsWith(".json")).sort().reverse();
    if (!files.length) return null;
    return JSON.parse(readFileSync(join(dir, files[0]), "utf8"));
  } catch {
    return null;
  }
}

export function listManifests(slug) {
  try {
    const dir = join(MANIFEST_ROOT, slug);
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter(f => f.endsWith(".json")).sort().reverse()
      .map(f => ({ file: join(dir, f), ts: f.replace(/-/g, ":").replace(".json", ""), size: statSync(join(dir, f)).size }));
  } catch {
    return [];
  }
}
