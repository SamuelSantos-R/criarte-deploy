import { createServer, type Server } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { readdir, readFile, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { spawn, execFile } from "node:child_process";
import { extname, join, relative } from "node:path";
import { promisify } from "node:util";
import { BrowserWindow } from "electron";
import { acharNext } from "./preview";
import { assertSiteId, requireSitesRoot } from "./paths";
import { siteDirExistente } from "./sites";

const exec = promisify(execFile);

// ============================================================================
// REVISÃO ANTES DE PUBLICAR — o que quebrou o convite do Marcos & Chelsea não
// aparecia no `next dev`: a página do ar é outra coisa, com `basePath` e
// ficheiros já construídos. Aqui constrói-se o site igual ao que a VPS vai
// construir, serve-se na máquina, e é ISSO que ela aprova. Só depois é que o
// deploy acontece.
//
// Além do olho, três perguntas que o olho não faz: falta algum ficheiro que a
// página pede? alguma arte decorativa está por cima do texto? sobrou arte na
// pasta que ninguém usa (o sinal de que o campo ficou com o ficheiro errado)?
// ============================================================================

export type Aviso = {
  tipo: "ficheiro-em-falta" | "arte-por-cima" | "arte-sem-uso";
  /** Grave trava o botão de publicar; o resto é para ela decidir. */
  grave: boolean;
  texto: string;
};

export type Revisao = { url: string; avisos: Aviso[]; largurasVistas: number[] };

const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
  ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".mp4": "video/mp4", ".webm": "video/webm",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml",
};

/** As larguras que importam: telemóvel pequeno, telemóvel grande e tablet. */
const LARGURAS = [375, 414, 768];

let vivo: { servidor: Server; porta: number; pasta: string; faltas: Set<string> } | null = null;

export function origensDaRevisao(): string[] {
  if (!vivo) return [];
  return [`http://localhost:${vivo.porta}`, `http://127.0.0.1:${vivo.porta}`];
}

async function portaLivre(): Promise<number> {
  return new Promise((res, rej) => {
    const s = createServer();
    s.on("error", rej);
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => res(p));
    });
  });
}

/**
 * A cópia onde se constrói. Não se mexe na pasta dela: o `next.config` daqui é
 * o mesmo que a VPS injeta (export estático + basePath), e é essa diferença que
 * faz a página construída não ser a do `next dev`.
 *
 * Fica dentro da raiz dos sites, com ponto à frente: assim o `node_modules`
 * partilhado continua a resolver e a lista de convites não a vê.
 */
async function copiaParaBuild(siteId: string): Promise<string> {
  const origem = await siteDirExistente(siteId);
  const destino = join(requireSitesRoot(), ".revisao", assertSiteId(siteId).replace("/", "-"));
  await rm(destino, { recursive: true, force: true });
  await mkdir(destino, { recursive: true });
  // `cp -Rc` usa clonefile no APFS: a cópia é instantânea e não ocupa disco novo.
  await exec("cp", ["-Rc", `${origem}/.`, destino]).catch(() => exec("cp", ["-R", `${origem}/.`, destino]));
  for (const sobra of ["node_modules", ".next", "out", ".git"]) {
    await rm(join(destino, sobra), { recursive: true, force: true });
  }
  return destino;
}

async function escreverConfig(pasta: string, basePath: string): Promise<void> {
  for (const nome of ["next.config.js", "next.config.mjs", "next.config.ts"]) {
    await rm(join(pasta, nome), { force: true });
  }
  await writeFile(
    join(pasta, "next.config.mjs"),
    `// Escrito pela revisão do Studio: é o mesmo que a VPS injeta na hora de\n` +
      `// construir. Sem o basePath, a revisão mentiria sobre os caminhos.\n` +
      `export default { output: "export", images: { unoptimized: true }, basePath: ${JSON.stringify(basePath)}, trailingSlash: true };\n`,
    "utf8",
  );
}

