import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { BrowserWindow } from "electron";
import { copiavel, empacotar } from "./pacote";
import { aoMudarPreview, estadoPreview, ipDaRede } from "./preview";
import { ligarEspelho, pararEspelho, urlDoEspelho } from "./espelho";
import { readConvite, siteDir, writeConvite } from "./sites";
import { listarFontes, type Fonte } from "./fontes";
import { arquivosDe, gravarAsset, importAssets, type AssetImportado } from "./assets";

/**
 * Co-op na LAN: um Studio vira anfitrião e serve o convite por SSE; o outro
 * entra com um código de 6 dígitos. Só o anfitrião escreve em disco, então
 * nunca há dois processos gravando o mesmo convite.json.
 */

const PORTA = 7412;
const TRANCA_MS = 30_000;
const GRAVA_MS = 400;
const TENTATIVAS_MAX = 10;
const CASTIGO_MS = 5 * 60_000;
const CORPO_MAX = 512 * 1024;
// Patch é texto curto; asset é uma foto. O limite do corpo tem de ser outro,
// senão a primeira imagem que a convidada arrasta bate na parede do JSON.
const ASSET_MAX = 300 * 1024 * 1024;

export type Patch = { caminho: (string | number)[]; valor: unknown };
export type Tranca = { secao: string; nome: string };
export type EstadoCoop = {
  papel: "anfitriao" | "convidado" | null;
  siteId: string | null;
  endereco: string | null;
  codigo: string | null;
  pares: string[];
  trancas: Tranca[];
  /** Preview do outro lado, pronto pro iframe. Só o convidado tem — o anfitrião vê o seu. */
  aoVivo: string | null;
  erro: string | null;
};

type Par = { id: string; nome: string; res: ServerResponse };

let anfitriao: {
  server: Server;
  siteId: string;
  codigo: string;
  endereco: string;
  doc: Record<string, unknown>;
  marca: number | null;
  pares: Map<string, Par>;
  trancas: Map<string, { dono: string; nome: string; expira: number }>;
  gravacao: NodeJS.Timeout | null;
  faltas: Map<string, { n: number; ate: number }>;
} | null = null;

let convidado: {
  siteId: string;
  endereco: string;
  nome: string;
  parar: AbortController;
  /** Porta do `next dev` do anfitrião. Nula quer dizer: lá o preview está desligado. */
  portaAoVivo: number | null;
  /** Banco de fontes do anfitrião. Só nomes: quem instala fonte é ele. */
  fontes: Fonte[];
} | null = null;

/** Cabeçalhos do convidado. O `x-coop-par` só é preenchido quando o `bemvindo` chega. */
let cabecalhoAtual: Record<string, string> | null = null;

// ---------------------------------------------------------------- utilidades

/** Clona só o galho que mudou — igual ao `setIn` do formulário no renderer. */
function setIn(alvo: unknown, caminho: (string | number)[], valor: unknown): unknown {
  if (caminho.length === 0) return valor;
  const [chave, ...resto] = caminho;
  if (Array.isArray(alvo)) {
    const copia = alvo.slice();
    copia[Number(chave)] = setIn(copia[Number(chave)], resto, valor);
    return copia;
  }
  const obj = (alvo ?? {}) as Record<string, unknown>;
  return { ...obj, [String(chave)]: setIn(obj[String(chave)], resto, valor) };
}

