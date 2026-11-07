import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { siteDirExistente } from "./sites";

// ============================================================================
// MÚSICA — procurar a música do convite, baixar o áudio e cortar o início,
// sem sair do Studio. Corre só NESTA máquina (yt-dlp + ffmpeg locais), nunca
// no servidor.
//
// Atenção: baixar áudio do YouTube vai contra os termos de uso do YouTube.
// Foi decisão da Criarte usar isto mesmo assim, por conta própria.
//
// Fluxo: buscar → previa (baixa para a pasta temporária e devolve os bytes
// para ouvir no Studio) → usar (corta a partir do segundo escolhido, com fade,
// e grava em public/assets do convite).
// ============================================================================

const exec = promisify(execFile);

/**
 * O yt-dlp fica velho em semanas: o YouTube muda e ele passa a levar 403.
 * Traduz o erro para o que a pessoa tem de fazer, em vez de "código 1".
 */
async function run(bin: string, args: string[], opts: { timeout: number; maxBuffer?: number }) {
  try {
    return await exec(bin, args, opts);
  } catch (erro) {
    const e = erro as { stderr?: string; killed?: boolean; message?: string };
    const err = String(e.stderr ?? "");
    console.error(
      `[musica] ${bin.split("/").pop()} falhou (código ${String((erro as { code?: unknown }).code)}):`,
      err.slice(-1200) || String((erro as { stdout?: string }).stdout ?? "").slice(-1200) || e.message,
    );
    if (e.killed) throw new Error("Demorou demais. Verifique a internet e tente de novo.");
    if (bin.endsWith("yt-dlp") && /403|Sign in to confirm|Requested format is not available|nsig/i.test(err)) {
      throw new Error("O yt-dlp desta máquina está desatualizado. No Terminal: yt-dlp -U — depois tente de novo.");
    }
    if (/Video unavailable|Private video|age/i.test(err)) throw new Error("Esse vídeo não está disponível. Escolha outra versão.");
    const ultima = err.trim().split("\n").filter(Boolean).pop();
    throw new Error(ultima ? ultima.replace(/^ERROR:\s*/, "").slice(0, 200) : (e.message ?? "falha ao processar a música"));
  }
}

/** O Studio aberto pelo Finder não herda o PATH do terminal: procura nos sítios do costume. */
function binario(nome: string): string {
  // O do Homebrew primeiro: o binário "onefile" do site do yt-dlp leva ~20 s
  // só a arrancar no macOS (descompacta e é verificado a cada execução).
  const candidatos = [
    `/opt/homebrew/bin/${nome}`,
    `/usr/local/bin/${nome}`,
    join(homedir(), ".local/bin", nome),
    `/usr/bin/${nome}`,
  ];
  const achado = candidatos.find((c) => existsSync(c));
  if (!achado) {
    throw new Error(
      nome === "yt-dlp"
        ? "yt-dlp não está instalado nesta máquina (brew install yt-dlp)."
        : "ffmpeg não está instalado nesta máquina (brew install ffmpeg).",
    );
  }
  return achado;
}

export type Faixa = {
  id: string;
  titulo: string;
  canal: string;
  duracao: number;
  capa: string;
  /** Ao vivo, show, cover, karaoke… — aparece, mas vai para o fim da lista. */
  versaoSuspeita: boolean;
};

const SUSPEITA = /\b(ao vivo|live|show|cover|karaok[eê]|instrumental|remix|sped ?up|slowed|reverb|8d|lyrics? video|letra)\b/i;
const ID = /^[A-Za-z0-9_-]{6,20}$/;

