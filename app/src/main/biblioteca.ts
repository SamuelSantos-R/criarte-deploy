import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import { configR2, r2Delete, r2Get, r2Listar, r2Put, type ConfigR2 } from "./r2";
import { svgLimpo } from "./monograma";

// ============================================================================
// BIBLIOTECA DE MONOGRAMAS — uma pasta por monograma no R2, sem índice central.
// ============================================================================
// Índice único seria um ficheiro que duas máquinas reescrevem ao mesmo tempo e
// uma apaga o que a outra acabou de pôr. Pasta por monograma não tem com quem
// colidir. O `meta.json` é gravado por último: pasta sem ele é gravação que
// caiu a meio, e a listagem ignora.

const RAIZ = "monogramas/";
const ID = /^[a-z0-9-]{6,80}$/;
const SVG_MAX = 8 * 1024 * 1024;
const PNG_MAX = 20 * 1024 * 1024;
const EDICAO_MAX = 4 * 1024 * 1024;
const LEITURAS_EM_PARALELO = 8;

export type Meta = {
  v: 1;
  id: string;
  nome: string;
  iniciais: string;
  cor: string;
  fonte: string;
  autor: string | null;
  criado: string;
  atualizado: string;
};
export type Cartao = Meta & { png: string; svg: string };

function idValido(v: unknown): string {
  if (typeof v !== "string" || !ID.test(v)) throw new Error("monograma inválido");
  return v;
}

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function slug(v: string): string {
  return (
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "monograma"
  );
}

const publico = (cfg: ConfigR2, meta: Meta, arquivo: string): string =>
  // O `v` fura o cache do r2.dev depois de uma regravação por cima.
  `${cfg.publicUrl}/${RAIZ}${meta.id}/${arquivo}?v=${encodeURIComponent(meta.atualizado)}`;

async function lerMeta(cfg: ConfigR2, id: string): Promise<Meta | null> {
  const bruto = await r2Get(cfg, `${RAIZ}${id}/meta.json`);
  if (!bruto) return null;
  try {
    const m = JSON.parse(bruto.toString("utf8")) as Meta;
    return m && m.id === id ? m : null;
  } catch {
    return null;
  }
}

export async function listarBiblioteca(): Promise<Cartao[]> {
  const cfg = await configR2();
  const { pastas } = await r2Listar(cfg, RAIZ, "/");
  const ids = pastas.map((p) => p.slice(RAIZ.length, -1)).filter((id) => ID.test(id));

  const metas: Meta[] = [];
  for (let i = 0; i < ids.length; i += LEITURAS_EM_PARALELO) {
    const lote = await Promise.all(ids.slice(i, i + LEITURAS_EM_PARALELO).map((id) => lerMeta(cfg, id)));
    metas.push(...lote.filter((m): m is Meta => m !== null));
  }
  return metas
    .sort((a, b) => b.atualizado.localeCompare(a.atualizado))
    .map((m) => ({ ...m, png: publico(cfg, m, "monograma.png"), svg: publico(cfg, m, "monograma.svg") }));
}

/** Com `id` regrava por cima (editar); sem, nasce um monograma novo. */
export async function salvarNaBiblioteca(carga: unknown): Promise<Cartao> {
  const c = (carga ?? {}) as Record<string, unknown>;
  const svg = c.svg;
  const png = c.png;
  const PREFIXO = "data:image/png;base64,";
  if (!svgLimpo(svg, SVG_MAX)) throw new Error("svg inválido");
  if (typeof png !== "string" || !png.startsWith(PREFIXO) || png.length > PNG_MAX) throw new Error("png inválido");
  if (c.edicao === null || typeof c.edicao !== "object") throw new Error("edição inválida");
  const edicao = JSON.stringify(c.edicao);
  if (edicao.length > EDICAO_MAX) throw new Error("edição grande demais");
  const cor = texto(c.cor, 7);
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(cor)) throw new Error("cor inválida");

  const cfg = await configR2();
  const nome = texto(c.nome, 80);
  const iniciais = texto(c.iniciais, 4);
  const agora = new Date().toISOString();

  let id: string;
  let criado = agora;
  if (c.id === undefined || c.id === null) {
    id = `${slug(nome || iniciais)}-${randomBytes(4).toString("hex")}`;
  } else {
    id = idValido(c.id);
    const antigo = await lerMeta(cfg, id);
    if (!antigo) throw new Error("esse monograma já não está na biblioteca — salve como novo");
    criado = antigo.criado;
  }

  const meta: Meta = {
    v: 1,
    id,
    nome: nome || iniciais,
    iniciais,
    cor,
    fonte: texto(c.fonte, 80),
    autor: cfg.autor,
    criado,
    atualizado: agora,
  };
  const pasta = `${RAIZ}${id}/`;
  await r2Put(cfg, `${pasta}monograma.svg`, Buffer.from(svg, "utf8"), "image/svg+xml");
  await r2Put(cfg, `${pasta}monograma.png`, Buffer.from(png.slice(PREFIXO.length), "base64"), "image/png");
  await r2Put(cfg, `${pasta}edicao.json`, Buffer.from(edicao, "utf8"), "application/json");
  await r2Put(cfg, `${pasta}meta.json`, Buffer.from(JSON.stringify(meta), "utf8"), "application/json");
  return { ...meta, png: publico(cfg, meta, "monograma.png"), svg: publico(cfg, meta, "monograma.svg") };
}

export async function abrirDaBiblioteca(id: unknown): Promise<{ meta: Meta; edicao: unknown }> {
  const cfg = await configR2();
  const alvo = idValido(id);
  const meta = await lerMeta(cfg, alvo);
  const bruto = await r2Get(cfg, `${RAIZ}${alvo}/edicao.json`);
  if (!meta || !bruto) throw new Error("esse monograma já não está na biblioteca");
  return { meta, edicao: JSON.parse(bruto.toString("utf8")) as unknown };
}

export async function apagarDaBiblioteca(id: unknown): Promise<void> {
  const cfg = await configR2();
  const alvo = idValido(id);
  // meta.json primeiro: se cair a meio, o que sobra já não aparece na listagem.
  await r2Delete(cfg, `${RAIZ}${alvo}/meta.json`);
  const { chaves } = await r2Listar(cfg, `${RAIZ}${alvo}/`);
  for (const k of chaves) await r2Delete(cfg, k);
}

/** Traz o SVG pra uma pasta temporária, pro convite importar como qualquer asset. */
export async function baixarSvg(id: unknown): Promise<string> {
  const cfg = await configR2();
  const alvo = idValido(id);
  const meta = await lerMeta(cfg, alvo);
  const svg = await r2Get(cfg, `${RAIZ}${alvo}/monograma.svg`);
  if (!meta || !svg) throw new Error("esse monograma já não está na biblioteca");
  const pasta = join(app.getPath("temp"), "criarte-monogramas");
  await mkdir(pasta, { recursive: true });
  const destino = join(pasta, `monograma-${slug(meta.nome)}.svg`);
  await writeFile(destino, svg);
  return destino;
}
