import { BrowserWindow, WebContentsView, session } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { networkInterfaces } from "node:os";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { siteDir } from "./sites";

export type Retangulo = { x: number; y: number; width: number; height: number };
export type Dispositivo = { largura: number; altura: number; dpr: number; movel: boolean };
export type Servidor = { siteId: string; url: string; lan: string | null };

const UA_MOVEL =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

let servidor: (Servidor & { child: ChildProcess }) | null = null;
let vista: WebContentsView | null = null;
// Guardado antes de virar iPhone: depois de trocar não dá pra recuperar.
let uaPadrao = "";

/**
 * `169.254.*` é APIPA (sem DHCP) e `feth/bridge/utun/awdl` são interfaces
 * virtuais: todas respondem HTTP no próprio Mac e enganam o teste, mas o
 * celular nunca alcança. O que sobra é o IP que dá pra ler no QR.
 */
function ipDaRede(): string | null {
  for (const [nome, addrs] of Object.entries(networkInterfaces())) {
    if (/^(feth|bridge|utun|awdl|llw|ap\d)/.test(nome)) continue;
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" || a.internal) continue;
      if (a.address.startsWith("169.254.")) continue;
      return a.address;
    }
  }
  return null;
}

function portaLivre(): Promise<number> {
  return new Promise((res, rej) => {
    const s = createServer();
    s.on("error", rej);
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => res(p));
    });
  });
}