export async function buscarMusica(consulta: unknown): Promise<Faixa[]> {
  const q = typeof consulta === "string" ? consulta.trim().slice(0, 150) : "";
  if (q.length < 2) return [];
  const { stdout } = await run(
    binario("yt-dlp"),
    [`ytsearch10:${q}`, "--flat-playlist", "--dump-json", "--no-warnings", "--skip-download"],
    { timeout: 90_000, maxBuffer: 20 * 1024 * 1024 },
  );
  const faixas = stdout
    .split("\n")
    .filter(Boolean)
    .map((linha) => JSON.parse(linha) as Record<string, unknown>)
    .filter((j) => typeof j.id === "string" && ID.test(j.id))
    .map((j): Faixa => {
      const titulo = String(j.title ?? "");
      const thumbs = Array.isArray(j.thumbnails) ? (j.thumbnails as { url?: string }[]) : [];
      return {
        id: String(j.id),
        titulo,
        canal: String(j.channel ?? j.uploader ?? ""),
        duracao: typeof j.duration === "number" ? j.duration : 0,
        capa: thumbs[thumbs.length - 1]?.url ?? `https://i.ytimg.com/vi/${String(j.id)}/hqdefault.jpg`,
        versaoSuspeita: SUSPEITA.test(titulo),
      };
    })
    // Clipes de 1h ("1 hour loop") e vinhetas de 30s não são a música.
    .filter((f) => f.duracao === 0 || (f.duracao >= 60 && f.duracao <= 900));
  return [...faixas.filter((f) => !f.versaoSuspeita), ...faixas.filter((f) => f.versaoSuspeita)].slice(0, 6);
}

/** Uma prévia por faixa: baixar duas vezes a mesma é tempo perdido. */
const previas = new Map<string, string>();

async function baixarCompleta(id: string): Promise<string> {
  if (!ID.test(id)) throw new Error("id de vídeo inválido");
  const pronta = previas.get(id);
  if (pronta && existsSync(pronta)) return pronta;
  const pasta = await mkdtemp(join(tmpdir(), "criarte-musica-"));
  await run(
    binario("yt-dlp"),
    [
      `https://www.youtube.com/watch?v=${id}`,
      "-x",
      "--audio-format", "mp3",
      "--audio-quality", "2",
      "--no-playlist",
      "--no-warnings",
      "--ffmpeg-location", binario("ffmpeg"),
      "-o", join(pasta, "faixa.%(ext)s"),
    ],
    { timeout: 300_000, maxBuffer: 10 * 1024 * 1024 },
  );
  const mp3 = (await readdir(pasta)).find((f) => f.endsWith(".mp3"));
  if (!mp3) throw new Error("O download terminou sem áudio. Tente outra versão.");
  const caminho = join(pasta, mp3);
  previas.set(id, caminho);
  return caminho;
}

/** Os bytes do mp3 inteiro, para ouvir e escolher o início no Studio. */
export async function previaMusica(id: unknown): Promise<Uint8Array> {
  if (typeof id !== "string") throw new Error("id de vídeo inválido");
  return new Uint8Array(await readFile(await baixarCompleta(id)));
}

function nomeDoArquivo(artista: string, titulo: string): string {
  const base = `${artista} ${titulo}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${base || "musica"}.mp3`;
}

/**
 * Corta a partir de `inicio` (segundos), com 1,5 s de fade-in para não entrar
 * a meio de uma palavra aos gritos, e grava em public/assets. Devolve o
 * caminho que vai para `musica.arquivo`.
 */
export async function usarMusica(params: {
  siteId: unknown;
  id: unknown;
  inicio: unknown;
  artista: unknown;
  titulo: unknown;
}): Promise<{ arquivo: string }> {
  if (typeof params.siteId !== "string" || typeof params.id !== "string") throw new Error("pedido inválido");
  const inicio = typeof params.inicio === "number" && Number.isFinite(params.inicio) ? Math.max(0, params.inicio) : 0;
  const origem = await baixarCompleta(params.id);
  const destinoDir = join(await siteDirExistente(params.siteId), "public", "assets");
  await mkdir(destinoDir, { recursive: true });
  const nome = nomeDoArquivo(String(params.artista ?? ""), String(params.titulo ?? ""));
  await run(
    binario("ffmpeg"),
    [
      "-y",
      "-ss", inicio.toFixed(2),
      "-i", origem,
      "-af", "afade=t=in:st=0:d=1.5",
      "-codec:a", "libmp3lame",
      "-q:a", "3",
      "-map_metadata", "-1",
      join(destinoDir, nome),
    ],
    { timeout: 120_000 },
  );
  return { arquivo: `/assets/${nome}` };
}

/** Limpa as prévias ao fechar o Studio. */
export async function limparPrevias(): Promise<void> {
  await Promise.all(
    [...previas.values()].map((p) => rm(join(p, ".."), { recursive: true, force: true }).catch(() => {})),
  );
  previas.clear();
}
