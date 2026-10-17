import { randomBytes } from "node:crypto";
import { configR2, r2Delete, r2Get, r2Listar, r2Put, type ConfigR2 } from "./r2";

// ============================================================================
// BIBLIOTECA DE PALETAS — o mesmo desenho da de monogramas: uma pasta por
// paleta no R2, sem índice central, para duas máquinas nunca reescreverem o
// mesmo ficheiro. Aqui a pasta só tem o `meta.json`, porque a paleta é ela.
// ============================================================================

const RAIZ = "paletas/";
const ID = /^[a-z0-9-]{6,80}$/;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const CHAVE = /^[a-z0-9-]{1,40}$/;
const CORES_MAX = 60;
const LEITURAS_EM_PARALELO = 8;

export type PaletaSalva = {
  v: 1;
  id: string;
  nome: string;
  nota: string;
  cores: Record<string, string>;
  autor: string | null;
  criado: string;
  atualizado: string;
};

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function slug(v: string): string {
  return (
    v
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "paleta"
  );
}

/** Só pares papel→hex: nada de texto solto a viajar para o tema de outro convite. */
function coresValidas(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("paleta sem cores");
  const cores: Record<string, string> = {};
  for (const [k, hex] of Object.entries(v)) {
    if (!CHAVE.test(k) || typeof hex !== "string" || !HEX.test(hex.trim())) continue;
    cores[k] = hex.trim();
  }
  const n = Object.keys(cores).length;
  if (n === 0) throw new Error("paleta sem nenhuma cor válida");
  if (n > CORES_MAX) throw new Error("cores demais");
  return cores;
}

async function lerMeta(cfg: ConfigR2, id: string): Promise<PaletaSalva | null> {
  const bruto = await r2Get(cfg, `${RAIZ}${id}/meta.json`);
  if (!bruto) return null;
  try {
    const m = JSON.parse(bruto.toString("utf8")) as PaletaSalva;
    return m && m.id === id && m.cores ? m : null;
  } catch {
    return null;
  }
}

export async function listarPaletas(): Promise<PaletaSalva[]> {
  const cfg = await configR2();
  const { pastas } = await r2Listar(cfg, RAIZ, "/");
  const ids = pastas.map((p) => p.slice(RAIZ.length, -1)).filter((id) => ID.test(id));
  const metas: PaletaSalva[] = [];
  for (let i = 0; i < ids.length; i += LEITURAS_EM_PARALELO) {
    const lote = await Promise.all(ids.slice(i, i + LEITURAS_EM_PARALELO).map((id) => lerMeta(cfg, id)));
    metas.push(...lote.filter((m): m is PaletaSalva => m !== null));
  }
  return metas.sort((a, b) => b.atualizado.localeCompare(a.atualizado));
}

export async function salvarPaleta(carga: unknown): Promise<PaletaSalva> {
  const c = (carga ?? {}) as Record<string, unknown>;
  const nome = texto(c.nome, 60);
  if (!nome) throw new Error("dá um nome à paleta");
  const cores = coresValidas(c.cores);
  const cfg = await configR2();
  const agora = new Date().toISOString();
  const meta: PaletaSalva = {
    v: 1,
    id: `${slug(nome)}-${randomBytes(4).toString("hex")}`,
    nome,
    nota: texto(c.nota, 160),
    cores,
    autor: cfg.autor,
    criado: agora,
    atualizado: agora,
  };
  await r2Put(cfg, `${RAIZ}${meta.id}/meta.json`, Buffer.from(JSON.stringify(meta), "utf8"), "application/json");
  return meta;
}

export async function apagarPaleta(id: unknown): Promise<void> {
  if (typeof id !== "string" || !ID.test(id)) throw new Error("paleta inválida");
  const cfg = await configR2();
  await r2Delete(cfg, `${RAIZ}${id}/meta.json`);
  const { chaves } = await r2Listar(cfg, `${RAIZ}${id}/`);
  for (const k of chaves) await r2Delete(cfg, k);
}
