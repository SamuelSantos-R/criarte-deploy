// Publica a atualização por partes: em vez dos 136 MB do .dmg, sobem só os
// ficheiros cujo conteúdo mudou desde a última versão.
//
//   npm run dmg && npm run publicar-arvore -- --notas "O que mudou"
//
// Vai para o R2, no mesmo caminho secreto do .dmg — o prefixo sai da chave que
// cada máquina já tem, e fica fora de vista porque a Milton One viaja aqui
// dentro. Cada peça é pequena, então a ligação lenta deixa de ser problema:
// uma falha custa um ficheiro, não os 136 MB outra vez.
//
// A VPS chegou a receber esta árvore, mas o nginx de lá reescreve `/sites/...`
// e o endereço não bate; mexer nessa regra é obra em produção, e o ganho não
// vem do transporte — vem de só mandar o que mudou.
import { Agent, setGlobalDispatcher } from "undici";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  caminhoDoBlob,
  lerArvore,
  manifestoDaVersao,
  NOME_PONTEIRO,
  type ManifestoArvore,
  type PonteiroLeve,
} from "../src/main/arvore.ts";
import { configR2, prefixoAtualizacoes, r2Listar, r2Put } from "../src/main/r2.ts";

// O limite de 5 min do fetch corre durante o envio, e o Electron é um ficheiro
// de 150 MB que nesta ligação não cabe nisso. Quem manda no tempo passa a ser o
// prazo por peça, calculado abaixo — zero aqui não é "sem prazo", é "o prazo é
// de quem chama".
setGlobalDispatcher(new Agent({ headersTimeout: 0, bodyTimeout: 0 }));

/** Prazo de uma peça: o que ela leva a 15 KB/s, nunca menos de 5 minutos. */
const prazoPara = (bytes: number): number => Math.round(Math.max(5 * 60_000, (bytes / 15_000) * 1000));

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const { version: versao } = JSON.parse(await readFile(join(RAIZ, "package.json"), "utf8")) as { version: string };
const i = process.argv.indexOf("--notas");
const notas = i >= 0 ? (process.argv[i + 1] ?? "") : "";

const bundle = join(RAIZ, "dist", "mac", "Criarte Studio.app");
if (!existsSync(bundle)) {
  console.error(`Não há ${bundle}. Corre primeiro: npm run dmg`);
  process.exit(1);
}

const cfg = await configR2();
const raiz = prefixoAtualizacoes(cfg);

console.log("· lendo o que está dentro do app…");
const pecas = await lerArvore(bundle);
const arquivos = pecas.filter((p) => p.tipo === "arquivo");
const total = arquivos.reduce((s, p) => s + p.bytes, 0);
console.log(`  ${pecas.length} peças, ${(total / 1024 / 1024).toFixed(0)} MB no total`);

// Uma peça por conteúdo: o mesmo ficheiro em duas versões ocupa lugar uma vez.
const preparo = join(RAIZ, "dist", "atualizacao");
await rm(preparo, { recursive: true, force: true });
const vistos = new Set<string>();
for (const peca of arquivos) {
  if (vistos.has(peca.sha256)) continue;
  vistos.add(peca.sha256);
  const destino = join(preparo, caminhoDoBlob(peca.sha256));
  await mkdir(dirname(destino), { recursive: true });
  await cp(join(bundle, peca.caminho), destino);
}

const manifesto: ManifestoArvore = {
  v: 1,
  versao,
  publicado: new Date().toISOString(),
  notas,
  plataforma: "mac",
  pecas,
};

// O que já está lá não volta a subir: o nome da peça é o seu próprio conteúdo.
const { chaves } = await r2Listar(cfg, `${raiz}blobs/`);
const jaLa = new Set(chaves);
const novos = [...vistos].filter((sha) => !jaLa.has(`${raiz}${caminhoDoBlob(sha)}`));
console.log(`↑ ${novos.length} peça(s) nova(s) de ${vistos.size} — o resto já está no servidor`);

let bytesEnviados = 0;
for (const [n, sha] of novos.entries()) {
  const bytes = await readFile(join(preparo, caminhoDoBlob(sha)));
  // Ligação que morre a meio pendura o envio: cada peça tem o seu prazo e três
  // tentativas. Falhar custa uma peça, não a publicação inteira.
  let ultimo: unknown = null;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      await r2Put(cfg, `${raiz}${caminhoDoBlob(sha)}`, bytes, "application/octet-stream", prazoPara(bytes.length));
      ultimo = null;
      break;
    } catch (e) {
      ultimo = e;
      console.log(`  peça ${n + 1} falhou (${tentativa}/3): ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 3000 * tentativa));
    }
  }
  if (ultimo) throw ultimo;
  bytesEnviados += bytes.length;
  if ((n + 1) % 25 === 0 || bytes.length > 20 * 1024 * 1024) {
    console.log(`  ${n + 1}/${novos.length} · ${(bytesEnviados / 1024 / 1024).toFixed(0)} MB enviados`);
  }
}
console.log(`  ${novos.length} ficheiro(s), ${(bytesEnviados / 1024 / 1024).toFixed(1)} MB enviados`);

// O manifesto e o ponteiro vão por último: enquanto as peças não estiverem
// todas lá, ninguém pode ser mandado montar uma versão pela metade.
const nomeManifesto = manifestoDaVersao(versao);
await r2Put(cfg, `${raiz}${nomeManifesto}`, Buffer.from(JSON.stringify(manifesto)), "application/json");
const ponteiro: PonteiroLeve = { v: 1, versao, manifesto: nomeManifesto, publicado: manifesto.publicado, notas };
await r2Put(cfg, `${raiz}${NOME_PONTEIRO}`, Buffer.from(JSON.stringify(ponteiro, null, 2)), "application/json");
await rm(preparo, { recursive: true, force: true });

console.log(`✓ ${versao} publicada por partes. Os Studios veem em Config → Atualização do Studio.`);