/** Comparação de tempo fixo: sem isto o código de 6 dígitos cai por timing. */
function mesmoCodigo(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Vem da rede: só passa porta alta inteira, que é onde o `next dev` nasce. */
function portaValida(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 1024 && v <= 65535 ? v : null;
}

/**
 * A lista vem da rede e vai parar num radio do formulário: fica só o que tem a
 * cara de uma chave de fonte, e o nome é cortado pra não esticar o painel.
 */
function fontesValidas(v: unknown): Fonte[] {
  if (!Array.isArray(v)) return [];
  const lista: Fonte[] = [];
  for (const f of v.slice(0, 200)) {
    if (!f || typeof f !== "object") continue;
    const { chave, nome, ficheiro, bytes } = f as Record<string, unknown>;
    if (typeof chave !== "string" || !/^[a-z0-9-]{1,64}$/.test(chave)) continue;
    lista.push({
      chave,
      nome: typeof nome === "string" ? nome.slice(0, 64) : chave,
      ficheiro: typeof ficheiro === "string" ? ficheiro.slice(0, 128) : "",
      bytes: typeof bytes === "number" && Number.isFinite(bytes) ? bytes : 0,
    });
  }
  return lista;
}

/** Fontes do anfitrião, quando este Studio é convidado. `null` = usar o banco local. */
export function fontesDaSessao(): Fonte[] | null {
  return convidado ? convidado.fontes : null;
}

function caminhoValido(v: unknown): v is (string | number)[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.length <= 12 &&
    v.every((p) => (typeof p === "string" && p.length <= 64) || (typeof p === "number" && p >= 0))
  );
}

function emitir(canal: string, carga: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(canal, carga);
}

/**
 * Só a porta viaja. O convidado remonta o endereço com o IP que ele próprio
 * digitou pra entrar: assim um anfitrião de má fé não consegue apontar o iframe
 * do outro Studio pra uma origem qualquer.
 */
function portaAoVivoDoAnfitriao(): number | null {
  const s = estadoPreview();
  if (!anfitriao || !s || s.siteId !== anfitriao.siteId) return null;
  return Number(new URL(s.url).port) || null;
}

/**
 * Sobe (ou derruba) o espelho conforme o anfitrião ligou ou parou o preview. O
 * que vai pro renderer é sempre o endereço local do espelho, nunca o da rede.
 */
async function acertarEspelho(): Promise<void> {
  const porta = convidado?.portaAoVivo;
  if (!porta) {
    pararEspelho();
    return;
  }
  const ip = convidado?.endereco.split(":")[0];
  await ligarEspelho(`http://${ip}:${porta}`).catch(() => pararEspelho());
}

export function estadoCoop(): EstadoCoop {
  if (anfitriao) {
    limparTrancas();
    return {
      papel: "anfitriao",
      siteId: anfitriao.siteId,
      endereco: anfitriao.endereco,
      codigo: anfitriao.codigo,
      pares: [...anfitriao.pares.values()].map((p) => p.nome),
      trancas: [...anfitriao.trancas.entries()].map(([secao, t]) => ({ secao, nome: t.nome })),
      aoVivo: null,
      erro: null,
    };
  }
  if (convidado) {
    return {
      papel: "convidado",
      siteId: convidado.siteId,
      endereco: convidado.endereco,
      codigo: null,
      pares: [],
      trancas: [],
      aoVivo: urlDoEspelho(),
      erro: null,
    };
  }
  return {
    papel: null,
    siteId: null,
    endereco: null,
    codigo: null,
    pares: [],
    trancas: [],
    aoVivo: null,
    erro: null,
  };
}

function avisarEstado(): void {
  emitir("coop:estado", estadoCoop());
}

// Ligar ou parar o preview é notícia pra quem está na mesa: é o que faz o painel
// ao vivo do convidado acender sozinho, sem ele ter a pasta do site.
aoMudarPreview(() => {
  if (!anfitriao) return;
  difundir("aovivo", { porta: portaAoVivoDoAnfitriao() });
});

// ------------------------------------------------------------------ anfitrião

function limparTrancas(): void {
  if (!anfitriao) return;
  const agora = Date.now();
  let mudou = false;
  for (const [secao, t] of anfitriao.trancas) {
    if (t.expira <= agora) {
      anfitriao.trancas.delete(secao);
      mudou = true;
    }
  }
  if (mudou) difundir("trancas", { trancas: estadoCoop().trancas });
}

function difundir(evento: string, carga: unknown, excetoId?: string): void {
  if (!anfitriao) return;
  const linha = `event: ${evento}\ndata: ${JSON.stringify(carga)}\n\n`;
  for (const par of anfitriao.pares.values()) {
    if (par.id === excetoId) continue;
    par.res.write(linha);
  }
}

