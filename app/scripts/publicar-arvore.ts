// Publica a atualização por partes: em vez dos 136 MB do .dmg, sobem só os
// ficheiros cujo conteúdo mudou desde a última versão.
//
//   npm run dmg && npm run publicar-arvore -- --notas "O que mudou"
//
// Vai para a VPS da Criarte por rsync (manda só os blocos diferentes e retoma
// se a ligação cair — que é o que o PUT único do R2 nunca fez), para dentro de
// /data/sites/<prefixo-secreto>/, que o nginx já serve. O prefixo é o mesmo que
// o R2 usa, derivado da chave que cada máquina já tem: ninguém precisa de um
// segredo novo, e o caminho continua fora de vista porque a Milton One viaja
// aqui dentro.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  caminhoDoBlob,
  lerArvore,
  manifestoDaVersao,
  NOME_PONTEIRO,
  type ManifestoArvore,
  type PonteiroLeve,
} from "../src/main/arvore.ts";
import { configR2, prefixoAtualizacoes } from "../src/main/r2.ts";

const exec = promisify(execFile);
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
const prefixo = prefixoAtualizacoes(cfg).replace(/\/$/, "");

// `--destino <pasta>`: publica para uma pasta local em vez da VPS. É como se
// ensaia a publicação inteira sem mandar nada pra produção.
const d = process.argv.indexOf("--destino");
const destinoLocal = d >= 0 ? process.argv[d + 1] : null;

const rsyncCfg = JSON.parse(await readFile(join(homedir(), ".criarte-deploy", "config.json"), "utf8")).rsync as
  | { host: string; user: string; identity?: string }
  | undefined;
if (!destinoLocal && (!rsyncCfg?.host || !rsyncCfg.user)) {
  console.error("esta máquina não tem o rsync configurado — corre `criarte-deploy ssh-setup`");
  process.exit(1);
}

console.log("· lendo o que está dentro do app…");
const pecas = await lerArvore(bundle);
const arquivos = pecas.filter((p) => p.tipo === "arquivo");
const total = arquivos.reduce((s, p) => s + p.bytes, 0);
console.log(`  ${pecas.length} peças, ${(total / 1024 / 1024).toFixed(0)} MB no total`);

// Área de preparo com um blob por conteúdo. O rsync a seguir só manda os que
// ainda não existem lá — é isso que faz a versão custar megabytes e não centenas.
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
await writeFile(join(preparo, manifestoDaVersao(versao)), JSON.stringify(manifesto), "utf8");

const destinoRemoto = destinoLocal
  ? `${destinoLocal.replace(/\/$/, "")}/`
  : `${rsyncCfg!.user}@${rsyncCfg!.host}:/data/sites/${prefixo}/`;
const chave =
  !destinoLocal && rsyncCfg!.identity
    ? ["-e", `ssh -i ${rsyncCfg!.identity.replace("~", homedir())} -o StrictHostKeyChecking=accept-new`]
    : [];

console.log(`↑ blobs novos → ${destinoLocal ?? rsyncCfg!.host}`);
// `--ignore-existing`: blob é o seu próprio hash, então o que já está lá é o
// mesmo ficheiro. `--partial` retoma o que a ligação cortou a meio.
const { stdout } = await exec("rsync", [
  "-rtz", "--partial", "--stats", "--ignore-existing", ...chave,
  join(preparo, "blobs") + "/", `${destinoRemoto}blobs/`,
]);
const enviados = stdout.match(/Number of regular files transferred: ([\d,]+)/)?.[1] ?? "?";
const bytesEnviados = stdout.match(/Total transferred file size: ([\d,]+)/)?.[1] ?? "?";
console.log(`  ${enviados} ficheiro(s), ${bytesEnviados} bytes`);

// O manifesto e o ponteiro vão por último: enquanto os blobs não estiverem
// todos lá, ninguém pode ser mandado montar uma versão pela metade.
await exec("rsync", ["-rtz", ...chave, join(preparo, manifestoDaVersao(versao)), destinoRemoto]);

const ponteiro: PonteiroLeve = {
  v: 1,
  versao,
  manifesto: manifestoDaVersao(versao),
  publicado: manifesto.publicado,
  notas,
};
const ponteiroLocal = join(preparo, NOME_PONTEIRO);
await writeFile(ponteiroLocal, JSON.stringify(ponteiro, null, 2), "utf8");
await exec("rsync", ["-rtz", ...chave, ponteiroLocal, destinoRemoto]);

console.log(`✓ ${versao} publicada por partes. Os Studios veem em Config → Atualização do Studio.`);
