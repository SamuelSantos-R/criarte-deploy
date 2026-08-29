// ============================================================================
// HARNESS — mede o quanto um convite já está pronto pra ser editado no Studio
// ============================================================================
// O Studio só consegue repintar um convite se TODA cor sair de um token do
// bloco `tema` do convite.json. Um único `#B08A4A` solto num componente é uma
// cor que o cliente não consegue trocar, e um `filter: invert()...` de recolor
// de SVG é pior: a receita é numérica e só acerta uma cor de destino.
//
// Este módulo só LÊ e devolve dados. Quem imprime é o cli.mjs, e ninguém edita
// o código do convite — mesma doutrina do `tokenizar`: detecta e ensina.
// ============================================================================
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname, extname, relative, sep } from "node:path";

// Paleta da casa: os convites de casamento reusam as mesmas cores, então um hex
// solto quase sempre já tem nome em outro convite. Serve pra sugerir o nome
// certo em vez de inventar "ouro-2" — nunca pra impor cor.
const PALETAS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates", "tema");

const EXTS = new Set([".tsx", ".ts", ".jsx", ".js", ".css"]);
const IGNORAR = new Set(["node_modules", ".next", "out", ".git", "dist", "build", ".turbo", ".vercel"]);
const MAX_BYTES = 400 * 1024;

