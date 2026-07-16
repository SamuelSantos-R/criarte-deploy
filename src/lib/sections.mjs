// ============================================================================
// SECTIONS — Lista as sections do convite e permite desabilitar antes do deploy
// ============================================================================
// O convite compõe a home num único return JSX (ex: <Hero/> <RSVP/> ...). Aqui
// a gente lê esse arquivo, extrai os componentes de seção top-level e, pros que
// o usuário desmarcar, comenta a linha no STAGING (nunca no source original) —
// o build no servidor sobe o convite sem aquela seção.
//
// Conservador de propósito: só mexe em componentes JSX self-closing top-level
// dentro do return da home. Não toca em wrappers (<main>), providers, nem em
// componentes com children. Se não achar um page.tsx reconhecível, não faz nada.
// ============================================================================
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PAGE_CANDIDATES = [
  ["src", "app", "page.tsx"],
  ["app", "page.tsx"],
  ["src", "app", "page.jsx"],
  ["app", "page.jsx"],
  ["src", "pages", "index.tsx"],
  ["pages", "index.tsx"],
];

// Componentes que são infra/UX, não "seções" que faça sentido desligar. Some da
// lista mostrada pra não confundir a pessoa (áudio, partículas, loader, etc).
const NON_SECTION = new Set([
  "BackgroundParticles", "EnvelopeLoader", "MuteButton", "AudioPlayer",
  "GoldLine", "Section", "Portal", "Analytics", "SpeedInsights",
]);

export function findPageFile(dir) {
  for (const parts of PAGE_CANDIDATES) {
    const p = join(dir, ...parts);
    if (existsSync(p)) return p;
  }
  return null;
}

// Extrai os componentes self-closing top-level do PRIMEIRO return(...) do arquivo.
// Retorna [{ name, raw }] na ordem em que aparecem, sem os NON_SECTION.
export function listSections(pageFile) {
  let src;
  try { src = readFileSync(pageFile, "utf8"); } catch { return []; }

  // Isola o corpo do primeiro return ( ... ) — o JSX da home.
  const retIdx = src.search(/return\s*\(/);
  if (retIdx === -1) return [];
  const bodyStart = src.indexOf("(", retIdx);
  const body = sliceBalanced(src, bodyStart);
  if (!body) return [];

  // <Componente ... /> self-closing. Nome tem que começar com maiúscula (componente).
  const re = /<([A-Z][A-Za-z0-9_]*)\b[^>]*\/>/g;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(body))) {
    const name = m[1];
    if (NON_SECTION.has(name)) continue;
    if (seen.has(name)) continue; // uma section só aparece uma vez na home
    seen.add(name);
    out.push({ name, raw: m[0] });
  }
  return out;
}

// Comenta no conteúdo do arquivo as sections cujos nomes estão em `disableNames`.
// Envolve a tag num bloco JSX comentado ({/* <X/> desativado via Criarte Deploy */}).
// Retorna { content, disabled: [nomes efetivamente comentados] }.
export function disableSections(pageContent, disableNames) {
  if (!disableNames || disableNames.length === 0) return { content: pageContent, disabled: [] };
  const want = new Set(disableNames);
  const disabled = [];
  const re = /<([A-Z][A-Za-z0-9_]*)\b[^>]*\/>/g;
  const content = pageContent.replace(re, (full, name) => {
    if (!want.has(name)) return full;
    disabled.push(name);
    return `{/* ${full} — desativado via Criarte Deploy */}`;
  });
  return { content, disabled };
}

// Aplica direto num arquivo do staging. Retorna a lista de sections desativadas.
export function applyDisableToFile(pageFile, disableNames) {
  const content = readFileSync(pageFile, "utf8");
  const { content: next, disabled } = disableSections(content, disableNames);
  if (disabled.length > 0) writeFileSync(pageFile, next);
  return disabled;
}

// Recorta uma expressão parentizada balanceada a partir do índice do "(".
function sliceBalanced(src, openIdx) {
  if (src[openIdx] !== "(") return null;
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return src.slice(openIdx + 1, i);
    }
  }
  return null;
}