async function construir(pasta: string, avisar: (linha: string) => void): Promise<void> {
  const bin = acharNext(pasta);
  if (!bin) throw new Error("faltam as dependências dos convites — vá em Configurações e clique em Instalar");
  await new Promise<void>((resolve, reject) => {
    const filho = spawn(process.execPath, [bin, "build"], {
      cwd: pasta,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", CI: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const ler = (b: Buffer): void => b.toString("utf8").split(/\r?\n/).filter(Boolean).forEach(avisar);
    filho.stdout.on("data", ler);
    filho.stderr.on("data", ler);
    filho.on("error", reject);
    filho.on("close", (codigo) =>
      codigo === 0 ? resolve() : reject(new Error("o site não construiu — o erro está no relatório acima")),
    );
  });
}

function servir(pasta: string, basePath: string, porta: number, faltas: Set<string>): Server {
  const servidor = createServer((req, res) => {
    const caminho = decodeURIComponent((req.url ?? "/").split("?")[0]);
    // Fora do basePath é 404 de propósito: no ar, `/assets/x.png` sem o prefixo
    // do site não existe. Servir aqui esconderia exatamente esse engano.
    if (!caminho.startsWith(basePath)) {
      faltas.add(caminho);
      res.statusCode = 404;
      res.end("fora do endereço do site");
      return;
    }
    const semBase = caminho.slice(basePath.length) || "/";
    let ficheiro = join(pasta, semBase);
    if (!ficheiro.startsWith(pasta)) {
      res.statusCode = 403;
      res.end();
      return;
    }
    if (semBase.endsWith("/")) ficheiro = join(ficheiro, "index.html");
    else if (!extname(ficheiro) && existsSync(`${ficheiro}.html`)) ficheiro = `${ficheiro}.html`;
    if (!existsSync(ficheiro)) {
      // A lista de faltas é metade da revisão: é assim que se apanha o ficheiro
      // que a página pede e ninguém publicou.
      faltas.add(caminho);
      res.statusCode = 404;
      res.end("não existe neste build");
      return;
    }
    res.setHeader("content-type", TIPOS[extname(ficheiro).toLowerCase()] ?? "application/octet-stream");
    res.setHeader("cache-control", "no-store");
    createReadStream(ficheiro).pipe(res);
  });
  servidor.listen(porta, "127.0.0.1");
  return servidor;
}

/** O que a página pede e o servidor não tem, já em linguagem de gente. */
function avisosDeFalta(faltas: Set<string>): Aviso[] {
  return [...faltas]
    .filter((f) => !f.includes("/_next/") || /\.(png|jpe?g|webp|svg|gif|mp3|mp4|woff2?|otf|ttf)$/i.test(f))
    .slice(0, 20)
    .map((f) => ({
      tipo: "ficheiro-em-falta" as const,
      grave: true,
      texto: `a página pede ${f.split("/").pop()} e ele não está no site publicado`,
    }));
}

// A conta que apanha a flor por cima do "38 DIAS": arte que não recebe clique
// cobrindo texto ou botão. 25% é onde deixa de ser encosto e passa a ser tapar.
const CONTA_SOBREPOSICAO = `(async () => {
  // Quem está POR CIMA, não quem se cruza. A arte decorativa tem
  // \`pointer-events:none\` e por isso o browser não a devolve no teste de topo;
  // liga-se o clique só durante a medição e é o próprio browser que diz a ordem
  // de pintura. Sem isto, a foto de fundo do hero acusava por baixo dos nomes.
  const achados = new Map();
  const medir = () => {
    const decor = [...document.querySelectorAll('img,svg')].filter((e) => getComputedStyle(e).pointerEvents === 'none');
    const antes = decor.map((e) => e.style.pointerEvents);
    decor.forEach((e) => (e.style.pointerEvents = 'auto'));
    const conteudo = [...document.querySelectorAll('a,button,h1,h2,h3,p,span,li')].filter(
      (e) => (e.innerText || '').trim().length > 0 && e.children.length === 0,
    );
    for (const d of decor) {
      const rd = d.getBoundingClientRect();
      if (rd.width * rd.height === 0 || rd.bottom < 0 || rd.top > innerHeight) continue;
      for (const c of conteudo) {
        const rc = c.getBoundingClientRect();
        if (rc.width * rc.height === 0 || rc.bottom < 0 || rc.top > innerHeight) continue;
        if (rc.right < rd.left || rc.left > rd.right || rc.bottom < rd.top || rc.top > rd.bottom) continue;
        let dentro = 0, tapados = 0;
        for (let i = 1; i <= 4; i++) for (let j = 1; j <= 4; j++) {
          const x = rc.left + (rc.width * i) / 5, y = rc.top + (rc.height * j) / 5;
          if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
          dentro++;
          const topo = document.elementFromPoint(x, y);
          if (topo === d || d.contains(topo)) tapados++;
        }
        const pct = dentro ? Math.round((tapados / dentro) * 100) : 0;
        if (pct >= 25) {
          const arte = (d.currentSrc || d.src || 'desenho').split('/').pop().split('?')[0];
          const texto = c.innerText.trim().slice(0, 30);
          achados.set(arte + '|' + texto, { arte, texto, pct });
        }
      }
    }
    decor.forEach((e, i) => (e.style.pointerEvents = antes[i]));
  };
  // O convite inteiro, de cima a baixo: o que tapa o contador está a meio.
  for (let y = 0; y <= document.body.scrollHeight; y += Math.round(innerHeight * 0.8)) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 650));
    medir();
  }
  window.scrollTo(0, 0);
  return [...achados.values()];
})()`;

async function olharEmCadaLargura(url: string, avisar: (linha: string) => void): Promise<Aviso[]> {
  const achados = new Map<string, Aviso>();
  for (const largura of LARGURAS) {
    avisar(`· a olhar a ${largura}px…`);
    const janela = new BrowserWindow({
      show: false,
      width: largura,
      height: 900,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true },
    });
    try {
      await janela.loadURL(url);
      // Entrada animada: medir antes do fim dá sobreposição que não existe.
      await new Promise((r) => setTimeout(r, 2500));
      const casos = (await janela.webContents.executeJavaScript(CONTA_SOBREPOSICAO)) as {
        arte: string;
        texto: string;
        pct: number;
      }[];
      for (const c of casos) {
        achados.set(`${c.arte}|${c.texto}`, {
          tipo: "arte-por-cima",
          grave: c.pct >= 60,
          texto: `a ${largura}px, ${c.arte} cobre ${c.pct}% de «${c.texto}»`,
        });
      }
    } finally {
      janela.destroy();
    }
  }
  return [...achados.values()];
}

/** Arte que está na pasta e nenhuma página usa — o sinal do ficheiro trocado. */
async function arteSemUso(pastaBuild: string): Promise<Aviso[]> {
  const assets = join(pastaBuild, "public", "assets");
  if (!existsSync(assets)) return [];
  const out = join(pastaBuild, "out");
  let texto = "";
  const juntar = async (dir: string): Promise<void> => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await juntar(p);
      else if (/\.(html|js|css|json|txt)$/i.test(e.name)) texto += await readFile(p, "utf8");
    }
  };
  if (existsSync(out)) await juntar(out);
  const avisos: Aviso[] = [];
  for (const e of await readdir(assets, { withFileTypes: true })) {
    if (!e.isFile() || e.name.startsWith(".")) continue;
    const semExt = e.name.replace(/\.[^.]+$/, "");
    // Compara sem extensão: o deploy pode ter trocado o .png por .webp.
    if (texto.includes(e.name) || texto.includes(semExt)) continue;
    const bytes = (await stat(join(assets, e.name))).size;
    if (bytes < 2048) continue;
    avisos.push({
      tipo: "arte-sem-uso",
      grave: false,
      texto: `${e.name} está na pasta e nenhuma página o usa — o campo ficou com outro ficheiro?`,
    });
  }
  return avisos.slice(0, 10);
}