/**
 * Grava agrupado: uma tecla digitada não vale uma ida ao disco. A `marca` do
 * mtime segue valendo — se alguém mexeu no ficheiro por fora, o anfitrião relê
 * e reenvia o documento inteiro em vez de apagar o trabalho do outro.
 */
function agendarGravacao(): void {
  if (!anfitriao || anfitriao.gravacao) return;
  anfitriao.gravacao = setTimeout(() => {
    if (!anfitriao) return;
    anfitriao.gravacao = null;
    const { siteId, doc, marca } = anfitriao;
    void writeConvite(siteId, doc, marca ?? undefined)
      .then(async (r) => {
        if (!anfitriao || anfitriao.siteId !== siteId) return;
        if (!r.conflito) {
          anfitriao.marca = r.marca;
          return;
        }
        const fresco = await readConvite(siteId);
        if (!anfitriao || anfitriao.siteId !== siteId) return;
        anfitriao.doc = fresco.dados as Record<string, unknown>;
        anfitriao.marca = fresco.marca;
        difundir("cheio", { doc: anfitriao.doc });
        emitir("coop:cheio", { doc: anfitriao.doc });
      })
      .catch(() => {});
  }, GRAVA_MS);
}

function recusar(res: ServerResponse, codigo: number, motivo: string): void {
  res.writeHead(codigo, { "content-type": "application/json" });
  res.end(JSON.stringify({ erro: motivo }));
}

/** Trava por IP: 6 dígitos são poucos pra quem pode tentar à vontade na LAN. */
function emCastigo(ip: string): boolean {
  if (!anfitriao) return true;
  const f = anfitriao.faltas.get(ip);
  if (!f) return false;
  if (Date.now() > f.ate) {
    anfitriao.faltas.delete(ip);
    return false;
  }
  return f.n >= TENTATIVAS_MAX;
}

function errou(ip: string): void {
  if (!anfitriao) return;
  const f = anfitriao.faltas.get(ip) ?? { n: 0, ate: 0 };
  anfitriao.faltas.set(ip, { n: f.n + 1, ate: Date.now() + CASTIGO_MS });
}

function lerCorpo(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let bruto = "";
    req.on("data", (c: Buffer) => {
      bruto += c;
      if (bruto.length > CORPO_MAX) {
        reject(new Error("corpo grande demais"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(bruto || "{}"));
      } catch {
        reject(new Error("json inválido"));
      }
    });
    req.on("error", reject);
  });
}

function lerBytes(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pedacos: Buffer[] = [];
    let total = 0;
    req.on("data", (c: Buffer) => {
      total += c.byteLength;
      if (total > ASSET_MAX) {
        reject(new Error("ficheiro grande demais"));
        req.destroy();
        return;
      }
      pedacos.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(pedacos)));
    req.on("error", reject);
  });
}

