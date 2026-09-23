import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { app, dialog, shell, type WebContents } from "electron";

// ============================================================================
// ANIMAR ENVELOPE — o motor é o do FlapMotion, feito para a Criarte: compõe o
// convite sobre os onze quadros do papel a desdobrar-se (sharp) e fecha o vídeo
// com ffmpeg. Aqui ele entra como está, carregado de fora do bundle: é código
// CommonJS com binários nativos, que o empacotador não sabe embrulhar.
// ============================================================================

export type PassoAnimacao = { fase: string; fracao: number; quadro?: number; total?: number; segundos: number };
export type VideoFeito = { ficheiro: string; nome: string };

let emCurso: AbortController | null = null;

// O mesmo sítio nos dois formatos: a pasta do projeto em desenvolvimento, e
// `Resources/app` depois de empacotado (o asar está desligado desde a 6.1.0).
// Tem de ser dentro do app: o motor faz `require("sharp")` e o Node procura
// subindo a partir do ficheiro — de `Resources/` nunca chegava ao node_modules.
function pastaDoMotor(): string {
  return resolve(app.getAppPath(), "resources", "envelope-animado");
}

type Motor = {
  generate: (
    entrada: string,
    opcoes: {
      root: string;
      outDir: string;
      fileName: string;
      durationSeconds: number;
      suavizar?: boolean;
      signal: AbortSignal;
      onProgress: (d: { phase: string; fraction: number; elapsedSec: number; frame?: number; total?: number }) => void;
    },
  ) => Promise<string>;
};

function motor(): Motor {
  const pasta = pastaDoMotor();
  const carregar = createRequire(join(pasta, "package.json"));
  return carregar("./engine-curva.js") as Motor;
}

/** A pasta onde os vídeos saem: ao lado dos outros trabalhos, não escondida. */
function pastaDeSaida(): string {
  return join(app.getPath("home"), "Documents", "Criarte", "Envelopes animados");
}

export async function escolherConvite(): Promise<string | null> {
  const r = await dialog.showOpenDialog({
    title: "Escolha o convite com o lacre",
    properties: ["openFile"],
    filters: [{ name: "Imagem do convite", extensions: ["png", "jpg", "jpeg", "webp"] }],
  });
  return r.canceled ? null : (r.filePaths[0] ?? null);
}

/**
 * Faz o vídeo. `segundos` é a duração da abertura — o ritmo (começa devagar,
 * acelera) é o do perfil, esticado ou encolhido para caber nesse relógio.
 */
export async function animarEnvelope(
  sender: WebContents,
  entrada: unknown,
  segundos: unknown,
  suavizar: unknown = true,
): Promise<VideoFeito> {
  if (typeof entrada !== "string" || !existsSync(entrada)) throw new Error("não achei esse ficheiro");
  if (!/\.(png|jpe?g|webp)$/i.test(entrada)) throw new Error("tem de ser uma imagem do convite");
  if (emCurso) throw new Error("já há um vídeo a ser feito — espere ou cancele");
  const duracao = typeof segundos === "number" && segundos >= 1 && segundos <= 20 ? segundos : 6;

  const pasta = pastaDeSaida();
  await mkdir(pasta, { recursive: true });
  const nome = basename(entrada, extname(entrada));
  emCurso = new AbortController();
  const comeco = Date.now();
  try {
    const ficheiro = await motor().generate(entrada, {
      root: pastaDoMotor(),
      outDir: pasta,
      fileName: nome,
      durationSeconds: duracao,
      // Mistura as poses vizinhas com um obturador de cinema: tira o soluço do
      // começo e deixa um rasto leve onde a aba vira depressa.
      suavizar: suavizar !== false,
      signal: emCurso.signal,
      onProgress: (d) => {
        if (sender.isDestroyed()) return;
        sender.send("envelope:passo", {
          fase: d.phase,
          fracao: d.fraction,
          quadro: d.frame,
          total: d.total,
          segundos: (Date.now() - comeco) / 1000,
        } satisfies PassoAnimacao);
      },
    });
    return { ficheiro, nome: basename(ficheiro) };
  } finally {
    emCurso = null;
  }
}

export function cancelarEnvelope(): boolean {
  if (!emCurso) return false;
  emCurso.abort();
  return true;
}

export async function mostrarVideo(ficheiro: unknown): Promise<void> {
  if (typeof ficheiro !== "string" || !ficheiro.startsWith(pastaDeSaida())) return;
  shell.showItemInFolder(ficheiro);
}

/** Leva o vídeo para dentro do convite, como `public/assets/envelope.mp4`. */
export async function levarParaOConvite(ficheiro: unknown, destinoAssets: string): Promise<string> {
  if (typeof ficheiro !== "string" || !existsSync(ficheiro)) throw new Error("não achei o vídeo");
  await mkdir(destinoAssets, { recursive: true });
  const destino = join(destinoAssets, "envelope.mp4");
  await rm(destino, { force: true });
  await copyFile(ficheiro, destino);
  return "/assets/envelope.mp4";
}
