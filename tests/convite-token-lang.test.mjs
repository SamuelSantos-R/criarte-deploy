// Teste do idioma por convidado: |en no .txt e a lista dos convidados de fora.
// Roda com: node --test tests/
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConviteTokenAdapter } from "../src/adapters/convite-token.mjs";

const SLUG = "casamento/mateus-rose";
const URL_ALVO = "https://criartedesing.ao";

let root, projectDir, stagingDir, cwdAntes, fetchAntes, logAntes;
let live = null;

before(() => {
  cwdAntes = process.cwd();
  fetchAntes = globalThis.fetch;
  logAntes = console.log;
  console.log = () => {};
  globalThis.fetch = async (url) => {
    if (String(url).includes("/guests.json") && live) {
      return { ok: true, status: 200, json: async () => live };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  root = mkdtempSync(join(tmpdir(), "criarte-lang-"));
  projectDir = join(root, "convite");
  stagingDir = join(root, "staging");
  mkdirSync(projectDir, { recursive: true });
  process.chdir(projectDir);
});

after(() => {
  process.chdir(cwdAntes);
  globalThis.fetch = fetchAntes;
  console.log = logAntes;
  delete process.env.CRIARTE_GUESTS_EN_FILE;
  if (root) rmSync(root, { recursive: true, force: true });
});

function novoStaging() {
  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(join(stagingDir, "src", "lib"), { recursive: true });
  writeFileSync(join(stagingDir, "src", "lib", "guest.tsx"), `fetch("/guests.json")\n`);
}

const lerGuests = () => JSON.parse(readFileSync(join(stagingDir, "public", "guests.json"), "utf8"));
const porNome = (guests) =>
  Object.fromEntries(Object.entries(guests).map(([token, v]) => [typeof v === "string" ? v : v.name, { token, value: v }]));
const preparar = () => new ConviteTokenAdapter().prepare(stagingDir, SLUG, {}, URL_ALVO);

test("|en no .txt e lista de fora: lang en, link com &l=en, PT intacto", async () => {
  novoStaging();
  writeFileSync(join(projectDir, "convidados.txt"), ["Prima Ana", "John Smith|en", "Smith Family|3|en", ""].join("\n"));
  const fora = join(root, "fora.txt");
  writeFileSync(fora, "Jane Doe\nThe Browns|2\n");
  process.env.CRIARTE_GUESTS_EN_FILE = fora;

  assert.equal(await preparar(), true);
  const g = porNome(lerGuests().guests);
  assert.equal(g["Prima Ana"].value, "Prima Ana");
  assert.deepEqual(g["John Smith"].value, { name: "John Smith", lang: "en" });
  assert.deepEqual(g["Smith Family"].value, { name: "Smith Family", pax: 3, lang: "en" });
  assert.deepEqual(g["Jane Doe"].value, { name: "Jane Doe", lang: "en" });
  assert.deepEqual(g["The Browns"].value, { name: "The Browns", pax: 2, lang: "en" });

  const links = readFileSync(join(projectDir, "convidados-mateus-rose-links.txt"), "utf8");
  assert.match(links, /\?t=\w+&l=en — John Smith$/m);
  assert.match(links, /\?t=\w+ — Prima Ana$/m);
  live = lerGuests();
});

test("passar alguém pra lista de fora mantém o token; |pt traz de volta", async () => {
  const antes = porNome(live.guests);
  novoStaging();
  writeFileSync(join(projectDir, "convidados.txt"), "John Smith|pt\n");
  const fora = join(root, "fora.txt");
  writeFileSync(fora, "Prima Ana\n");
  process.env.CRIARTE_GUESTS_EN_FILE = fora;

  assert.equal(await preparar(), true);
  const g = porNome(lerGuests().guests);
  assert.equal(g["Prima Ana"].token, antes["Prima Ana"].token, "token preservado");
  assert.deepEqual(g["Prima Ana"].value, { name: "Prima Ana", lang: "en" });
  assert.equal(g["John Smith"].token, antes["John Smith"].token);
  assert.equal(g["John Smith"].value, "John Smith", "voltou a português");
  // quem não veio em nenhuma lista fica como estava
  assert.deepEqual(g["Smith Family"].value, { name: "Smith Family", pax: 3, lang: "en" });
  live = lerGuests();
});

test("redeploy sem lista preserva o idioma de quem já está no ar", async () => {
  novoStaging();
  // Lista sem nomes (só comentário): o idioma tem de vir do que está no ar.
  writeFileSync(join(projectDir, "convidados.txt"), "# nada novo\n");
  delete process.env.CRIARTE_GUESTS_EN_FILE;
  assert.equal(await preparar(), true);
  const g = porNome(lerGuests().guests);
  assert.deepEqual(g["Prima Ana"].value, { name: "Prima Ana", lang: "en" });
});
