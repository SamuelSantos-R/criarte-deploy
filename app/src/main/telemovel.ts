import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { createServer as criarSocket, type Socket } from "node:net";
import { extname, join, resolve, sep } from "node:path";
import { acharNext, ipDaRede } from "./preview";
import { siteDir } from "./sites";

export type Espelho = { siteId: string; lan: string | null; url: string; feito: number };

/**
 * O convite no telemóvel, servido como estático.
 *
 * O `next dev` entrega ~12 MB de JavaScript não-minificado (medido: 6,0 MB de
 * `main-app.js` mais 5,4 MB de `page.js`). No Mac isso passa; no Safari do
 * iPhone o processo da página é morto e aparece «ocorreu um problema
 * repetidamente» — o que parece bloqueio de rede e não é. Um build dos mesmos
 * ecrãs dá ~850 KB.
 *
 * Por isso o telemóvel não vê o dev server: vê esta cópia construída. O
 * `next dev` do Mac fica exatamente como estava — quem edita continua a ter o
 * repinte instantâneo, e o telemóvel serve para conferir o resultado.
 *
 * O build sai para `.next-espelho` (ver `CR_ESPELHO` no `next.config.js` dos
 * convites) justamente para não pisar o `.next` do dev server a correr ao lado.
 */
let atual: (Espelho & { server: Server; sockets: Set<Socket>; raiz: string }) | null = null;

/** Longe da faixa do dev server (4321 + 8), para os dois nunca disputarem porta. */
const PORTA_BASE = 4331;

function livre(porta: number): Promise<boolean> {
  return new Promise((res) => {
    const s = criarSocket();
    s.on("error", () => res(false));
    s.listen(porta, "0.0.0.0", () => s.close(() => res(true)));
  });
}

async function portaLivre(): Promise<number> {
  for (let p = PORTA_BASE; p < PORTA_BASE + 8; p++) if (await livre(p)) return p;
  throw new Error("não há porta livre para o espelho do telemóvel");
}

const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

/**
 * Caminho pedido resolvido dentro da raiz, ou `null`.
 *
 * O servidor está aberto à rede local, então `..` no pedido não pode sair da
 * pasta do build — sem esta verificação um `GET /../../../etc/passwd` servia o
 * disco todo a quem estivesse na mesma Wi-Fi.
 */
function dentro(raiz: string, pedido: string): string | null {
  let caminho: string;
  try {
    caminho = decodeURIComponent(new URL(pedido, "http://x").pathname);
  } catch {
    return null;
  }
  if (caminho.includes("\0")) return null;
  const alvo = resolve(join(raiz, caminho));
  return alvo === raiz || alvo.startsWith(raiz + sep) ? alvo : null;
}

async function ficheiro(alvo: string): Promise<string | null> {
  // O export escreve `sobre/index.html` para a rota `/sobre`; a barra final no
  // pedido é opcional, daí tentar as duas formas antes de desistir.
  for (const tentativa of [alvo, `${alvo}.html`, join(alvo, "index.html")]) {
    const s = await stat(tentativa).catch(() => null);
    if (s?.isFile()) return tentativa;
  }
  return null;
}

function servir(raiz: string): Server {
  return createServer((req, res) => {
    void (async () => {
      const alvo = req.url ? dentro(raiz, req.url) : null;
      const achado = alvo ? await ficheiro(alvo) : null;
      if (!achado) {
        const naoEncontrado = await ficheiro(join(raiz, "404.html"));
        res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
        if (naoEncontrado) return createReadStream(naoEncontrado).pipe(res);
        return res.end("não encontrado");
      }
      res.writeHead(200, {
        "content-type": TIPOS[extname(achado).toLowerCase()] ?? "application/octet-stream",
        // É uma cópia de conferência: recarregar tem de mostrar o build novo,
        // e não o que o Safari guardou da vez anterior.
        "cache-control": "no-store",
      });
      createReadStream(achado).pipe(res);
    })();
  });
}

/**
 * Constrói o convite e põe-no no ar. `aoFalar` recebe as linhas do `next build`
 * para a janela poder mostrar em que passo é que aquilo está — são ~35 a 80
 * segundos, tempo demais para um botão calado.
 */
export async function construirEspelho(
  siteId: string,
  aoFalar: (linha: string) => void,
): Promise<Espelho> {
  const cwd = await siteDir(siteId);
  const bin = acharNext(cwd);
  if (!bin) {
    throw new Error("faltam as dependências dos convites — vá em Configurações e clique em Instalar");
  }

  const child = spawn(process.execPath, [bin, "build"], {
    cwd,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      FORCE_COLOR: "0",
      NODE_ENV: "production",
      CR_ESPELHO: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let saida = "";
  const olhar = (c: Buffer): void => {
    const texto = c.toString();
    saida += texto;
    for (const linha of texto.split("\n")) {
      const limpa = linha.trim();
      if (limpa) aoFalar(limpa);
    }
  };
  child.stdout?.on("data", olhar);
  child.stderr?.on("data", olhar);

  const codigo = await new Promise<number>((res, rej) => {
    child.on("close", (c) => res(c ?? 1));
    child.on("error", rej);
  });
  if (codigo !== 0) throw new Error(`o build falhou (${codigo})\n${saida.slice(-800)}`);

  const raiz = resolve(join(cwd, ".next-espelho"));
  const s = await stat(join(raiz, "index.html")).catch(() => null);
  if (!s?.isFile()) throw new Error("o build terminou mas não escreveu a página — veja o registo");

  // Só agora se derruba o anterior: se o build falhasse, o espelho que já estava
  // no ar continuava a servir, em vez de deixar o telemóvel sem nada.
  pararEspelho();

  const porta = await portaLivre();
  const server = servir(raiz);
  const sockets = new Set<Socket>();
  server.on("connection", (sock) => {
    sockets.add(sock);
    sock.on("close", () => sockets.delete(sock));
  });

  await new Promise<void>((res, rej) => {
    server.on("error", rej);
    server.listen(porta, "0.0.0.0", () => res());
  });

  const ip = ipDaRede();
  atual = {
    siteId,
    url: `http://localhost:${porta}`,
    lan: ip ? `http://${ip}:${porta}` : null,
    feito: Date.now(),
    server,
    sockets,
    raiz,
  };
  return estadoEspelho() as Espelho;
}

export function pararEspelho(): void {
  if (!atual) return;
  for (const s of atual.sockets) s.destroy();
  atual.server.close();
  atual = null;
}

export function estadoEspelho(): Espelho | null {
  if (!atual) return null;
  const { siteId, url, lan, feito } = atual;
  return { siteId, url, lan, feito };
}