async function atender(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!anfitriao) return recusar(res, 503, "sessão encerrada");
  const ip = req.socket.remoteAddress ?? "?";
  if (emCastigo(ip)) return recusar(res, 429, "muitas tentativas");

  const url = new URL(req.url ?? "/", "http://interno");
  const codigo = url.searchParams.get("codigo") ?? req.headers["x-coop-codigo"];
  if (typeof codigo !== "string" || !mesmoCodigo(codigo, anfitriao.codigo)) {
    errou(ip);
    return recusar(res, 401, "código errado");
  }
  anfitriao.faltas.delete(ip);

  if (req.method === "GET" && url.pathname === "/entrar") {
    const nome = (url.searchParams.get("nome") ?? "convidado").slice(0, 40);
    const par: Par = { id: randomUUID(), nome, res };
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    // O banco de fontes vai junto: o convidado escolhe pelo nome, mas o ficheiro
    // fica do lado do anfitrião — é ele quem instala e quem grava o convite.
    const fontes = await listarFontes().catch(() => []);
    res.write(
      `event: bemvindo\ndata: ${JSON.stringify({ parId: par.id, siteId: anfitriao.siteId, doc: anfitriao.doc, porta: portaAoVivoDoAnfitriao(), fontes })}\n\n`,
    );
    anfitriao.pares.set(par.id, par);
    avisarEstado();
    difundir("trancas", { trancas: estadoCoop().trancas });
    req.on("close", () => {
      if (!anfitriao) return;
      anfitriao.pares.delete(par.id);
      for (const [secao, t] of anfitriao.trancas) {
        if (t.dono === par.id) anfitriao.trancas.delete(secao);
      }
      difundir("trancas", { trancas: estadoCoop().trancas });
      avisarEstado();
    });
    return;
  }

  // Mandar o source inteiro é caro e só faz sentido pra quem já está na mesa:
  // exige o par, não só o código.
  if (req.method === "GET" && url.pathname === "/fonte") {
    if (!anfitriao.pares.has(String(req.headers["x-coop-par"] ?? ""))) {
      return recusar(res, 403, "entre primeiro");
    }
    const raiz = await siteDir(anfitriao.siteId);
    const pacote = await empacotar(raiz, (p) => copiavel(p, raiz));
    res.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-length": String(pacote.byteLength),
    });
    res.end(pacote);
    return;
  }

  if (req.method !== "POST") return recusar(res, 404, "não existe");
  const parId = String(req.headers["x-coop-par"] ?? "");
  const par = anfitriao.pares.get(parId);
  if (!par) return recusar(res, 403, "entre primeiro");

  // Bytes crus, não JSON: uma foto em base64 dentro de um `JSON.parse` custa
  // memória à toa e o nome do ficheiro cabe num cabeçalho.
  if (url.pathname === "/asset") {
    const nome = String(req.headers["x-coop-nome"] ?? "").slice(0, 200);
    if (!nome) return recusar(res, 400, "sem nome de ficheiro");
    let bytes: Buffer;
    try {
      bytes = await lerBytes(req);
    } catch (e) {
      return recusar(res, 413, e instanceof Error ? e.message : "corpo inválido");
    }
    try {
      const asset = await gravarAsset(anfitriao.siteId, nome, bytes);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(asset));
    } catch (e) {
      recusar(res, 400, e instanceof Error ? e.message : "não deu pra gravar");
    }
    return;
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = (await lerCorpo(req)) as Record<string, unknown>;
  } catch (e) {
    return recusar(res, 400, e instanceof Error ? e.message : "corpo inválido");
  }

  if (url.pathname === "/tranca") {
    const secao = typeof corpo.secao === "string" ? corpo.secao.slice(0, 64) : null;
    if (!secao) return recusar(res, 400, "secção inválida");
    limparTrancas();
    const dona = anfitriao.trancas.get(secao);
    if (corpo.soltar === true) {
      if (dona?.dono === parId) anfitriao.trancas.delete(secao);
    } else {
      if (dona && dona.dono !== parId) return recusar(res, 409, `${dona.nome} está aí`);
      anfitriao.trancas.set(secao, { dono: parId, nome: par.nome, expira: Date.now() + TRANCA_MS });
    }
    difundir("trancas", { trancas: estadoCoop().trancas });
    avisarEstado();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url.pathname === "/patch") {
    if (!caminhoValido(corpo.caminho)) return recusar(res, 400, "caminho inválido");
    const secao = String(corpo.caminho[0]);
    limparTrancas();
    const dona = anfitriao.trancas.get(secao);
    if (dona && dona.dono !== parId) return recusar(res, 409, `${dona.nome} está editando`);
    if (dona) dona.expira = Date.now() + TRANCA_MS;

    const patch: Patch = { caminho: corpo.caminho, valor: corpo.valor };
    anfitriao.doc = setIn(anfitriao.doc, patch.caminho, patch.valor) as Record<string, unknown>;
    difundir("patch", patch, parId);
    emitir("coop:patch", patch);
    agendarGravacao();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  recusar(res, 404, "não existe");
}