export async function iniciarServidor(siteId: string): Promise<Servidor> {
  if (servidor?.siteId === siteId) return { siteId, url: servidor.url, lan: servidor.lan };
  pararServidor();

  const cwd = await siteDir(siteId);
  const bin = join(cwd, "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(bin)) throw new Error("o site não tem node_modules — rode `npm install` na pasta dele");

  const porta = await portaLivre();
  // O próprio Electron vira Node: não precisa de node/npm no PATH da GUI.
  const child = spawn(process.execPath, [bin, "dev", "--port", String(porta), "--hostname", "0.0.0.0"], {
    cwd,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", FORCE_COLOR: "0", NODE_ENV: "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const url = `http://localhost:${porta}`;
  const lanIp = ipDaRede();
  const pronto = new Promise<void>((res, rej) => {
    let buffer = "";
    const olhar = (c: Buffer): void => {
      buffer += c.toString();
      if (/Ready in|started server on|- Local:/i.test(buffer)) res();
    };
    child.stdout?.on("data", olhar);
    child.stderr?.on("data", olhar);
    // Se o filho morre antes de subir, o erro do Next some sem isso.
    child.on("close", (code) => rej(new Error(`o dev server saiu (${code})\n${buffer.slice(-800)}`)));
    child.on("error", (e) => rej(e));
    setTimeout(() => rej(new Error(`o dev server não subiu em 90s\n${buffer.slice(-800)}`)), 90_000);
  });

  try {
    await pronto;
  } catch (e) {
    pararServidor();
    throw e;
  }

  servidor = { siteId, url, lan: lanIp ? `http://${lanIp}:${porta}` : null, child };
  return { siteId, url: servidor.url, lan: servidor.lan };
}

export function pararServidor(): void {
  soltarVista();
  servidor?.child.kill("SIGTERM");
  servidor = null;
}

function soltarVista(): void {
  if (!vista) return;
  const win = BrowserWindow.getAllWindows()[0];
  win?.contentView.removeChildView(vista);
  vista.webContents.close();
  vista = null;
}

function inteiro(v: unknown, min: number, max: number): number {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) throw new Error("número inválido");
  return Math.min(Math.max(n, min), max);
}

function comoRetangulo(v: unknown): Retangulo {
  const r = (v ?? {}) as Record<string, unknown>;
  return {
    x: inteiro(r.x, 0, 20_000),
    y: inteiro(r.y, 0, 20_000),
    width: inteiro(r.width, 1, 20_000),
    height: inteiro(r.height, 1, 20_000),
  };
}

function comoDispositivo(v: unknown): Dispositivo {
  const d = (v ?? {}) as Record<string, unknown>;
  return {
    largura: inteiro(d.largura, 240, 3840),
    altura: inteiro(d.altura, 240, 3840),
    dpr: Math.min(Math.max(Number(d.dpr) || 1, 1), 4),
    movel: d.movel === true,
  };
}

/**
 * O site acha que tem a largura do aparelho; o zoom só encolhe o desenho pra
 * caber no painel. Sem isso o `pointer: coarse` do CSS não responde e o
 * preview mente sobre o que o convidado vê no telefone.
 */
async function aplicarDispositivo(d: Dispositivo, area: Retangulo): Promise<number> {
  if (!vista) return 1;
  const zoom = Math.min(area.width / d.largura, area.height / d.altura, 1);
  const wc = vista.webContents;

  vista.setBounds({
    x: Math.round(area.x + (area.width - d.largura * zoom) / 2),
    y: Math.round(area.y + (area.height - d.altura * zoom) / 2),
    width: Math.round(d.largura * zoom),
    height: Math.round(d.altura * zoom),
  });

  // Quem encolhe é o `scale` do override, não `setZoomFactor` — o zoom do
  // Electron entra na conta do viewport e o site passa a achar que tem
  // `largura / zoom` px. O zoom fica travado em 1.
  wc.setZoomFactor(1);
  try {
    if (!wc.debugger.isAttached()) wc.debugger.attach("1.3");
    // Limpar antes: reenviar o override por cima do anterior faz o `scale`
    // velho entrar na conta e o viewport sai errado na troca de aparelho.
    await wc.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
    await wc.debugger.sendCommand("Emulation.setDeviceMetricsOverride", {
      width: d.largura,
      height: d.altura,
      deviceScaleFactor: d.dpr,
      mobile: d.movel,
      scale: zoom,
      screenWidth: d.largura,
      screenHeight: d.altura,
    });
    await wc.debugger.sendCommand("Emulation.setTouchEmulationEnabled", {
      enabled: d.movel,
      // O CDP recusa 0 — e a recusa derruba os comandos seguintes desta fila.
      maxTouchPoints: d.movel ? 5 : 1,
    });
    // `setUserAgent` do Electron só vale na próxima navegação; o override do
    // CDP troca o `navigator.userAgent` da página que já está aberta.
    await wc.debugger.sendCommand("Emulation.setUserAgentOverride", {
      userAgent: d.movel ? UA_MOVEL : uaPadrao,
    });
  } catch {
    // Sem CDP o preview ainda mostra o site, só não finge ser telefone.
  }
  return zoom;
}

// Troca de aparelho e ResizeObserver disparam juntos; sem fila os comandos do
// CDP se intercalam e a vista fica com o tamanho de um e o toque de outro.
let fila: Promise<unknown> = Promise.resolve();

export function montarVista(alvo: unknown, disp: unknown): Promise<{ zoom: number }> {
  const tarefa = fila.then(
    () => montarAgora(alvo, disp),
    () => montarAgora(alvo, disp),
  );
  fila = tarefa.catch(() => undefined);
  return tarefa;
}

async function montarAgora(alvo: unknown, disp: unknown): Promise<{ zoom: number }> {
  if (!servidor) throw new Error("nenhum preview rodando");
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("sem janela");
  const area = comoRetangulo(alvo);
  const d = comoDispositivo(disp);

  if (!vista) {
    vista = new WebContentsView({
      webPreferences: {
        // Sessão própria e efêmera: o site em preview não encosta no estado do app.
        session: session.fromPartition(`preview-${Date.now()}`),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    const base = servidor.url;
    // O preview só existe pra ver o site local. Link pra fora sai no navegador.
    vista.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    vista.webContents.on("will-navigate", (e, url) => {
      if (!url.startsWith(base)) e.preventDefault();
    });
    win.contentView.addChildView(vista);
    // Antes do primeiro request: o override do CDP só entra depois de carregar.
    uaPadrao = vista.webContents.getUserAgent().replace(/ Electron\/[\d.]+/, "");
    if (d.movel) vista.webContents.setUserAgent(UA_MOVEL);
    await vista.webContents.loadURL(base);
  }

  const zoom = await aplicarDispositivo(d, area);
  return { zoom };
}

export function esconderVista(): void {
  soltarVista();
}

export function recarregarVista(): void {
  vista?.webContents.reload();
}

export function estadoPreview(): Servidor | null {
  return servidor ? { siteId: servidor.siteId, url: servidor.url, lan: servidor.lan } : null;
}
