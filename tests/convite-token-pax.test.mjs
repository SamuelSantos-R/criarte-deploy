// Teste do merge de convidados com "pax" (Nome|N no .txt).
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
let live = null; // guests.json "publicado" — null = 404 (primeiro deploy)

before(() => {
  cwdAntes = process.cwd();
  fetchAntes = globalThis.fetch;
  logAntes = console.log;
  console.log = () => {};
  globalThis.fetch = async (url) => {
    if (String(url).includes("/guests.json")) {
      if (!live) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => live };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
});

after(() => {
  process.chdir(cwdAntes);
  globalThis.fetch = fetchAntes;
  console.log = logAntes;
  if (root) rmSync(root, { recursive: true, force: true });
});

function novoStaging() {
  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(join(stagingDir, "src", "lib"), { recursive: true });
  writeFileSync(
    join(stagingDir, "src", "lib", "guest.tsx"),
    `fetch("/guests.json", { cache: "no-store" })\n`,
  );
}

function lista(txt) {
  writeFileSync(join(projectDir, "convidados.txt"), txt);
}

function lerGuests() {
  return JSON.parse(readFileSync(join(stagingDir, "public", "guests.json"), "utf8"));
}

function porNome(guests) {
  const out = {};
  for (const [token, v] of Object.entries(guests)) {
    out[typeof v === "string" ? v : v.name] = { token, value: v };
  }
  return out;
}

test("primeiro deploy: |N vira { name, pax }, sem | fica string", async () => {
  root = mkdtempSync(join(tmpdir(), "criarte-pax-"));
  projectDir = join(root, "convite");
  stagingDir = join(root, "staging");
  mkdirSync(projectDir, { recursive: true });
  novoStaging();
  process.chdir(projectDir);

  lista(
    [
      "# lista do casamento",
      "Família Gabo|4",
      "Família Ferreira|4",
      "Tio Danito e esposa|2",
      "Prima Ana",
      "Vizinho Zé|1",
      "Amigo Sem Numero|quatro",
      "",
    ].join("\n"),
  );

  const okPrepare = await new ConviteTokenAdapter().prepare(stagingDir, SLUG, {}, URL_ALVO);
  assert.equal(okPrepare, true);

  const payload = lerGuests();
  const g = porNome(payload.guests);
  assert.deepEqual(g["Família Gabo"].value, { name: "Família Gabo", pax: 4 });
  assert.deepEqual(g["Tio Danito e esposa"].value, { name: "Tio Danito e esposa", pax: 2 });
  assert.equal(g["Prima Ana"].value, "Prima Ana");
  assert.equal(g["Vizinho Zé"].value, "Vizinho Zé", "pax 1 é gravado como string");
  assert.equal(g["Amigo Sem Numero"].value, "Amigo Sem Numero", "|inválido cai pra 1 pessoa");
  assert.equal(Object.keys(payload.guests).length, 6);

  // o fetch do guests.json foi reescrito pro basePath do site
  const src = readFileSync(join(stagingDir, "src", "lib", "guest.tsx"), "utf8");
  assert.match(src, /"\/casamento\/mateus-rose\/guests\.json"/);

  // arquivo de links traz o nº de pessoas só quando > 1
  const links = readFileSync(join(projectDir, "convidados-mateus-rose-links.txt"), "utf8");
  assert.match(links, /\?t=\w+ — Família Gabo \(4 pessoas\)/);
  assert.match(links, /\?t=\w+ — Prima Ana$/m);

  live = payload; // vira o "publicado" pro próximo deploy
});

test("redeploy: token preservado, pax alterado, novo convidado e rename", async () => {
  const antes = porNome(live.guests);
  novoStaging();

  lista(
    [
      "Família Gabo|6", // mesmo convidado, pax mudou
      "Família Ferreira|4", // inalterado
      "Tio Danito e esposa", // sem |N → mantém o pax que está no ar
      "Prima Ana => Prima Ana e noivo|2", // rename + pax
      "Casal Novo|2", // novo
      "",
    ].join("\n"),
  );

  const okPrepare = await new ConviteTokenAdapter().prepare(stagingDir, SLUG, {}, URL_ALVO);
  assert.equal(okPrepare, true);

  const depois = porNome(lerGuests().guests);

  assert.equal(depois["Família Gabo"].token, antes["Família Gabo"].token, "token não pode mudar");
  assert.deepEqual(depois["Família Gabo"].value, { name: "Família Gabo", pax: 6 });

  assert.equal(
    depois["Tio Danito e esposa"].value.pax,
    2,
    "linha sem |N preserva o pax publicado",
  );

  assert.equal(
    depois["Prima Ana e noivo"].token,
    antes["Prima Ana"].token,
    "rename mantém o token",
  );
  assert.deepEqual(depois["Prima Ana e noivo"].value, { name: "Prima Ana e noivo", pax: 2 });

  assert.deepEqual(depois["Casal Novo"].value, { name: "Casal Novo", pax: 2 });
  assert.ok(depois["Casal Novo"].token);

  // convidados que sumiram do .txt continuam no ar (links já enviados valem)
  assert.ok(depois["Vizinho Zé"], "convidado antigo preservado");

  // só os novos vão pro -novos.txt
  const novos = readFileSync(join(projectDir, "convidados-mateus-rose-novos.txt"), "utf8");
  assert.match(novos, /— Casal Novo \(2 pessoas\)/);
  assert.doesNotMatch(novos, /Família Gabo/);
});

test("guests.json antigo (só strings) continua válido", async () => {
  live = {
    version: 1,
    generatedAt: new Date().toISOString(),
    site: SLUG,
    guests: { TOKENANTIGO01: "Convidado Legado" },
  };
  novoStaging();
  lista(["Convidado Legado|3", "Outro Legado", ""].join("\n"));

  const okPrepare = await new ConviteTokenAdapter().prepare(stagingDir, SLUG, {}, URL_ALVO);
  assert.equal(okPrepare, true);

  const g = porNome(lerGuests().guests);
  assert.equal(g["Convidado Legado"].token, "TOKENANTIGO01");
  assert.deepEqual(g["Convidado Legado"].value, { name: "Convidado Legado", pax: 3 });
  assert.equal(g["Outro Legado"].value, "Outro Legado");
});
