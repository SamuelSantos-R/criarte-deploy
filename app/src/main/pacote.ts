import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * Empacota a pasta de um site num único buffer pra atravessar a LAN.
 *
 * Formato: `CRIARTE1` + 4 bytes com o tamanho do cabeçalho + cabeçalho JSON +
 * o conteúdo dos ficheiros, na ordem em que o cabeçalho os lista.
 *
 * Sem `tar`: assim não dependemos de nenhum binário do sistema e, mais
 * importante, os caminhos que saem do pacote passam pela nossa validação em vez
 * da de outra ferramenta — quem serve o pacote está do outro lado da rede.
 */

const MAGICA = "CRIARTE1";
const ARQUIVOS_MAX = 5000;
const BYTES_MAX = 256 * 1024 * 1024;

type Entrada = { caminho: string; bytes: number };

/** Pesado, gerado ou específico da máquina — nada disso define o convite. */
const PULAR = new Set([
  "node_modules",
  ".next",
  "out",
  "dist",
  "build",
  ".turbo",
  ".vercel",
  ".git",
  ".originais",
  ".DS_Store",
  "tsconfig.tsbuildinfo",
]);

/**
 * Listas de convidados são nome real + link intransferível do casal antigo.
 * Elas vivem na raiz do site; `.txt` dentro de public/ é outra história.
 */
export function copiavel(src: string, raiz: string): boolean {
  return !PULAR.has(basename(src)) && !(dirname(src) === raiz && extname(src) === ".txt");
}

async function listar(raiz: string, atual: string, saida: string[], podeEntrar: (p: string) => boolean): Promise<void> {
  for (const item of await readdir(atual, { withFileTypes: true })) {
    const cheio = join(atual, item.name);
    if (!podeEntrar(cheio)) continue;
    if (item.isDirectory()) await listar(raiz, cheio, saida, podeEntrar);
    // Symlink não entra: apontaria pra fora e viraria buraco na outra máquina.
    else if (item.isFile()) saida.push(relative(raiz, cheio));
  }
}

export async function empacotar(raiz: string, podeEntrar: (p: string) => boolean): Promise<Buffer> {
  const caminhos: string[] = [];
  await listar(raiz, raiz, caminhos, podeEntrar);
  caminhos.sort();
  if (caminhos.length > ARQUIVOS_MAX) throw new Error(`site com ficheiros demais (${caminhos.length})`);

  const corpos: Buffer[] = [];
  const entradas: Entrada[] = [];
  let total = 0;
  for (const caminho of caminhos) {
    const conteudo = await readFile(join(raiz, caminho));
    total += conteudo.byteLength;
    if (total > BYTES_MAX) throw new Error("site grande demais pra mandar pela rede");
    corpos.push(conteudo);
    // Windows escreveria "src\app"; o outro lado espera sempre barra.
    entradas.push({ caminho: caminho.split(sep).join("/"), bytes: conteudo.byteLength });
  }

  const cabecalho = Buffer.from(JSON.stringify({ arquivos: entradas }), "utf8");
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32LE(cabecalho.byteLength);
  return Buffer.concat([Buffer.from(MAGICA, "ascii"), tamanho, cabecalho, ...corpos]);
}

/** `..`, caminho absoluto e nome vazio são recusados antes de virar caminho. */
function destinoSeguro(destino: string, relativo: string): string {
  const partes = relativo.split("/");
  if (partes.some((p) => p === "" || p === "." || p === ".." || p.includes("\\"))) {
    throw new Error(`caminho recusado no pacote: ${relativo}`);
  }
  if (isAbsolute(relativo)) throw new Error(`caminho absoluto no pacote: ${relativo}`);
  const alvo = resolve(destino, ...partes);
  const rel = relative(destino, alvo);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(`caminho foge da pasta: ${relativo}`);
  return alvo;
}

export async function desempacotar(pacote: Buffer, destino: string): Promise<number> {
  if (pacote.byteLength < 12 || pacote.subarray(0, 8).toString("ascii") !== MAGICA) {
    throw new Error("o anfitrião não mandou um pacote de site");
  }
  const tamanho = pacote.readUInt32LE(8);
  const inicioCabecalho = 12;
  const inicioCorpo = inicioCabecalho + tamanho;
  if (inicioCorpo > pacote.byteLength) throw new Error("pacote truncado");

  const { arquivos } = JSON.parse(pacote.subarray(inicioCabecalho, inicioCorpo).toString("utf8")) as {
    arquivos: Entrada[];
  };
  if (!Array.isArray(arquivos)) throw new Error("cabeçalho do pacote inválido");

  // Valida tudo antes de escrever qualquer coisa: metade de um site em disco é
  // pior que nenhum, porque aparece na lista como se estivesse pronto.
  let cursor = inicioCorpo;
  const plano = arquivos.map((a) => {
    if (typeof a?.caminho !== "string" || !Number.isInteger(a?.bytes) || a.bytes < 0) {
      throw new Error("entrada inválida no pacote");
    }
    const fatia = { alvo: destinoSeguro(destino, a.caminho), de: cursor, ate: cursor + a.bytes };
    cursor += a.bytes;
    if (cursor > pacote.byteLength) throw new Error("pacote truncado");
    return fatia;
  });

  for (const { alvo, de, ate } of plano) {
    await mkdir(dirname(alvo), { recursive: true });
    await writeFile(alvo, pacote.subarray(de, ate));
  }
  return plano.length;
}
