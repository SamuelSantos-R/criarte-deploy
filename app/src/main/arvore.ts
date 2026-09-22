import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, readlink } from "node:fs/promises";
import { join, relative } from "node:path";

// ============================================================================
// ÁRVORE — a lista do que está dentro do `Criarte Studio.app`, ficheiro a
// ficheiro, com o sha256 de cada um.
//
// Publicar o .dmg inteiro manda 136 MB para entregar os 2 MB que mudaram: a
// esta ligação são 11 minutos e três tentativas falhadas. Com a árvore, o que
// viaja é só o ficheiro cujo hash mudou — o Electron, que é 292 MB dos 136 do
// .dmg, fica onde está porque ninguém lhe tocou.
// ============================================================================

export type PecaDaArvore =
  | { caminho: string; tipo: "arquivo"; bytes: number; sha256: string; executavel: boolean }
  | { caminho: string; tipo: "link"; alvo: string };

export type ManifestoArvore = {
  v: 1;
  versao: string;
  publicado: string;
  notas: string;
  plataforma: "mac";
  pecas: PecaDaArvore[];
};

/** Aponta para o manifesto da versão em cena. É o ficheiro que o Studio lê primeiro. */
export type PonteiroLeve = { v: 1; versao: string; manifesto: string; publicado: string; notas: string };

export const NOME_PONTEIRO = "leve.json";
export const manifestoDaVersao = (versao: string): string => `manifesto-${versao}.json`;
/** Um blob por conteúdo: o mesmo ficheiro em duas versões ocupa lugar uma vez. */
export const caminhoDoBlob = (sha256: string): string => `blobs/${sha256.slice(0, 2)}/${sha256}`;

export async function sha256DoArquivo(caminho: string): Promise<string> {
  const h = createHash("sha256");
  for await (const pedaco of createReadStream(caminho)) h.update(pedaco as Buffer);
  return h.digest("hex");
}

/**
 * Percorre o bundle inteiro. Links simbólicos entram como link — dentro do
 * `.app` do Electron eles seguram o `Versions/Current` das frameworks, e
 * copiá-los como ficheiro faria um app que não abre.
 */
export async function lerArvore(raiz: string): Promise<PecaDaArvore[]> {
  const pecas: PecaDaArvore[] = [];
  const andar = async (dir: string): Promise<void> => {
    for (const entrada of await readdir(dir, { withFileTypes: true })) {
      const cheio = join(dir, entrada.name);
      const caminho = relative(raiz, cheio);
      if (entrada.isSymbolicLink()) {
        pecas.push({ caminho, tipo: "link", alvo: await readlink(cheio) });
        continue;
      }
      if (entrada.isDirectory()) {
        await andar(cheio);
        continue;
      }
      if (!entrada.isFile()) continue;
      const info = await lstat(cheio);
      pecas.push({
        caminho,
        tipo: "arquivo",
        bytes: info.size,
        sha256: await sha256DoArquivo(cheio),
        executavel: (info.mode & 0o111) !== 0,
      });
    }
  };
  await andar(raiz);
  return pecas.sort((a, b) => a.caminho.localeCompare(b.caminho));
}

export type Diferenca = {
  /** Ficheiros a baixar: mudaram de conteúdo ou não existem aqui. */
  baixar: Extract<PecaDaArvore, { tipo: "arquivo" }>[];
  /** Ficheiros que saíram da versão nova. */
  apagar: string[];
  bytes: number;
  /**
   * Porque é que esta versão não se faz por partes. Link que nasce, morre ou
   * muda de alvo é sinal de Electron trocado: aí o `.app` mexe de alto a baixo
   * e o instalador completo é mais honesto do que remendar por cima.
   */
  impedimento: string | null;
};

export function compararArvores(aqui: PecaDaArvore[], la: PecaDaArvore[]): Diferenca {
  const mapaAqui = new Map(aqui.map((p) => [p.caminho, p]));
  const mapaLa = new Map(la.map((p) => [p.caminho, p]));
  const baixar: Extract<PecaDaArvore, { tipo: "arquivo" }>[] = [];
  let impedimento: string | null = null;

  for (const peca of la) {
    const meu = mapaAqui.get(peca.caminho);
    if (peca.tipo === "link") {
      if (!meu || meu.tipo !== "link" || meu.alvo !== peca.alvo) {
        impedimento = "esta versão mexe nas frameworks — precisa do instalador completo";
      }
      continue;
    }
    if (meu && meu.tipo === "arquivo" && meu.sha256 === peca.sha256) continue;
    if (meu && meu.tipo === "link") {
      impedimento = "esta versão mexe nas frameworks — precisa do instalador completo";
      continue;
    }
    baixar.push(peca);
  }

  const apagar: string[] = [];
  for (const peca of aqui) {
    if (mapaLa.has(peca.caminho)) continue;
    if (peca.tipo === "link") {
      impedimento = "esta versão mexe nas frameworks — precisa do instalador completo";
      continue;
    }
    apagar.push(peca.caminho);
  }

  return { baixar, apagar, bytes: baixar.reduce((s, p) => s + p.bytes, 0), impedimento };
}
