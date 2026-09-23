import { createWriteStream } from "node:fs";
import { chmod, cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  caminhoDoBlob,
  compararArvores,
  lerArvore,
  NOME_PONTEIRO,
  sha256DoArquivo,
  type Diferenca,
  type ManifestoArvore,
  type PonteiroLeve,
} from "./arvore";
import { configR2, prefixoAtualizacoes } from "./r2";

// ============================================================================
// ATUALIZAÇÃO POR PARTES — o .dmg continua a existir para a instalação de raiz
// e para quem ainda tem o Studio antigo. A partir daqui, a versão nova chega
// pelos ficheiros que mudaram: o Electron não mudou, logo não viaja.
//
// Vem da VPS da Criarte, pelo mesmo caminho secreto que o R2 usa — derivado da
// chave que a máquina já tem, não de um segredo novo.
// ============================================================================

const TEMPO_MAX_MS = 60_000;
// O ponteiro muda a cada versão e o blob nunca muda, mas quem está no meio do
// caminho (Cloudflare) não sabe disso: pedir sem cache evita ficar a ver a
// versão de ontem.
const SEM_CACHE = { "cache-control": "no-cache" };

export type Fonte = { base: string };

/**
 * As peças moram no mesmo sítio do .dmg: o R2, no caminho secreto que a chave
 * desta máquina gera. A VPS chegou a receber a árvore, mas o nginx de lá
 * reescreve `/sites/...` e o endereço não bate — mexer nessa regra é obra no
 * servidor de produção, e o ganho (2 MB em vez de 136) não depende dela.
 */
async function fonte(): Promise<Fonte> {
  const cfg = await configR2();
  return { base: `${cfg.publicUrl}/${prefixoAtualizacoes(cfg).replace(/\/$/, "")}` };
}

async function baixarTexto(url: string): Promise<string | null> {
  const r = await fetch(url, { signal: AbortSignal.timeout(TEMPO_MAX_MS), headers: SEM_CACHE }).catch(() => null);
  if (!r || !r.ok) return null;
  return r.text();
}

/** O ponteiro da versão em cena, ou `null` se ainda não há publicação por partes. */
export async function ponteiro(): Promise<{ ponteiro: PonteiroLeve; base: string } | null> {
  const { base } = await fonte();
  const bruto = await baixarTexto(`${base}/${NOME_PONTEIRO}`);
  if (!bruto) return null;
  try {
    const doc = JSON.parse(bruto) as PonteiroLeve;
    if (doc?.v !== 1 || typeof doc.versao !== "string" || !/^[\w.-]+$/.test(doc.manifesto)) return null;
    return { ponteiro: doc, base };
  } catch {
    return null;
  }
}

export async function manifestoDe(base: string, nome: string): Promise<ManifestoArvore | null> {
  const bruto = await baixarTexto(`${base}/${nome}`);
  if (!bruto) return null;
  try {
    const doc = JSON.parse(bruto) as ManifestoArvore;
    return doc?.v === 1 && Array.isArray(doc.pecas) && doc.pecas.length > 0 ? doc : null;
  } catch {
    return null;
  }
}

/** O que falta a esta máquina para ficar igual ao manifesto. */
export async function diferencaPara(bundle: string, manifesto: ManifestoArvore): Promise<Diferenca> {
  return compararArvores(await lerArvore(bundle), manifesto.pecas);
}

async function baixarBlob(base: string, sha256: string, destino: string): Promise<void> {
  const r = await fetch(`${base}/${caminhoDoBlob(sha256)}`, {
    signal: AbortSignal.timeout(TEMPO_MAX_MS),
    headers: SEM_CACHE,
  });
  if (!r.ok || !r.body) throw new Error(`o servidor recusou uma peça da atualização (${r.status})`);
  await mkdir(dirname(destino), { recursive: true });
  await pipeline(Readable.fromWeb(r.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(destino));
  // Conteúdo é o próprio nome: se não bater, o que chegou não é o que se pediu.
  if ((await sha256DoArquivo(destino)) !== sha256) {
    await rm(destino, { force: true });
    throw new Error("uma peça da atualização chegou estragada");
  }
}

/**
 * Monta a versão nova numa cópia do app instalado e devolve o caminho dela. A
 * troca em si é a mesma de sempre — o script que espera o Studio fechar.
 *
 * Copiar primeiro e só depois mexer é o que permite desistir a meio sem deixar
 * o Studio da pessoa pela metade: enquanto a cópia não estiver pronta, o app
 * que ela tem continua inteiro.
 */
export async function montarVersaoNova(
  bundle: string,
  pasta: string,
  base: string,
  diferenca: Diferenca,
  avisar: (feito: number, total: number) => void,
): Promise<string> {
  const novo = join(pasta, "Criarte Studio.app");
  await rm(novo, { recursive: true, force: true });
  await cp(bundle, novo, { recursive: true, verbatimSymlinks: true, preserveTimestamps: true });

  let feito = 0;
  for (const peca of diferenca.baixar) {
    const destino = join(novo, peca.caminho);
    await baixarBlob(base, peca.sha256, destino);
    if (peca.executavel) await chmod(destino, 0o755);
    feito += peca.bytes;
    avisar(feito, diferenca.bytes);
  }
  for (const caminho of diferenca.apagar) {
    await rm(join(novo, caminho), { force: true });
  }

  // O número da versão vive no `Contents/Info.plist`, que é um ficheiro como os
  // outros: mudou de hash, entrou no diff, já foi trocado aqui em cima. Nada a
  // escrever à mão — e nada a esquecer.
  return novo;
}
