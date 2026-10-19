import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

// ============================================================================
// O vídeo do envelope de cada língua. O envelope abre o convite com o texto
// gravado no vídeo, por isso o convidado de fora precisa do vídeo na língua
// dele — é a única coisa que não se traduz por texto.
//
// Fica no bloco da língua do convite.json (`en.envelope.video`), que o convite
// já põe por cima do português quando o link leva `&l=en`: o EnvelopeLoader lê
// `convite.envelope.video` e recebe o certo sem saber de línguas.
//
// Sem nada do Electron: os testes correm em Node puro.
// ============================================================================

export const LINGUAS_COM_VIDEO = ["en", "fr"] as const;
export type LinguaComVideo = (typeof LINGUAS_COM_VIDEO)[number];
const EXTENSOES = new Set([".mp4", ".mov", ".webm", ".m4v"]);

const objeto = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Copia o vídeo para `public/assets/envelope-<lingua>.<ext>` e aponta o bloco da
 * língua para ele. Devolve o caminho gravado. Recusa convite sem envelope: o
 * vídeo não teria onde aparecer, e o melhor é dizê-lo antes de publicar.
 */
export async function videoDoEnvelope(dir: string, lingua: LinguaComVideo, origem: string): Promise<string> {
  if (!LINGUAS_COM_VIDEO.includes(lingua)) throw new Error("língua sem vídeo de envelope");
  const ext = extname(origem).toLowerCase();
  if (!EXTENSOES.has(ext)) throw new Error("o vídeo do envelope tem de ser .mp4, .mov, .webm ou .m4v");
  if (!existsSync(origem)) throw new Error(`vídeo não encontrado: ${origem}`);

  const arquivo = join(dir, "convite.json");
  const doc = JSON.parse(await readFile(arquivo, "utf8")) as Record<string, unknown>;
  if (!objeto(doc.envelope) || typeof doc.envelope.video !== "string") {
    throw new Error("este convite não tem vídeo de envelope — não há onde pôr o da outra língua");
  }

  const nome = `envelope-${lingua}${ext}`;
  await mkdir(join(dir, "public", "assets"), { recursive: true });
  await copyFile(origem, join(dir, "public", "assets", nome));

  const caminho = `/assets/${nome}`;
  const bloco = objeto(doc[lingua]) ? (doc[lingua] as Record<string, unknown>) : {};
  const envelope = objeto(bloco.envelope) ? bloco.envelope : {};
  doc[lingua] = { ...bloco, envelope: { ...envelope, video: caminho } };
  await writeFile(arquivo, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  return caminho;
}
