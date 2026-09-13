import { type WebContents } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { networkInterfaces } from "node:os";
import { createSocket } from "node:dgram";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { siteDir } from "./sites";
import { urlDoEspelho } from "./espelho";

export type Servidor = { siteId: string; url: string; lan: string | null };

let servidor: (Servidor & { child: ChildProcess }) | null = null;

/**
 * `169.254.*` é APIPA (sem DHCP) e `feth/bridge/utun/awdl` são interfaces
 * virtuais: todas respondem HTTP no próprio Mac e enganam o teste, mas o
 * celular nunca alcança. O que sobra é o IP que dá pra ler no QR.
 */
export function ipsDaRede(): string[] {
  const ips: string[] = [];
  for (const [nome, addrs] of Object.entries(networkInterfaces())) {
    if (/^(feth|bridge|utun|awdl|llw|ap\d)/.test(nome)) continue;
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" || a.internal) continue;
      if (a.address.startsWith("169.254.")) continue;
      ips.push(a.address);
    }
  }
  return ips;
}

export function ipDaRede(): string | null {
  return ipsDaRede()[0] ?? null;
}

/**
 * O IP da placa por onde o Mac sai de facto. "A primeira placa da lista" não é
 * isso: com adaptador, VPN ou segunda rede, a primeira pode ser uma que ninguém
 * da casa alcança. `connect` em UDP só consulta a tabela de rotas — não sai
 * pacote nenhum. Sem rota (rede sem internet) cai na primeira placa.
 */
export function ipDaRotaPadrao(): Promise<string | null> {
  return new Promise((resolve) => {
    const s = createSocket("udp4");
    const fim = (ip: string | null): void => {
      s.close();
      resolve(ip && ipsDaRede().includes(ip) ? ip : ipDaRede());
    };
    s.once("error", () => fim(null));
    s.connect(53, "1.1.1.1", () => {
      try {
        fim(s.address().address);
      } catch {
        fim(null);
      }
    });
  });
}

/**
 * O `next` não mora mais dentro de cada convite: há um `node_modules` só, na
 * raiz de sites, e todos comem de lá. Subir as pastas é o mesmo que o Node faz
 * pra resolver um import — assim um convite recém-criado abre no preview sem
 * ninguém precisar de terminal.
 */
export function acharNext(desde: string): string | null {
  for (let dir = desde; ; ) {
    const bin = join(dir, "node_modules", "next", "dist", "bin", "next");
    if (existsSync(bin)) return bin;
    const acima = dirname(dir);
    if (acima === dir) return null;
    dir = acima;
  }
}

function livre(porta: number): Promise<boolean> {
  return new Promise((res) => {
    const s = createServer();
    s.on("error", () => res(false));
    s.listen(porta, "0.0.0.0", () => s.close(() => res(true)));
  });
}

/**
 * Sempre a mesma porta, e não uma efémera ao acaso. Com porta nova a cada
 * arranque, o QR lido ontem e o separador que ficou aberto no telemóvel apontam
 * para uma porta que já não existe — dá "o servidor não responde", que parece
 * bloqueio de rede e não é. Fixa, o mesmo endereço serve sempre, e ainda dá para
 * escrever à mão. Se estiver ocupada anda uma casa, até desistir e pedir uma
 * qualquer ao sistema.
 */
const PORTA_BASE = 4321;

async function portaLivre(): Promise<number> {
  for (let p = PORTA_BASE; p < PORTA_BASE + 8; p++) if (await livre(p)) return p;
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
  // Ponto de partida do repinte: sem esta leitura a primeira gravação achava
  // que a página tinha mudado e recarregava com o conteúdo ainda velho.
  assinatura = await assinaturaServida(url, AbortSignal.timeout(20_000));
  for (const ouvinte of ouvintes) ouvinte();
  return { siteId, url: servidor.url, lan: servidor.lan };
}

