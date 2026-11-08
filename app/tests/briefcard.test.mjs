// Card do Brief Flow aplicado num convite.json: funde sem perder o desenho do modelo.
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aplicarCard, fundir, validarCard } from "../src/main/briefcard.ts";

const modelo = {
  noivos: { noiva: "", noivo: "" },
  meta: { titulo: "Convite de Casamento | X & Y" },
  data: "2026-01-01T00:00",
  tema: { destaque: "#5B6340" },
  eventos: { titulo: "Detalhes", itens: [
    { icone: "/assets/cerimonia-civil.svg", tipo: "Cerimônia Civil", local: "", detalhe: "", mapa: "" },
    { icone: "/assets/copo-dagua.svg", tipo: "Copo-d'água", local: "", detalhe: "", mapa: "" },
  ] },
  cronograma: { titulo: "Nosso Dia", itens: [{ icone: "/assets/a.svg", hora: "", label: "Cerimônia Civil" }] },
  pais: { titulo: "Bênção", noiva: ["a"], noivo: ["b"], centrarNomes: true },
};

const card = validarCard({
  formato: "criarte.briefcard", v: 1,
  casal: { noiva: "Elsa", noivo: "Bruno", slug: "elsa-bruno" },
  patch: {
    noivos: { noiva: "Elsa", noivo: "Bruno" },
    data: "2026-11-14T16:00",
    pais: { noiva: ["Acácio", "Flirnda"] },
    eventos: { itens: [{ tipo: "Copo-d'água", local: "Misara", detalhe: "Rua 15", mapa: "https://m/b" }] },
    cronograma: { itens: [{ hora: "16h00", label: "Cerimônia Civil" }, { hora: "20h00", label: "Jantar" }] },
  },
  pendentes: [{ campo: "musica.arquivo", motivo: "Escolher o áudio." }],
});

const r = fundir(modelo, card.patch);
assert.equal(r.tema.destaque, "#5B6340", "cor do modelo fica");
assert.equal(r.pais.titulo, "Bênção");
assert.equal(r.pais.centrarNomes, true);
assert.deepEqual(r.pais.noiva, ["Acácio", "Flirnda"]);
assert.deepEqual(r.pais.noivo, ["b"], "o que o card não traz fica");
assert.equal(r.eventos.titulo, "Detalhes");
assert.equal(r.eventos.itens.length, 1);
assert.equal(r.eventos.itens[0].icone, "/assets/copo-dagua.svg", "ícone pelo tipo");
assert.equal(r.cronograma.itens[1].icone, "/assets/a.svg", "sem par, herda o último");

// Sem par no modelo, o ícone vem do asset com o nome do item.
const procurar = (nome, suf) => ({ "jantar-nd": "/assets/abertura-do-jantar-nd.svg", "copo-dagua": "/assets/copo-dagua.svg" })[nome === "jantar" ? "jantar-nd" : nome + suf] ?? null;
const r2 = fundir({ eventos: { itens: [{ icone: "/assets/cerimonia-civil.svg", tipo: "Cerimônia Civil" }] }, cronograma: { itens: [{ icone: "/assets/a.svg", label: "X" }] } },
  { eventos: { itens: [{ tipo: "Cerimônia Civil" }, { tipo: "Copo-d'água" }] }, cronograma: { itens: [{ hora: "20h00", label: "Jantar" }, { hora: "21h00", label: "Bolo" }] } }, "", procurar);
assert.deepEqual(r2.eventos.itens.map((e) => e.icone), ["/assets/cerimonia-civil.svg", "/assets/copo-dagua.svg"]);
assert.equal(r2.cronograma.itens[1].icone, "/assets/a.svg", "sem asset, cai na posição");

const dir = await mkdtemp(join(tmpdir(), "briefcard-"));
await writeFile(join(dir, "convite.json"), JSON.stringify(modelo));
const pend = await aplicarCard(dir, card);
const gravado = JSON.parse(await readFile(join(dir, "convite.json"), "utf8"));
assert.equal(gravado.meta.titulo, "Convite de Casamento | Elsa & Bruno");
assert.deepEqual(pend, ["Escolher o áudio."]);

assert.throws(() => validarCard({ formato: "outro" }), /não é um card/);
console.log("briefcard: ok");
