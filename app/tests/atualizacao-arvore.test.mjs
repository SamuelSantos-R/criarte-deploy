// Ensaia a atualização por partes numa árvore pequena: o que muda viaja, o que
// não mudou fica, o link simbólico sobrevive e a peça estragada é recusada.
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile, chmod, readlink, lstat, cp } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lerArvore, compararArvores, caminhoDoBlob } from "../src/main/arvore.ts";
import { montarVersaoNova } from "../src/main/atualizar-leve.ts";

const base = await mkdtemp(join(tmpdir(), "arvore-teste-"));
const instalado = join(base, "instalado.app");
const publicado = join(base, "publicado.app");
const servidos = join(base, "servidos");

async function montarApp(dir, { versao, extra }) {
  await mkdir(join(dir, "Contents", "MacOS"), { recursive: true });
  await mkdir(join(dir, "Contents", "Resources"), { recursive: true });
  await mkdir(join(dir, "Contents", "Frameworks", "E.framework", "Versions", "A"), { recursive: true });
  await writeFile(join(dir, "Contents", "Info.plist"), `<plist>${versao}</plist>`);
  await writeFile(join(dir, "Contents", "MacOS", "Criarte Studio"), "#!/bin/sh\necho oi\n");
  await chmod(join(dir, "Contents", "MacOS", "Criarte Studio"), 0o755);
  await writeFile(join(dir, "Contents", "Resources", "app.asar"), `codigo da versao ${versao}`);
  await writeFile(join(dir, "Contents", "Frameworks", "E.framework", "Versions", "A", "E"), "electron pesado".repeat(1000));
  await symlink("A", join(dir, "Contents", "Frameworks", "E.framework", "Versions", "Current"));
  if (extra) await writeFile(join(dir, "Contents", "Resources", extra), "peça nova");
}

await montarApp(instalado, { versao: "1.0.0" });
await montarApp(publicado, { versao: "1.1.0", extra: "painel-rsvp.txt" });
// Um ficheiro que sai na versão nova.
await writeFile(join(instalado, "Contents", "Resources", "antigo.txt"), "isto sai");

const pecasLa = await lerArvore(publicado);
const pecasAqui = await lerArvore(instalado);
const dif = compararArvores(pecasAqui, pecasLa);

let falhas = 0;
const ok = (cond, texto) => { console.log(`${cond ? "ok  " : "FALHA"} ${texto}`); if (!cond) falhas++; };

const nomes = dif.baixar.map((p) => p.caminho).sort();
ok(nomes.includes("Contents/Info.plist"), "a versão (Info.plist) entra no que viaja");
ok(nomes.includes("Contents/Resources/app.asar"), "o código mudou, então viaja");
ok(nomes.includes("Contents/Resources/painel-rsvp.txt"), "ficheiro novo viaja");
ok(!nomes.some((n) => n.includes("Frameworks")), "o Electron não viaja — não mudou");
ok(dif.apagar.includes("Contents/Resources/antigo.txt"), "o que saiu é marcado para apagar");
ok(dif.impedimento === null, "versão que só mexe em ficheiros faz-se por partes");

// Servidor com os blobs, como a VPS serviria.
for (const p of pecasLa.filter((p) => p.tipo === "arquivo")) {
  const destino = join(servidos, caminhoDoBlob(p.sha256));
  await mkdir(join(destino, ".."), { recursive: true });
  await cp(join(publicado, p.caminho), destino);
}
const http = createServer((req, res) => {
  const caminho = join(servidos, decodeURIComponent(req.url.split("?")[0]));
  const fluxo = createReadStream(caminho);
  fluxo.on("error", () => { res.statusCode = 404; res.end(); });
  fluxo.pipe(res);
});
await new Promise((r) => http.listen(0, r));
const url = `http://127.0.0.1:${http.address().port}`;

const novo = await montarVersaoNova(instalado, join(base, "temp"), url, dif, () => {});
const pecasNovas = await lerArvore(novo);
const igual = JSON.stringify(pecasNovas) === JSON.stringify(pecasLa);
ok(igual, "o app montado fica igual, peça por peça, ao publicado");
ok((await lstat(join(novo, "Contents", "MacOS", "Criarte Studio"))).mode & 0o111, "o executável continua executável");
ok((await readlink(join(novo, "Contents", "Frameworks", "E.framework", "Versions", "Current"))) === "A", "o link simbólico sobreviveu");
ok((await readFile(join(novo, "Contents", "Info.plist"), "utf8")).includes("1.1.0"), "o app montado diz a versão nova");
ok(!(await lstat(join(instalado, "Contents", "Info.plist")).then((s) => s.size === 0).catch(() => true)), "o app instalado ficou intacto");

// Electron trocado: tem de recusar e mandar pro instalador completo.
const comLinkTrocado = pecasLa.map((p) => (p.tipo === "link" ? { ...p, alvo: "B" } : p));
ok(compararArvores(pecasAqui, comLinkTrocado).impedimento !== null, "link mexido manda pro instalador completo");

// Peça estragada no servidor: tem de recusar em vez de montar lixo.
const alvo = dif.baixar.find((p) => p.caminho.endsWith("app.asar"));
await writeFile(join(servidos, caminhoDoBlob(alvo.sha256)), "conteúdo trocado");
let recusou = false;
await montarVersaoNova(instalado, join(base, "temp2"), url, dif, () => {}).catch(() => { recusou = true; });
ok(recusou, "peça que chega diferente do hash é recusada");

http.close();
await rm(base, { recursive: true, force: true });
console.log(falhas === 0 ? "\nTODOS OS CASOS PASSARAM" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
