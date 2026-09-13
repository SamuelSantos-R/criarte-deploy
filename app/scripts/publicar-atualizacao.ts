// Sobe o instalador desta versão pro R2 e aponta o manifesto pra ele. Depois
// disto, cada Studio vê a versão nova em Config → Atualização do Studio.
//
//   npm run dmg && npm run publicar -- --notas "O que mudou"
//
// Só publica o que existir em dist/ pra versão do package.json: dá pra mandar
// só o .dmg e deixar o .exe na versão anterior.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { configR2, prefixoAtualizacoes, r2Get, r2Put } from "../src/main/r2.ts";

// `fileURLToPath`, não `.pathname`: o disco chama-se "Sem nome - dados" e o espaço viria como %20.
const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const UPLOAD_MAX_MS = 60 * 60 * 1000;

const { version: versao } = JSON.parse(await readFile(join(RAIZ, "package.json"), "utf8")) as { version: string };
const i = process.argv.indexOf("--notas");
const notas = i >= 0 ? (process.argv[i + 1] ?? "") : "";

const cfg = await configR2();
const prefixo = prefixoAtualizacoes(cfg);
const bruto = await r2Get(cfg, `${prefixo}latest.json`);
const manifesto = bruto ? JSON.parse(bruto.toString("utf8")) : { v: 1 };

const alvos = [
  { plataforma: "mac", ficheiro: `Criarte Studio-${versao}.dmg` },
  { plataforma: "win", ficheiro: `Criarte Studio Setup ${versao}.exe` },
] as const;

let subiu = 0;
for (const { plataforma, ficheiro } of alvos) {
  const caminho = join(RAIZ, "dist", ficheiro);
  if (!existsSync(caminho)) {
    console.log(`– ${plataforma}: sem ${ficheiro} em dist/, fica como estava`);
    continue;
  }
  const bytes = await readFile(caminho);
  const sha512 = createHash("sha512").update(bytes).digest("hex");
  const chave = `${prefixo}${versao}/${ficheiro.replace(/\s+/g, "-")}`;
  console.log(`↑ ${plataforma}: ${ficheiro} (${Math.round(bytes.length / 1024 / 1024)} MB)…`);
  await r2Put(cfg, chave, bytes, "application/octet-stream", UPLOAD_MAX_MS);
  manifesto[plataforma] = { versao, chave, sha512, bytes: bytes.length };
  subiu++;
}

if (subiu === 0) {
  console.error(`Nada pra publicar: gera primeiro com npm run dmg / npm run exe (versão ${versao}).`);
  process.exit(1);
}

// O manifesto vai por último: se um upload cair a meio, ninguém é mandado baixar metade de um ficheiro.
manifesto.v = 1;
manifesto.publicado = new Date().toISOString();
manifesto.notas = notas;
await r2Put(cfg, `${prefixo}latest.json`, Buffer.from(JSON.stringify(manifesto, null, 2)), "application/json");
console.log(`✓ ${versao} publicada. Os Studios veem em Config → Atualização do Studio.`);