export async function abrirSessao(siteId: string): Promise<EstadoCoop> {
  await fecharSessao();
  const ip = ipDaRede();
  if (!ip) throw new Error("sem rede local — liga o Wi-Fi e tenta de novo");
  const { dados, marca } = await readConvite(siteId);

  const server = createServer((req, res) => {
    void atender(req, res).catch(() => {
      if (!res.headersSent) recusar(res, 500, "falha interna");
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    // Só na interface da LAN: em 0.0.0.0 o servidor também atenderia por
    // interfaces virtuais que ninguém desta sala alcança.
    server.listen(PORTA, ip, () => resolve());
  });

  anfitriao = {
    server,
    siteId,
    codigo: String(randomInt(0, 1_000_000)).padStart(6, "0"),
    endereco: `${ip}:${PORTA}`,
    doc: dados as Record<string, unknown>,
    marca,
    pares: new Map(),
    trancas: new Map(),
    gravacao: null,
    faltas: new Map(),
  };
  avisarEstado();
  return estadoCoop();
}

/** O anfitrião edita pela própria janela: o patch entra sem passar pela rede. */
export function patchLocal(patch: Patch): boolean {
  if (!anfitriao || !caminhoValido(patch.caminho)) return false;
  limparTrancas();
  const dona = anfitriao.trancas.get(String(patch.caminho[0]));
  if (dona) return false;
  anfitriao.doc = setIn(anfitriao.doc, patch.caminho, patch.valor) as Record<string, unknown>;
  difundir("patch", patch);
  agendarGravacao();
  return true;
}

// ------------------------------------------------------------------ convidado

export async function entrarSessao(
  endereco: string,
  codigo: string,
  nome: string,
): Promise<EstadoCoop> {
  await fecharSessao();
  if (!/^[\d.]+:\d+$/.test(endereco)) throw new Error("endereço tem que ser ip:porta");
  if (!/^\d{6}$/.test(codigo)) throw new Error("o código tem 6 dígitos");

  const parar = new AbortController();
  const alvo = `http://${endereco}/entrar?codigo=${codigo}&nome=${encodeURIComponent(nome)}`;
  const res = await fetch(alvo, { signal: parar.signal });
  if (!res.ok || !res.body) {
    throw new Error(res.status === 401 ? "código errado" : `o anfitrião recusou (${res.status})`);
  }

  // O mesmo objeto vai pro consumidor e pro `enviarPatch`: quando o `bemvindo`
  // chegar com o parId, ele é preenchido no lugar e os dois lados enxergam.
  cabecalhoAtual = { "content-type": "application/json", "x-coop-codigo": codigo, "x-coop-par": "" };
  convidado = { siteId: "", endereco, nome, parar, portaAoVivo: null, fontes: [] };
  void consumir(res.body, cabecalhoAtual, endereco);
  return estadoCoop();
}

/** Lê o fluxo SSE quadro a quadro e repassa pro renderer. */
async function consumir(
  corpo: ReadableStream<Uint8Array>,
  cabecalho: Record<string, string>,
  endereco: string,
): Promise<void> {
  const leitor = corpo.pipeThrough(new TextDecoderStream()).getReader();
  let sobra = "";
  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      sobra += value;
      const blocos = sobra.split("\n\n");
      sobra = blocos.pop() ?? "";
      for (const bloco of blocos) {
        const evento = /^event: (.+)$/m.exec(bloco)?.[1];
        const dado = /^data: (.+)$/m.exec(bloco)?.[1];
        if (!evento || !dado) continue;
        const carga = JSON.parse(dado) as Record<string, unknown>;
        if (evento === "bemvindo") {
          cabecalho["x-coop-par"] = String(carga.parId);
          if (convidado) {
            convidado.siteId = String(carga.siteId ?? "");
            convidado.portaAoVivo = portaValida(carga.porta);
            convidado.fontes = fontesValidas(carga.fontes);
          }
          await acertarEspelho();
          emitir("coop:cheio", { doc: carga.doc });
          avisarEstado();
        } else if (evento === "aovivo") {
          if (convidado) convidado.portaAoVivo = portaValida(carga.porta);
          await acertarEspelho();
          avisarEstado();
        } else if (evento === "patch") {
          emitir("coop:patch", carga);
        } else if (evento === "cheio") {
          emitir("coop:cheio", carga);
        } else if (evento === "trancas") {
          emitir("coop:trancas", carga);
        }
      }
    }
  } catch {
    /* queda de rede cai no finally */
  } finally {
    if (convidado?.endereco === endereco) {
      convidado = null;
      cabecalhoAtual = null;
      pararEspelho();
      emitir("coop:caiu", { motivo: "o anfitrião encerrou a sessão" });
      avisarEstado();
    }
  }
}

