// Teste do auto-update: comparação de versão e os caminhos que NÃO podem
// instalar nada (versão igual, sem TTY, desligado por env).
// Roda com: node --test tests/
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { autoUpdate, isNewer } from "../src/lib/update.mjs";
import { VERSION } from "../src/lib/config.mjs";

let fetchAntes, logAntes, saida;
let remoteVersion = VERSION;

before(() => {
  fetchAntes = globalThis.fetch;
  logAntes = console.log;
  console.log = (s) => saida.push(String(s));
  globalThis.fetch = async (url) => {
    assert.match(String(url), /raw\.githubusercontent\.com/);
    return { ok: true, status: 200, json: async () => ({ version: remoteVersion }) };
  };
});

after(() => {
  globalThis.fetch = fetchAntes;
  console.log = logAntes;
});

beforeEach(() => {
  saida = [];
  remoteVersion = VERSION;
  delete process.env.CRIARTE_NO_UPDATE;
  delete process.env.CRIARTE_UPDATED;
});

test("isNewer compara número a número, não texto", () => {
  assert.equal(isNewer("4.10.0", "4.9.1"), true);
  assert.equal(isNewer("4.4.0", "4.3.0"), true);
  assert.equal(isNewer("5.0.0", "4.99.99"), true);
  assert.equal(isNewer("4.3.0", "4.3.0"), false);
  assert.equal(isNewer("4.2.9", "4.3.0"), false);
});

test("versão igual: não avisa nada", async () => {
  await autoUpdate({ interactive: false });
  assert.equal(saida.length, 0);
});

test("versão nova sem TTY: só avisa, nunca instala", async () => {
  remoteVersion = "99.0.0";
  await autoUpdate({ interactive: false });
  const txt = saida.join("\n");
  assert.match(txt, /99\.0\.0/);
  assert.match(txt, /npm i -g github:/);
});

test("CRIARTE_NO_UPDATE desliga a checagem", async () => {
  remoteVersion = "99.0.0";
  process.env.CRIARTE_NO_UPDATE = "1";
  await autoUpdate({ interactive: true });
  assert.equal(saida.length, 0);
});

test("CRIARTE_UPDATED evita loop de re-execução", async () => {
  remoteVersion = "99.0.0";
  process.env.CRIARTE_UPDATED = "1";
  await autoUpdate({ interactive: true });
  assert.equal(saida.length, 0);
});

test("servidor fora do ar não quebra nem avisa", async () => {
  const antes = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("fetch failed"); };
  await autoUpdate({ interactive: true });
  assert.equal(saida.length, 0);
  globalThis.fetch = antes;
});
