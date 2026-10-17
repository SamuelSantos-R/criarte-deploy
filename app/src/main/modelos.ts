import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { configR2, r2Delete, r2Get, r2Listar, r2Put, type ConfigR2 } from "./r2";
import { copiavel, empacotar } from "./pacote";
import { siteDir } from "./sites";
import { ehCategoria, type Categoria } from "../shared/categorias";

// ============================================================================
// MODELOS — um convite guardado como molde no R2, para nascer convite novo dele
// em qualquer máquina. O mesmo desenho das bibliotecas de monogramas e paletas:
// uma pasta por modelo, sem índice central, `meta.json` gravado por último.
//
// O molde leva o código, o tema, as medidas, os ornamentos e a arte; não leva o
// casal: nomes, pais, convidados, a tradução e o mural (NEXT_PUBLIC_SITE_ID)
// ficam de fora. As fotos vão, porque sem elas a página nasce com buracos —
// trocá-las é o primeiro passo de quem usa o modelo.
// ============================================================================

const RAIZ = "modelos/";
const ID = /^[a-z0-9-]{6,80}$/;
const LEITURAS_EM_PARALELO = 8;
const UPLOAD_MAX_MS = 20 * 60 * 1000;

export type Modelo = {
  v: 1;
  id: string;
  nome: string;
  categoria: Categoria;
  nota: string;
  /** Cor de destaque do tema, para o cartão ter cara sem baixar o pacote. */
  cor: string | null;
  bytes: number;
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
      .slice(0, 40) || "modelo"
  );
}

export function categoriaValida(v: unknown): Categoria {
  if (ehCategoria(v)) return v;
  throw new Error("categoria inválida");
}

const objeto = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * O convite.json sem o casal. Só troca o que reconhece; o resto do conteúdo fica
 * como texto de exemplo, que é o que o modelo deve mostrar.
 */
export function conviteSemCasal(doc: unknown): Record<string, unknown> {
  if (!objeto(doc)) throw new Error("convite.json tem que ser um objeto");
  const limpo: Record<string, unknown> = structuredClone(doc);
  delete limpo.en;
  if (objeto(limpo.noivos)) limpo.noivos = { ...limpo.noivos, noiva: "Noiva", noivo: "Noivo" };
  if (objeto(limpo.meta) && typeof limpo.meta.titulo === "string") {
    limpo.meta = { ...limpo.meta, titulo: limpo.meta.titulo.replace(/\|.*$/, "| Noiva & Noivo") };
  }
  if (objeto(limpo.pais)) {
    const pais = { ...limpo.pais };
    if (Array.isArray(pais.noiva)) pais.noiva = ["Pai da noiva", "Mãe da noiva"];
    if (Array.isArray(pais.noivo)) pais.noivo = ["Pai do noivo", "Mãe do noivo"];
    limpo.pais = pais;
  }
  return limpo;
}

/** Só as chaves públicas do mural: o uuid do casal e qualquer segredo saem. */
export function envSemCasal(env: string): string {
  return env
    .split(/\r?\n/)
    .filter((l) => /^NEXT_PUBLIC_[A-Z0-9_]+=/.test(l) && !l.startsWith("NEXT_PUBLIC_SITE_ID="))
    .join("\n")
    .replace(/\n*$/, "\n");
}

/** Lista de convidados e os links gerados são do casal, não do desenho. */
function entraNoModelo(src: string, raiz: string): boolean {
  if (!copiavel(src, raiz)) return false;
  const nome = basename(src);
  if (/^convidados-.*\.txt$/.test(nome)) return false;
  if (nome === "guests.json" && basename(dirname(src)) === "public") return false;
  if (/^\.env/.test(nome) && nome !== ".env.local") return false;
  return true;
}

async function lerMeta(cfg: ConfigR2, id: string): Promise<Modelo | null> {
  const bruto = await r2Get(cfg, `${RAIZ}${id}/meta.json`);
  if (!bruto) return null;
  try {
    const m = JSON.parse(bruto.toString("utf8")) as Modelo;
    return m && m.id === id ? m : null;
  } catch {
    return null;
  }
}

