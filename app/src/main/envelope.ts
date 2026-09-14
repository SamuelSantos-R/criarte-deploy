import { app, nativeImage } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { PDFDocument, PDFName, PDFString, type PDFRef } from "pdf-lib";

export type Convidado = { url: string; nome: string };
export type Modelo = { nome: string; largura: number; altura: number; dataUrl: string };
export type Lista = {
  caminho: string;
  nome: string;
  total: number;
  unicos: number;
  repetidos: { nome: string; vezes: number }[];
  amostra: Convidado[];
};
export type Saida = { pasta: string; feitos: number; falhas: { nome: string; erro: string }[] };

const URL_RE = /https?:\/\/\S+/;
const APARA = /^[\s\-\u2013\u2014:|]+|[\s\-\u2013\u2014:|]+$/g;
const PROIBIDO_FS = /[/\\:*?"<>|\n\r\t]+/g;
const MAX_CONVIDADOS = 2000;

/**
 * A ordem link/nome não importa: a URL sai por regex e o que sobra vira nome.
 * Linha vazia ou começando com `#` é comentário.
 */
export function lerLista(texto: string): Convidado[] {
  const out: Convidado[] = [];
  for (const bruta of String(texto).split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha || linha.startsWith("#")) continue;
    const m = linha.match(URL_RE);
    if (!m || m.index === undefined) continue;
    const url = m[0].replace(/[.,;]+$/, "");
    if (!/^https?:\/\//i.test(url)) continue;
    const nome = (linha.slice(0, m.index) + " " + linha.slice(m.index + m[0].length))
      .trim()
      .replace(APARA, "")
      .trim();
    out.push({ url, nome });
    if (out.length >= MAX_CONVIDADOS) break;
  }
  return out;
}

function seguro(nome: string): string {
  const s = String(nome || "").replace(PROIBIDO_FS, " ").replace(/\s+/g, " ").trim();
  return s.slice(0, 120) || "convidado";
}

const chave = (nome: string): string => seguro(nome).toLowerCase();

export function repetidos(lista: Convidado[]): { nome: string; vezes: number }[] {
  const contas = new Map<string, { nome: string; vezes: number }>();
  for (const { nome } of lista) {
    const k = chave(nome);
    if (!contas.has(k)) contas.set(k, { nome, vezes: 0 });
    contas.get(k)!.vezes += 1;
  }
  return [...contas.values()].filter((e) => e.vezes > 1);
}

function semRepetidos(lista: Convidado[]): Convidado[] {
  const vistos = new Set<string>();
  return lista.filter((c) => {
    const k = chave(c.nome);
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

/** A lista vem de um .txt em massa ou de um link só, escrito na hora. */
type Origem = { tipo: "arquivo"; caminho: string } | { tipo: "unico"; convidado: Convidado };

const estado: { pdf: Uint8Array | null; lista: Origem | null; pasta: string | null } = {
  pdf: null,
  lista: null,
  pasta: null,
};

/**
 * O convite chega como JPG/PNG grande demais pra mandar por WhatsApp. Vira um
 * PDF de uma página do tamanho exato da imagem, então marcar o botão no
 * preview é 1:1 com o ponto do PDF — só o eixo Y que inverte.
 */
export async function carregarModelo(caminho: string): Promise<Modelo> {
  const bytes = await readFile(caminho);
  let img = nativeImage.createFromBuffer(bytes);
  if (img.isEmpty()) throw new Error("não consegui ler essa imagem");

  const { width, height } = img.getSize();
  const maior = Math.max(width, height);
  if (maior > 4000) {
    const escala = 4000 / maior;
    img = img.resize({
      width: Math.round(width * escala),
      height: Math.round(height * escala),
      quality: "best",
    });
  }

  // Maior qualidade que ainda cabe no orçamento de ~1 MB por arquivo.
  let jpeg = img.toJPEG(60);
  for (const q of [100, 98, 96, 94, 92, 90, 85, 80, 70]) {
    const tenta = img.toJPEG(q);
    if (tenta.length <= 1_100_000) {
      jpeg = tenta;
      break;
    }
  }

  const pdf = await PDFDocument.create();
  const embutida = await pdf.embedJpg(jpeg);
  const pagina = pdf.addPage([embutida.width, embutida.height]);
  pagina.drawImage(embutida, { x: 0, y: 0, width: embutida.width, height: embutida.height });
  estado.pdf = await pdf.save();

  return {
    nome: basename(caminho),
    largura: embutida.width,
    altura: embutida.height,
    dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
  };
}

export async function carregarLista(caminho: string): Promise<Lista> {
  const texto = await readFile(caminho, "utf8");
  const lista = lerLista(texto);
  if (lista.length === 0) throw new Error("nenhuma linha com link nesse arquivo");
  const repetidas = repetidos(lista);
  estado.lista = { tipo: "arquivo", caminho };
  return {
    caminho,
    nome: basename(caminho),
    total: lista.length,
    unicos: lista.length - repetidas.reduce((s, d) => s + (d.vezes - 1), 0),
    repetidos: repetidas,
    amostra: lista.slice(0, 6),
  };
}

/** Um convite avulso: sem .txt, o link e o nome entram direto. */
export function definirLinkUnico(entrada: unknown): Lista {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const url = typeof e.url === "string" ? e.url.trim() : "";
  if (!/^https?:\/\/\S+$/i.test(url)) throw new Error("o link tem de começar por http:// ou https://");
  const nome = typeof e.nome === "string" ? e.nome.trim().slice(0, 120) : "";
  const convidado = { url, nome };
  estado.lista = { tipo: "unico", convidado };
  return { caminho: "", nome: nome || "Link único", total: 1, unicos: 1, repetidos: [], amostra: [convidado] };
}

async function convidados(origem: Origem): Promise<Convidado[]> {
  return origem.tipo === "unico" ? [origem.convidado] : lerLista(await readFile(origem.caminho, "utf8"));
}

export function definirPasta(caminho: string): string {
  estado.pasta = caminho;
  return caminho;
}

/** Carimba um retângulo clicável invisível — sem borda, sem aparência. */
async function carimbar(bytes: Uint8Array, rect: number[], url: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes);
  const pagina = pdf.getPages()[0];
  const ctx = pdf.context;

  const anot = ctx.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: rect,
    Border: [0, 0, 0],
    A: ctx.obj({ Type: "Action", S: "URI", URI: PDFString.of(url) }),
  });

  // Preserva anotação que não seja Link; Link antigo sai pra não duplicar.
  const manter: PDFRef[] = [];
  const atuais = pagina.node.Annots();
  if (atuais) {
    for (let i = 0; i < atuais.size(); i++) {
      const ref = atuais.get(i);
      const dict = ctx.lookup(ref) as { get?: (n: PDFName) => unknown } | undefined;
      const sub = dict?.get?.(PDFName.of("Subtype"));
      if (sub && String(sub) === "/Link") continue;
      manter.push(ref as PDFRef);
    }
  }
  manter.push(ctx.register(anot));
  pagina.node.set(PDFName.of("Annots"), ctx.obj(manter));

  return pdf.save();
}

export async function gerar(opcoes: unknown): Promise<Saida> {
  const o = (opcoes ?? {}) as Record<string, unknown>;
  if (!estado.pdf) throw new Error("escolha a imagem do convite primeiro");
  if (!estado.lista) throw new Error("escolha o .txt dos convidados ou escreva um link");

  const r = o.rect;
  if (!Array.isArray(r) || r.length !== 4 || r.some((n) => !Number.isFinite(Number(n)))) {
    throw new Error("marque a área do botão no convite");
  }
  const [x1, y1, x2, y2] = r.map(Number);
  const rect = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
  if (rect[2] - rect[0] < 2 || rect[3] - rect[1] < 2) throw new Error("a área marcada é pequena demais");

  // Link único não tem pasta de onde veio: sem escolha, vai para as Transferências.
  const pasta =
    estado.pasta ??
    (estado.lista.tipo === "arquivo"
      ? join(dirname(estado.lista.caminho), "saida")
      : join(app.getPath("downloads"), "Criarte Envelopes"));
  await mkdir(pasta, { recursive: true });
  estado.pasta = pasta;

  const molde = typeof o.padrao === "string" && o.padrao.trim() ? o.padrao.trim() : "{nome}";
  let lista = await convidados(estado.lista);
  if (o.semRepetidos === true) lista = semRepetidos(lista);

  const usados = new Map<string, number>();
  const falhas: { nome: string; erro: string }[] = [];
  let feitos = 0;

  for (const { url, nome } of lista) {
    const base = seguro(nome);
    const cheio = seguro(molde.includes("{nome}") ? molde.replaceAll("{nome}", base) : `${molde} ${base}`);
    const k = cheio.toLowerCase();
    const n = (usados.get(k) ?? 0) + 1;
    usados.set(k, n);
    const arquivo = n === 1 ? cheio : `${cheio} (${n})`;
    try {
      await writeFile(join(pasta, `${arquivo}.pdf`), await carimbar(estado.pdf, rect, url));
      feitos += 1;
    } catch (e) {
      falhas.push({ nome: arquivo, erro: e instanceof Error ? e.message : String(e) });
    }
  }

  return { pasta, feitos, falhas };
}

export function pastaDaSaida(): string | null {
  return estado.pasta;
}