/** Convidado nunca escreve em disco: manda o patch e espera o anfitrião mandar de volta. */
export async function enviarPatch(patch: Patch): Promise<{ ok: boolean; erro?: string }> {
  if (anfitriao) return { ok: patchLocal(patch) };
  if (!convidado || !cabecalhoAtual?.["x-coop-par"]) return { ok: false, erro: "fora de sessão" };
  const res = await fetch(`http://${convidado.endereco}/patch`, {
    method: "POST",
    headers: cabecalhoAtual,
    body: JSON.stringify(patch),
  });
  if (res.ok) return { ok: true };
  const corpo = (await res.json().catch(() => ({}))) as { erro?: string };
  return { ok: false, erro: corpo.erro ?? `recusado (${res.status})` };
}

/**
 * Manda ficheiros do PC do convidado pra `public/assets` do anfitrião. Sem isto
 * a convidada só conseguia apontar o convite pra um asset que já estivesse lá —
 * o ficheiro dela tinha de passar por WhatsApp antes.
 */
export async function enviarAssets(origens: string[]): Promise<AssetImportado[]> {
  if (anfitriao) return importAssets(anfitriao.siteId, origens);
  if (!convidado || !cabecalhoAtual?.["x-coop-par"]) throw new Error("fora de sessão");

  const enviados: AssetImportado[] = [];
  for (const origem of origens) {
    for (const arquivo of await arquivosDe(origem)) {
      const res = await fetch(`http://${convidado.endereco}/asset`, {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-coop-codigo": cabecalhoAtual["x-coop-codigo"],
          "x-coop-par": cabecalhoAtual["x-coop-par"],
          "x-coop-nome": basename(arquivo),
        },
        body: await readFile(arquivo),
      });
      if (!res.ok) {
        const corpo = (await res.json().catch(() => ({}))) as { erro?: string };
        throw new Error(corpo.erro ?? `o anfitrião recusou o ficheiro (${res.status})`);
      }
      enviados.push((await res.json()) as AssetImportado);
    }
  }
  if (enviados.length === 0) throw new Error("nenhum arquivo aceito na seleção");
  return enviados;
}

/**
 * Puxa a pasta do site do anfitrião. É o que permite ao convidado ficar com um
 * convite que funcione — só o `convite.json` daria uma pasta que aparece na
 * lista mas não abre no preview nem publica, por não ter o source do Next.
 */
export async function baixarFonte(): Promise<Buffer> {
  if (anfitriao) {
    const raiz = await siteDir(anfitriao.siteId);
    return empacotar(raiz, (p) => copiavel(p, raiz));
  }
  if (!convidado || !cabecalhoAtual?.["x-coop-par"]) throw new Error("fora de sessão");
  const res = await fetch(`http://${convidado.endereco}/fonte`, { headers: cabecalhoAtual });
  if (!res.ok) throw new Error(`o anfitrião recusou mandar o site (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export async function pedirTranca(secao: string, soltar: boolean): Promise<boolean> {
  if (anfitriao) return true;
  if (!convidado || !cabecalhoAtual?.["x-coop-par"]) return false;
  const res = await fetch(`http://${convidado.endereco}/tranca`, {
    method: "POST",
    headers: cabecalhoAtual,
    body: JSON.stringify({ secao, soltar }),
  });
  return res.ok;
}

export async function fecharSessao(): Promise<EstadoCoop> {
  if (anfitriao) {
    if (anfitriao.gravacao) clearTimeout(anfitriao.gravacao);
    difundir("adeus", {});
    for (const par of anfitriao.pares.values()) par.res.end();
    await new Promise<void>((r) => anfitriao?.server.close(() => r()));
    anfitriao = null;
  }
  if (convidado) {
    convidado.parar.abort();
    convidado = null;
    cabecalhoAtual = null;
    pararEspelho();
  }
  avisarEstado();
  return estadoCoop();
}