const RE_HEX = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
// `rgb(var(--c-x))` é o jeito certo; o que importa aqui é rgb/rgba com número cru.
const RE_RGBA = /\brgba?\(\s*\d/g;
// Vale tanto pro CSS (`filter: ...;`) quanto pro objeto de style em JSX
// (`filter: "..."`), por isso aspas entram: barrar `"` fazia o casamento parar
// na abertura da string e dava ✓ falso em convite cheio de recolor.
const RE_FILTRO = /filter\s*:\s*["'`]?([^;}\n]*\b(?:invert|sepia|hue-rotate)\s*\([^;}\n]*)/;

function varrer(dir) {
  const arquivos = [];
  (function walk(d, depth) {
    if (depth > 6) return;
    let entradas;
    try { entradas = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entradas) {
      if (e.name.startsWith(".") || IGNORAR.has(e.name)) continue;
      const full = join(d, e.name);
      if (e.isDirectory()) { walk(full, depth + 1); continue; }
      if (!EXTS.has(extname(e.name))) continue;
      try {
        if (statSync(full).size > MAX_BYTES) continue;
        arquivos.push({ caminho: full, texto: readFileSync(full, "utf8") });
      } catch {}
    }
  })(dir, 0);
  return arquivos;
}

function expandir(hex) {
  const h = hex.slice(1);
  return (h.length === 3 ? h.replace(/./g, (x) => x + x) : h).toUpperCase();
}

/** Dica de família por matiz/claridade. É palpite pra dar nome, não semântica. */
function familia(hex) {
  const h = expandir(hex);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 0.06) return l > 0.85 ? "creme" : l < 0.25 ? "tinta" : "neutro";
  let matiz;
  if (max === r) matiz = ((g - b) / d + 6) % 6;
  else if (max === g) matiz = (b - r) / d + 2;
  else matiz = (r - g) / d + 4;
  matiz *= 60;
  if (matiz < 20 || matiz >= 330) return "rosa";
  if (matiz < 45) return l > 0.7 ? "creme" : "terracota";
  if (matiz < 70) return l > 0.75 ? "ouro-claro" : "ouro";
  if (matiz < 160) return "verde";
  if (matiz < 260) return "azul";
  return "roxo";
}

function lerJson(caminho) {
  if (!existsSync(caminho)) return null;
  try { return JSON.parse(readFileSync(caminho, "utf8")); } catch { return null; }
}

function indexar(mapa, destino) {
  for (const [nome, v] of Object.entries(mapa ?? {})) {
    if (typeof v === "string" && /^#[0-9a-fA-F]{3,6}$/.test(v) && !destino.has(expandir(v))) {
      destino.set(expandir(v), nome);
    }
  }
}

/**
 * Varre o convite e devolve o laudo.
 *   provas     — checagens estruturais, cada uma "ok" | "falta" | "aviso"
 *   hex        — cores achadas, da mais repetida pra menos
 *   conhecidos — sem token no convite, mas já nomeadas na paleta da casa
 *   ineditos   — sem nome em lugar nenhum; só essas precisam de decisão humana
 *   filtros    — recolors de SVG que travam a troca de cor
 *   sugestao   — bloco `tema` pronto pra colar
 */
export function analisarTema(dir, { paleta = "casamento" } = {}) {
  const arquivos = varrer(dir);
  const convite = lerJson(join(dir, "convite.json"));
  const tema = convite && typeof convite.tema === "object" && convite.tema ? convite.tema : null;

  // hex → nome do token. O tema do próprio convite manda; a paleta da casa só
  // preenche o que ele ainda não nomeou.
  const porHex = new Map();
  indexar(tema, porHex);
  const daCasa = new Map();
  indexar(lerJson(join(PALETAS, `${paleta}.json`)), daCasa);

  const achados = new Map();
  let rgba = 0;
  const filtros = [];

  for (const { caminho, texto } of arquivos) {
    const rel = relative(dir, caminho).split(sep).join("/");
    for (const bruto of texto.match(RE_HEX) ?? []) {
      const chave = expandir(bruto);
      const item = achados.get(chave) ?? { valor: `#${chave}`, ocorrencias: 0, arquivos: new Set() };
      item.ocorrencias++;
      item.arquivos.add(rel);
      achados.set(chave, item);
    }
    rgba += (texto.match(RE_RGBA) ?? []).length;
    texto.split("\n").forEach((linha, i) => {
      const m = linha.match(RE_FILTRO);
      if (!m) return;
      const receita = m[1].replace(/["'`].*$/, "").trim();
      // `brightness(0)` achata a origem em silhueta: a receita inteira existe só
      // pra pintar de uma cor fixa, então trocar o token não muda nada.
      filtros.push({ arquivo: rel, linha: i + 1, receita, total: /brightness\(\s*0\s*\)/.test(receita) });
    });
  }

  const hex = [...achados.entries()]
    .map(([chave, item]) => ({
      valor: item.valor,
      ocorrencias: item.ocorrencias,
      arquivos: [...item.arquivos].sort(),
      token: porHex.get(chave) ?? null,
      daCasa: porHex.has(chave) ? null : daCasa.get(chave) ?? null,
      familia: familia(item.valor),
    }))
    .sort((a, b) => b.ocorrencias - a.ocorrencias || a.valor.localeCompare(b.valor));

  const soltos = hex.filter((h) => !h.token);
  const conhecidos = soltos.filter((h) => h.daCasa);
  const ineditos = soltos.filter((h) => !h.daCasa);

  // Nome do token: o da paleta da casa quando a cor é conhecida; senão a família
  // do matiz. Os nomes da casa entram primeiro e ficam com o nome limpo — senão
  // um palpite ("creme" pra #FFFFFF) rouba o nome de um token que já existe e a
  // cor original some do bloco sem ninguém ver.
  const sugestao = {};
  for (const h of conhecidos) sugestao[h.daCasa] = h.valor;
  for (const h of ineditos) {
    let nome = h.familia;
    for (let n = 2; nome in sugestao; n++) nome = `${h.familia}-${n}`;
    sugestao[nome] = h.valor;
  }

  const texto = (p) => (existsSync(join(dir, p)) ? readFileSync(join(dir, p), "utf8") : "");
  const globals = texto("src/app/globals.css") || texto("app/globals.css") || texto("src/styles/globals.css");
  const tailwind = texto("tailwind.config.ts") || texto("tailwind.config.js");
  const layout = texto("src/app/layout.tsx") || texto("app/layout.tsx");
  const nextCfg = texto("next.config.js") || texto("next.config.mjs") || texto("next.config.ts");

  const raizes = (globals.match(/--c-[a-z0-9-]+\s*:/g) ?? []).length;
  const estatico = /output\s*:\s*["']export["']/.test(nextCfg) && /images\s*:[\s\S]{0,120}unoptimized\s*:\s*true/.test(nextCfg);

  const provas = [
    { id: "convite", titulo: "convite.json na raiz", estado: convite ? "ok" : "falta",
      detalhe: convite ? null : "sem convite.json o Studio não tem o que editar" },
    { id: "tema", titulo: "bloco `tema` no convite.json", estado: tema ? "ok" : "falta",
      detalhe: tema ? `${Object.keys(tema).length} tokens` : "é daqui que o Studio lê a paleta" },
    { id: "vars", titulo: "fallback `--c-*` no :root", estado: raizes > 0 ? "ok" : "falta",
      detalhe: raizes > 0 ? `${raizes} vars` : "sem fallback, token faltando vira NaN NaN NaN" },
    { id: "tailwind", titulo: "tailwind lendo `rgb(var(--c-`", estado: /rgb\(var\(--c-/.test(tailwind) ? "ok" : "falta",
      detalhe: /<alpha-value>/.test(tailwind) ? null : "sem <alpha-value> as classes com /60 quebram" },
    { id: "injecao", titulo: "tema injetado no <html>", estado: /varsDoTema|--c-/.test(layout) ? "ok" : "falta",
      detalhe: null },
    { id: "hex", titulo: "cores soltas nos componentes", estado: soltos.length === 0 ? "ok" : "falta",
      detalhe: soltos.length === 0 ? null : `${soltos.length} hex fora do tema` },
    { id: "rgba", titulo: "rgb()/rgba() com número cru", estado: rgba === 0 ? "ok" : "aviso",
      detalhe: rgba === 0 ? null : `${rgba} ocorrências` },
    { id: "filtros", titulo: "ícone com cor presa em filter:", estado: filtros.length === 0 ? "ok" : "falta",
      detalhe: filtros.length === 0 ? null : `${filtros.length} — não seguem o token, use mask-image` },
    { id: "estatico", titulo: "next.config com export estático", estado: estatico ? "ok" : "aviso",
      detalhe: estatico ? null : "falta output:'export' e/ou images.unoptimized" },
  ];

  const pontos = provas.filter((p) => p.estado === "ok").length;
  return { dir, provas, pontos, total: provas.length, hex, soltos, conhecidos, ineditos, rgba, filtros, sugestao, arquivos: arquivos.length };
}
