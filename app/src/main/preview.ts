import { type WebContents } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { networkInterfaces } from "node:os";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { siteDir } from "./sites";

export type Servidor = { siteId: string; url: string; lan: string | null };

let servidor: (Servidor & { child: ChildProcess }) | null = null;

/**
 * `169.254.*` é APIPA (sem DHCP) e `feth/bridge/utun/awdl` são interfaces
 * virtuais: todas respondem HTTP no próprio Mac e enganam o teste, mas o
 * celular nunca alcança. O que sobra é o IP que dá pra ler no QR.
 */
export function ipDaRede(): string | null {
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

/**
 * O `next` não mora mais dentro de cada convite: há um `node_modules` só, na
 * raiz de sites, e todos comem de lá. Subir as pastas é o mesmo que o Node faz
 * pra resolver um import — assim um convite recém-criado abre no preview sem
 * ninguém precisar de terminal.
 */
function acharNext(desde: string): string | null {
  for (let dir = desde; ; ) {
    const bin = join(dir, "node_modules", "next", "dist", "bin", "next");
    if (existsSync(bin)) return bin;
    const acima = dirname(dir);
    if (acima === dir) return null;
    dir = acima;
  }
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
  const bin = acharNext(cwd);
  if (!bin) {
    throw new Error("faltam as dependências dos convites — vá em Configurações e clique em Instalar");
  }

  const porta = await portaLivre();
  // O próprio Electron vira Node: não precisa de node/npm no PATH da GUI.
  const child = spawn(process.execPath, [bin, "dev", "--port", String(porta), "--hostname", "0.0.0.0"], {
    cwd,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      FORCE_COLOR: "0",
      NODE_ENV: "development",
      // O FSEvents não chega até os sites: o Next recompilava uma vez e depois
      // ficava cego, e mudança no convite.json nunca aparecia no preview.
      // Sondar de 600ms custa quase nada num projeto deste tamanho.
      WATCHPACK_POLLING: "600",
      CHOKIDAR_USEPOLLING: "1",
      CHOKIDAR_INTERVAL: "600",
    },
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
  for (const ouvinte of ouvintes) ouvinte();
  return { siteId, url: servidor.url, lan: servidor.lan };
}

export function pararServidor(): void {
  servidor?.child.kill("SIGTERM");
  servidor = null;
  for (const ouvinte of ouvintes) ouvinte();
}

const ouvintes: (() => void)[] = [];

/**
 * O co-op precisa saber quando o preview sobe ou cai pra contar ao convidado.
 * É assinatura e não import de volta porque `coop` já importa daqui — fechar o
 * ciclo deixaria a ordem de avaliação dos módulos decidir quem existe primeiro.
 */
export function aoMudarPreview(ouvinte: () => void): void {
  ouvintes.push(ouvinte);
}

export function estadoPreview(): Servidor | null {
  return servidor ? { siteId: servidor.siteId, url: servidor.url, lan: servidor.lan } : null;
}

/**
 * Prefixos que pertencem ao site em preview. A CSP do app não pode ser carimbada
 * neles: o `next dev` usa eval e HMR, e o nosso `script-src 'self'` mataria o site.
 */
export function origensDoPreview(): string[] {
  if (!servidor) return [];
  const { port } = new URL(servidor.url);
  return [`http://localhost:${port}`, `http://127.0.0.1:${port}`, ...(servidor.lan ? [servidor.lan] : [])];
}

const ANCORA = /^[a-z0-9][a-z0-9-]{0,40}$/;

/**
 * O iframe do preview é cross-origin, e o Chrome ignora navegação por âncora
 * vinda de fora — trava contra sequestro de scroll (medido: 1 de 12 tentativas).
 * Do processo main dá pra entrar no subframe e rolar direto.
 */
export async function rolarPreview(wc: WebContents, ancora: string): Promise<boolean> {
  if (!ANCORA.test(ancora)) throw new Error("âncora inválida");
  const origens = origensDoPreview();
  if (origens.length === 0) return false;
  const frame = wc.mainFrame.framesInSubtree.find(
    (f) => f !== wc.mainFrame && origens.some((o) => f.url.startsWith(o)),
  );
  if (!frame) return false;
  const achou = await frame.executeJavaScript(
    `(() => {
      const alvo = document.getElementById(${JSON.stringify(ancora)});
      if (!alvo) return false;
      alvo.scrollIntoView({ behavior: "smooth", block: "start" });
      return true;
    })()`,
  );
  return achou === true;
}