export async function listarModelos(): Promise<Modelo[]> {
  const cfg = await configR2();
  const { pastas } = await r2Listar(cfg, RAIZ, "/");
  const ids = pastas.map((p) => p.slice(RAIZ.length, -1)).filter((id) => ID.test(id));
  const metas: Modelo[] = [];
  for (let i = 0; i < ids.length; i += LEITURAS_EM_PARALELO) {
    const lote = await Promise.all(ids.slice(i, i + LEITURAS_EM_PARALELO).map((id) => lerMeta(cfg, id)));
    metas.push(...lote.filter((m): m is Modelo => m !== null));
  }
  return metas.sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nome.localeCompare(b.nome));
}

/**
 * Empacota a partir de uma cópia limpa numa pasta temporária: o convite do casal
 * no disco nunca é tocado, e o que sobe é exactamente o que foi limpo.
 */
export async function salvarModelo(siteId: string, carga: unknown): Promise<Modelo> {
  const c = (carga ?? {}) as Record<string, unknown>;
  const nome = texto(c.nome, 60);
  if (!nome) throw new Error("dá um nome ao modelo");
  const categoria = categoriaValida(c.categoria);
  const origem = await siteDir(siteId);
  const temp = await mkdtemp(join(tmpdir(), "criarte-modelo-"));
  try {
    await cp(origem, temp, { recursive: true, filter: (src) => entraNoModelo(src, origem) });
    const conviteJson = join(temp, "convite.json");
    if (!existsSync(conviteJson)) throw new Error("este convite não tem convite.json — o Studio não o edita");
    const doc = conviteSemCasal(JSON.parse(await readFile(conviteJson, "utf8")));
    await writeFile(conviteJson, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
    const env = join(temp, ".env.local");
    if (existsSync(env)) await writeFile(env, envSemCasal(await readFile(env, "utf8")), "utf8");

    const pacote = await empacotar(temp, () => true);
    const tema = objeto(doc.tema) ? doc.tema : {};
    const cfg = await configR2();
    const agora = new Date().toISOString();
    const meta: Modelo = {
      v: 1,
      id: `${slug(nome)}-${randomBytes(4).toString("hex")}`,
      nome,
      categoria,
      nota: texto(c.nota, 160),
      cor: typeof tema.destaque === "string" ? tema.destaque : null,
      bytes: pacote.byteLength,
      autor: cfg.autor,
      criado: agora,
      atualizado: agora,
    };
    await r2Put(cfg, `${RAIZ}${meta.id}/fonte.bin`, pacote, "application/octet-stream", UPLOAD_MAX_MS);
    await r2Put(cfg, `${RAIZ}${meta.id}/meta.json`, Buffer.from(JSON.stringify(meta), "utf8"), "application/json");
    return meta;
  } finally {
    await rm(temp, { recursive: true, force: true }).catch(() => {});
  }
}

export async function baixarModelo(id: unknown): Promise<{ meta: Modelo; pacote: Buffer }> {
  if (typeof id !== "string" || !ID.test(id)) throw new Error("modelo inválido");
  const cfg = await configR2();
  const meta = await lerMeta(cfg, id);
  const pacote = meta ? await r2Get(cfg, `${RAIZ}${id}/fonte.bin`) : null;
  if (!meta || !pacote) throw new Error("esse modelo já não está na biblioteca");
  return { meta, pacote };
}

export async function apagarModelo(id: unknown): Promise<void> {
  if (typeof id !== "string" || !ID.test(id)) throw new Error("modelo inválido");
  const cfg = await configR2();
  await r2Delete(cfg, `${RAIZ}${id}/meta.json`);
  const { chaves } = await r2Listar(cfg, `${RAIZ}${id}/`);
  for (const k of chaves) await r2Delete(cfg, k);
}