export async function abrirRevisao(siteId: string, avisar: (linha: string) => void): Promise<Revisao> {
  await fecharRevisao();
  const [categoria, slug] = assertSiteId(siteId).split("/");
  const basePath = `/${categoria}/${slug}`;

  avisar("· a copiar o site para construir à parte…");
  const pasta = await copiaParaBuild(siteId);
  await escreverConfig(pasta, basePath);

  avisar("· a construir como a VPS constrói (pode demorar)…");
  await construir(pasta, avisar);

  const out = join(pasta, "out");
  if (!existsSync(join(out, "index.html"))) throw new Error("o build não deixou página nenhuma em out/");

  const porta = await portaLivre();
  const faltas = new Set<string>();
  vivo = { servidor: servir(out, basePath, porta, faltas), porta, pasta, faltas };
  const url = `http://127.0.0.1:${porta}${basePath}/`;

  const avisos = [...(await olharEmCadaLargura(url, avisar)), ...(await arteSemUso(pasta))];
  avisos.push(...avisosDeFalta(faltas));
  avisar(avisos.length === 0 ? "· nada a apontar. É ver com os olhos." : `· ${avisos.length} coisa(s) a apontar.`);
  return { url, avisos, largurasVistas: LARGURAS };
}

/** Mata o servidor da revisão. É o que corre antes de publicar a sério. */
export async function fecharRevisao(): Promise<void> {
  if (!vivo) return;
  const { servidor, pasta } = vivo;
  vivo = null;
  await new Promise<void>((r) => servidor.close(() => r()));
  await rm(pasta, { recursive: true, force: true }).catch(() => undefined);
}

export function relativoAoSite(pasta: string, ficheiro: string): string {
  return relative(pasta, ficheiro);
}