export function pararServidor(): void {
  servidor?.child.kill("SIGTERM");
  servidor = null;
  espera?.abort();
  espera = null;
  assinatura = null;
  ultimoDoc = null;
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

const TIQUE_MS = 250;
const ESPERA_MAX_MS = 15_000;

/**
 * Assinatura da página que o preview já está a mostrar. O `?v=<timestamp>` que o
 * `next dev` carimba nos scripts muda a cada pedido — sem o tirar, duas leituras
 * seguidas da mesma página dão hashes diferentes (medido) e nada disto funciona.
 */
let assinatura: string | null = null;
let espera: AbortController | null = null;

async function assinaturaServida(url: string, sinal: AbortSignal): Promise<string | null> {
  const r = await fetch(url, { signal: sinal, headers: { "cache-control": "no-cache" } }).catch(
    () => null,
  );
  if (!r?.ok) return null;
  const html = await r.text().catch(() => null);
  if (html === null) return null;
  return createHash("sha1").update(html.replace(/\?v=\d+/g, "")).digest("hex");
}

function acharFrame(
  wc: WebContents,
  origens: string[],
): ReturnType<typeof wc.mainFrame.framesInSubtree.find> {
  if (origens.length === 0) return undefined;
  return wc.mainFrame.framesInSubtree.find(
    (f) => f !== wc.mainFrame && origens.some((o) => f.url.startsWith(o)),
  );
}

function frameDoPreview(wc: WebContents): ReturnType<typeof wc.mainFrame.framesInSubtree.find> {
  return acharFrame(wc, origensDoPreview());
}

/**
 * O convidado da coop não tem servidor nenhum: vê o preview do anfitrião pelo
 * espelho, em `127.0.0.1`. Para pintar tanto faz de quem é o `next dev` do outro
 * lado — o que interessa é o quadro que está mesmo na janela.
 */
function frameDoQuadro(wc: WebContents): ReturnType<typeof wc.mainFrame.framesInSubtree.find> {
  const espelho = urlDoEspelho();
  return acharFrame(wc, [...origensDoPreview(), ...(espelho ? [espelho] : [])]);
}

/**
 * Recarrega o preview quando — e só quando — o servidor já está a servir a
 * alteração. O HMR não propaga a mudança do convite.json (20s de observação e a
 * página aberta nunca repinta), mas recarregar na hora da gravação também não
 * servia: medido, o `next dev` demora ~2,9s a recompilar, e o reload no meio da
 * recompilação apanhava chunks a meio de serem reescritos — daí a página em
 * branco e sem texto que só um reload à mão resolvia.
 *
 * Então sonda-se a página servida até a assinatura mudar, e só aí se recarrega:
 * uma vez, com o conteúdo novo garantido. Alteração que não muda o HTML não
 * recarrega nada — é o que tira o pisca-pisca.
 *
 * Recarregar por dentro do frame, e não trocando a `key` do elemento no React,
 * mantém a posição do scroll e evita o branco de montar um iframe do zero.
 */
export async function repintarPreview(wc: WebContents, doc?: unknown): Promise<boolean> {
  const alvo = servidor;
  if (!alvo || !frameDoPreview(wc)) return false;

  // Cor e medida já foram pintadas por fora; se foi só isso que mudou, o reload
  // seria o pisca-pisca por nada. A assinatura tem de ser acertada na mesma:
  // ela mudou (o `<html>` traz o tema inline), e deixá-la velha faria a próxima
  // edição de texto recarregar de imediato, ainda a meio da recompilação — a
  // página em branco que este ficheiro já teve uma vez.
  const soPintura = doc !== undefined && ultimoDoc !== null && semVars(doc) === semVars(ultimoDoc);
  if (doc !== undefined) ultimoDoc = doc;

  // Tecla nova enquanto a anterior ainda espera: fica a última. Sem isto uma
  // frase digitada devagar enfileirava um reload por pausa.
  espera?.abort();
  const meu = new AbortController();
  espera = meu;

  const limite = Date.now() + ESPERA_MAX_MS;
  while (Date.now() < limite && !meu.signal.aborted) {
    const agora = await assinaturaServida(alvo.url, meu.signal);
    if (agora && agora !== assinatura) {
      assinatura = agora;
      if (espera === meu) espera = null;
      if (soPintura) return true;
      const frame = frameDoPreview(wc);
      if (!frame) return false;
      await frame.executeJavaScript("location.reload()");
      return true;
    }
    await new Promise((r) => setTimeout(r, TIQUE_MS));
  }
  if (espera === meu) espera = null;
  return false;
}

/** Último convite pintado, para saber o que mudou desde então. */
let ultimoDoc: unknown = null;

/**
 * O convite sem nada do que é só variável CSS, em texto comparável.
 *
 * Chaves ordenadas porque a comparação é entre dois JSON e a ordem em que o
 * editor as escreve não é promessa nenhuma. `noivosFonte` fica de fora da
 * amnistia: a var aponta para um `@font-face` que o layout emite a partir da
 * pasta, e uma fonte acabada de instalar só existe depois de recompilar —
 * pintar sem recarregar dava Georgia calado.
 */
/** Lista, não filtro ao contrário: uma medida nova que ninguém pintou cai aqui de
 *  fora e volta a recarregar, que é o comportamento certo enquanto não tiver var. */
const PINTADAS = [
  "espacos",
  "manualIconeOpacidade",
  "musicaBarraOpacidade",
  "musicaBaseOpacidade",
  "musicaEqualizadorOpacidade",
  "monogramaAltura",
  "monogramaTopo",
  "monogramaFolga",
  "paisTamanho",
  "versiculoTamanho",
  "noivosTamanho",
  "noivaEspacamento",
  "noivoEspacamento",
  "eEspacamento",
  "noivosAltura",
  "countdownDataTamanho",
  "rodapeTamanho",
  "rodapeAltura",
  "rodapeEspacamento",
  "rodapeDataTamanho",
  "rodapeDataEspacamento",
  "rodapeTopo",
  "rodapeBase",
  "vasoLargura",
];

function semVars(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const c = { ...(doc as Record<string, unknown>) };
  delete c.tema;
  const medidas = c.medidas as Record<string, unknown> | undefined;
  if (medidas && typeof medidas === "object") {
    const resto = { ...medidas };
    for (const k of PINTADAS) delete resto[k];
    c.medidas = resto;
  }
  const orn = c.ornamentos as Record<string, unknown> | undefined;
  if (orn && typeof orn === "object") {
    const resto = { ...orn };
    delete resto.tamanho;
    delete resto.deslocamento;
    delete resto.deslocamentos;
    c.ornamentos = resto;
  }
  return estavel(c);
}

function estavel(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(estavel).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${estavel(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

/**
 * Escreve as custom properties do convite direto no `<html>` do quadro, sem
 * passar pelo disco nem pelo compilador. Quem faz a conta é o próprio site (o
 * `varsDe` que o build também usa), então o que se vê ao vivo é o que vai sair.
 *
 * Devolve quantas vars foram postas — `0` quer dizer que aquele convite ainda
 * não tem o pincel (site antigo, ou build de produção), e aí quem chamou volta
 * ao caminho de recarregar.
 */
export async function pintarPreview(wc: WebContents, doc: unknown): Promise<number> {
  const frame = frameDoQuadro(wc);
  if (!frame) return 0;
  // Passa como texto e é o próprio quadro que faz o parse: assim nada do convite
  // é interpretado como código, por mais estranho que venha no json.
  const carga = JSON.stringify(JSON.stringify(doc));
  const posto = await frame
    .executeJavaScript(
      `(() => (typeof window.__crPintar === "function" ? window.__crPintar(JSON.parse(${carga})) : 0))()`,
    )
    .catch(() => 0);
  return typeof posto === "number" ? posto : 0;
}

/** Botão de recarregar: é ordem direta, não espera por assinatura nenhuma. */
export async function forcarRepinte(wc: WebContents): Promise<boolean> {
  espera?.abort();
  espera = null;
  const frame = frameDoPreview(wc);
  if (!frame) return false;
  if (servidor) assinatura = await assinaturaServida(servidor.url, AbortSignal.timeout(4000));
  await frame.executeJavaScript("location.reload()");
  return true;
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
