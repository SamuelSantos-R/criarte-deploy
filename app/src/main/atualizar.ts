import { createHash } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { access, constants, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { spawn, execFile } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { app } from "electron";
import { configR2, prefixoAtualizacoes, r2Get, r2Stream } from "./r2";

// ============================================================================
// ATUALIZAÇÃO DO STUDIO — sem AirDrop. O Heatz gera o instalador e corre
// `npm run publicar`; cada Studio vê a versão nova em Config e troca-se sozinho.
// ============================================================================
// Sem electron-updater: no macOS ele passa pelo Squirrel, que exige a mesma
// assinatura de developer entre versões — e o app sai com assinatura ad-hoc,
// que muda a cada build. Aqui o .dmg é montado e o .app trocado à mão.

const exec = promisify(execFile);

/** Uma plataforma no manifesto. Cada uma tem a sua versão: dá pra publicar só o .dmg. */
export type Pacote = { versao: string; chave: string; sha512: string; bytes: number };
export type Manifesto = { v: 1; publicado: string; notas: string; mac?: Pacote; win?: Pacote };

export type EstadoAtualizacao = {
  atual: string;
  nova: string | null;
  notas: string;
  bytes: number;
  /** Porque é que esta máquina não pode instalar sozinha, se não puder. */
  impedimento: string | null;
};
export type Progresso = { fase: "baixar" | "verificar" | "preparar" | "reiniciar"; feito: number; total: number };

const DOWNLOAD_MAX_MS = 60 * 60 * 1000;
const PLATAFORMA = process.platform === "darwin" ? "mac" : process.platform === "win32" ? "win" : null;
const pastaTemp = (): string => join(app.getPath("temp"), "criarte-studio-atualizacao");
let emCurso = false;

function partes(v: string): number[] {
  return v.split(".").map((n) => Number.parseInt(n, 10) || 0);
}

export function maisNova(a: string, b: string): boolean {
  const [x, y] = [partes(a), partes(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}

function pacoteValido(p: unknown, prefixo: string): p is Pacote {
  const c = p as Record<string, unknown> | undefined;
  return (
    !!c &&
    typeof c.versao === "string" &&
    /^\d+\.\d+\.\d+$/.test(c.versao) &&
    typeof c.chave === "string" &&
    // A chave vem do manifesto e vira caminho de download: só dentro da pasta das atualizações.
    c.chave.startsWith(prefixo) &&
    !c.chave.includes("..") &&
    typeof c.sha512 === "string" &&
    /^[0-9a-f]{128}$/.test(c.sha512) &&
    typeof c.bytes === "number" &&
    c.bytes > 0
  );
}

/** Onde o .app instalado mora. Nulo em dev ou fora de um bundle. */
function bundleMac(): string | null {
  const bundle = resolve(app.getPath("exe"), "..", "..", "..");
  return bundle.endsWith(".app") ? bundle : null;
}

async function impedimento(): Promise<string | null> {
  if (!app.isPackaged) return "em desenvolvimento não se atualiza — só no app instalado";
  if (!PLATAFORMA) return "esta plataforma não tem instalador";
  if (PLATAFORMA === "mac") {
    const bundle = bundleMac();
    if (!bundle) return "não achei o Criarte Studio.app";
    try {
      // Aberto de dentro do .dmg ou em quarentena (AppTranslocation) é só leitura.
      await access(dirname(bundle), constants.W_OK);
    } catch {
      return "arraste o Criarte Studio para a pasta Aplicações e abra de lá";
    }
  }
  return null;
}

async function lerManifesto(): Promise<{ manifesto: Manifesto | null; prefixo: string }> {
  const cfg = await configR2();
  const prefixo = prefixoAtualizacoes(cfg);
  const bruto = await r2Get(cfg, `${prefixo}latest.json`);
  if (!bruto) return { manifesto: null, prefixo };
  try {
    return { manifesto: JSON.parse(bruto.toString("utf8")) as Manifesto, prefixo };
  } catch {
    throw new Error("o manifesto de atualização veio estragado");
  }
}

export async function verificarAtualizacao(): Promise<EstadoAtualizacao> {
  const atual = app.getVersion();
  const { manifesto, prefixo } = await lerManifesto();
  const pacote = manifesto && PLATAFORMA ? manifesto[PLATAFORMA] : undefined;
  if (!pacote || !pacoteValido(pacote, prefixo) || !maisNova(pacote.versao, atual)) {
    return { atual, nova: null, notas: "", bytes: 0, impedimento: null };
  }
  return {
    atual,
    nova: pacote.versao,
    notas: typeof manifesto?.notas === "string" ? manifesto.notas.slice(0, 2000) : "",
    bytes: pacote.bytes,
    impedimento: await impedimento(),
  };
}

async function baixar(pacote: Pacote, destino: string, avisar: (p: Progresso) => void): Promise<void> {
  const cfg = await configR2();
  const r = await r2Stream(cfg, pacote.chave, DOWNLOAD_MAX_MS);
  if (!r?.body) throw new Error("o instalador sumiu do R2 — publica de novo");
  const hash = createHash("sha512");
  let feito = 0;
  let ultimo = 0;
  const contar = new Transform({
    transform(pedaco: Buffer, _enc, cb) {
      feito += pedaco.length;
      hash.update(pedaco);
      if (feito > pacote.bytes) return cb(new Error("o instalador veio maior do que o anunciado"));
      const agora = Date.now();
      if (agora - ultimo > 150) {
        ultimo = agora;
        avisar({ fase: "baixar", feito, total: pacote.bytes });
      }
      cb(null, pedaco);
    },
  });
  await pipeline(Readable.fromWeb(r.body as import("node:stream/web").ReadableStream), contar, createWriteStream(destino));
  avisar({ fase: "verificar", feito, total: pacote.bytes });
  if (feito !== pacote.bytes || hash.digest("hex") !== pacote.sha512) {
    await rm(destino, { force: true });
    throw new Error("o instalador chegou corrompido — tenta de novo");
  }
}

/** Monta o .dmg, copia o .app pra fora e desmonta. */
async function extrairApp(dmg: string, pasta: string): Promise<string> {
  const ponto = join(pasta, "montado");
  await mkdir(ponto, { recursive: true });
  await exec("/usr/bin/hdiutil", ["attach", "-nobrowse", "-readonly", "-noautoopen", "-mountpoint", ponto, dmg]);
  try {
    const nome = (await readdir(ponto)).find((n) => n.endsWith(".app"));
    if (!nome) throw new Error("o .dmg não tem o app dentro");
    const novo = join(pasta, nome);
    await rm(novo, { recursive: true, force: true });
    await exec("/usr/bin/ditto", [join(ponto, nome), novo]);
    return novo;
  } finally {
    await exec("/usr/bin/hdiutil", ["detach", ponto, "-force"]).catch(() => undefined);
  }
}

/**
 * Espera o Studio fechar, troca o .app e abre o novo. O antigo só sai depois de
 * o novo estar no lugar; se a troca falhar, ele volta. O ficheiro baixado pelo
 * Node não leva quarentena, então o Gatekeeper não pergunta de novo.
 */
const TROCA_MAC = `#!/bin/sh
PID="$1"; NOVO="$2"; DESTINO="$3"
i=0
while kill -0 "$PID" 2>/dev/null && [ $i -lt 300 ]; do sleep 0.2; i=$((i+1)); done
VELHO="$DESTINO.antigo-$$"
if mv "$DESTINO" "$VELHO"; then
  if mv "$NOVO" "$DESTINO"; then rm -rf "$VELHO"; else mv "$VELHO" "$DESTINO"; fi
fi
xattr -dr com.apple.quarantine "$DESTINO" 2>/dev/null
open "$DESTINO"
`;

/** O .dmg de 134 MB fica na temp depois da troca; o Studio novo arruma ao abrir. */
export function limparAtualizacao(): void {
  if (!emCurso) void rm(pastaTemp(), { recursive: true, force: true }).catch(() => undefined);
}

export async function instalarAtualizacao(avisar: (p: Progresso) => void): Promise<void> {
  if (emCurso) throw new Error("a atualização já está a correr");
  const bloqueio = await impedimento();
  if (bloqueio) throw new Error(bloqueio);
  emCurso = true;
  try {
    const { manifesto, prefixo } = await lerManifesto();
    const pacote = manifesto && PLATAFORMA ? manifesto[PLATAFORMA] : undefined;
    if (!pacote || !pacoteValido(pacote, prefixo) || !maisNova(pacote.versao, app.getVersion())) {
      throw new Error("não há versão nova para esta máquina");
    }

    const pasta = pastaTemp();
    await rm(pasta, { recursive: true, force: true });
    await mkdir(pasta, { recursive: true });
    const instalador = join(pasta, PLATAFORMA === "mac" ? "Criarte-Studio.dmg" : "Criarte-Studio-Setup.exe");
    await baixar(pacote, instalador, avisar);

    avisar({ fase: "preparar", feito: pacote.bytes, total: pacote.bytes });
    if (PLATAFORMA === "mac") {
      const destino = bundleMac();
      if (!destino) throw new Error("não achei o Criarte Studio.app");
      const novo = await extrairApp(instalador, pasta);
      if (!existsSync(join(novo, "Contents", "MacOS")) || !(await stat(novo)).isDirectory()) {
        throw new Error("o app de dentro do .dmg veio incompleto");
      }
      const script = join(pasta, "trocar.sh");
      await writeFile(script, TROCA_MAC, { mode: 0o755 });
      avisar({ fase: "reiniciar", feito: pacote.bytes, total: pacote.bytes });
      spawn("/bin/sh", [script, String(process.pid), novo, destino], { detached: true, stdio: "ignore" }).unref();
    } else {
      // O instalador fecha o que ainda estiver aberto e já remove as versões antigas (installer.nsh).
      avisar({ fase: "reiniciar", feito: pacote.bytes, total: pacote.bytes });
      spawn(instalador, [], { detached: true, stdio: "ignore" }).unref();
    }
    setTimeout(() => app.quit(), 400);
  } finally {
    emCurso = false;
  }
}
