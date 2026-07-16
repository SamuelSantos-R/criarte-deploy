// ============================================================================
// DETECT — Detecta a BASE (estrutural) e sugere a CATEGORIA (por conteúdo)
// ============================================================================
// A base é estrutural e confiável (arquivos-marcadores no source):
//   rsvp          → tem d1.ts ou api/criar-confirmacao
//   convite-token → tem src/lib/guest.tsx|ts + public/guests.example.json
//   casamento     → projeto Next de convite (sem marcadores acima)
//   generico      → não parece um convite Next
//
// A categoria NÃO é estrutural: chá, noivado e casamento são o MESMO projeto
// Next, mudam só no conteúdo. Então varremos o texto das sections por palavras-
// chave pra SUGERIR a categoria — o usuário sempre pode trocar ou personalizar.
//
// "personalizada" = o convite tem tokenização por convidado (base convite-token).
// ============================================================================
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

// Marcadores estruturais de cada base (relativos à raiz do projeto).
function hasRsvpMarkers(dir) {
  return (
    existsSync(join(dir, "src", "lib", "d1.ts")) ||
    existsSync(join(dir, "src", "app", "api", "criar-confirmacao")) ||
    existsSync(join(dir, "app", "api", "criar-confirmacao")) ||
    existsSync(join(dir, "src", "pages", "api", "criar-confirmacao"))
  );
}

function hasTokenMarkers(dir) {
  const hasGuestLib =
    existsSync(join(dir, "src", "lib", "guest.tsx")) ||
    existsSync(join(dir, "src", "lib", "guest.ts"));
  const hasGuestExample = existsSync(join(dir, "public", "guests.example.json"));
  return hasGuestLib && hasGuestExample;
}

function isNextProject(dir) {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    return !!(pkg.dependencies?.next || pkg.devDependencies?.next);
  } catch {
    return false;
  }
}

// Config explícito manda: criarte.config.json { base, category }.
function readConfig(dir) {
  const p = join(dir, "criarte.config.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// Dica de categoria por CONTEÚDO — varre poucos arquivos de texto do source.
// ----------------------------------------------------------------------------
// Ordem importa: a primeira categoria com pelo menos 1 hit vence. Chá antes de
// casamento porque um chá quase sempre também fala em "casamento"/"noivos".
const CATEGORY_KEYWORDS = [
  { category: "cha-de-panela", label: "chá", terms: [/ch[áa]\s+de\s+panela/i, /ch[áa]\s+de\s+casa\s+nova/i, /ch[áa]\s+bar/i, /lista\s+de\s+presentes/i, /ch[áa]\s+de\s+cozinha/i] },
  { category: "cha-de-bebe", label: "chá de bebê", terms: [/ch[áa]\s+de\s+beb[êe]/i, /ch[áa]\s+de\s+fralda/i, /ch[áa]\s+revela[çc][ãa]o/i] },
  { category: "debutante", label: "debutante", terms: [/debutante/i, /15\s*anos/i, /quinze\s+anos/i, /meus?\s+15/i] },
  { category: "noivado", label: "noivado", terms: [/noivado/i, /pedido\s+de\s+casamento/i, /nos\s+noivamos/i] },
  { category: "aniversario", label: "aniversário", terms: [/anivers[áa]rio/i, /bodas/i] },
  { category: "casamento", label: "casamento", terms: [/casamento/i, /nosso\s+cas[óo]rio/i, /os\s+noivos/i, /save\s+the\s+date/i, /dia\s+do\s+sim/i] },
];

// Arquivos onde o conteúdo do convite costuma viver.
const TEXT_EXTS = new Set([".tsx", ".ts", ".jsx", ".js", ".json", ".md"]);
const SCAN_IGNORE = new Set(["node_modules", ".next", "out", ".git", "dist", ".turbo", "fonts", "assets"]);
const SCAN_MAX_FILES = 120;
const SCAN_MAX_BYTES = 200 * 1024; // ignora arquivos gigantes (bundles/lock)

function collectText(dir) {
  const chunks = [];
  let count = 0;
  (function walk(d, depth) {
    if (count >= SCAN_MAX_FILES || depth > 5) return;
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (count >= SCAN_MAX_FILES) return;
      if (e.name.startsWith(".") || SCAN_IGNORE.has(e.name)) continue;
      const full = join(d, e.name);
      if (e.isDirectory()) { walk(full, depth + 1); continue; }
      if (!TEXT_EXTS.has(extname(e.name))) continue;
      try {
        if (statSync(full).size > SCAN_MAX_BYTES) continue;
        chunks.push(readFileSync(full, "utf8"));
        count++;
      } catch {}
    }
  })(dir, 0);
  return chunks.join("\n");
}

function guessCategory(dir) {
  const text = collectText(dir);
  if (!text) return null;
  for (const { category, label, terms } of CATEGORY_KEYWORDS) {
    if (terms.some((re) => re.test(text))) return { category, label };
  }
  return null;
}

// Mapa base → categoria/label default quando o conteúdo não dá pista.
const BASE_DEFAULT = {
  rsvp: { category: "rsvp", label: "RSVP" },
  "convite-token": { category: "casamento", label: "casamento" },
  casamento: { category: "casamento", label: "casamento" },
  generico: { category: null, label: "site" },
};

/**
 * Detecta base + sugere categoria a partir do diretório-fonte.
 * Retorna:
 *   base          — "rsvp" | "convite-token" | "casamento" | "generico"
 *   personalizado — true se tem tokenização por convidado
 *   category      — categoria sugerida (pode ser null pra genérico)
 *   label         — texto pronto pro header, ex: "base de chá personalizada detectada"
 *   fromConfig    — true se veio de criarte.config.json explícito
 */
export function detectBaseInfo(dir) {
  const cfg = readConfig(dir);

  // 1) Base estrutural (config explícito > marcadores)
  let base;
  if (cfg?.base && BASE_DEFAULT[cfg.base]) base = cfg.base;
  else if (hasRsvpMarkers(dir)) base = "rsvp";
  else if (hasTokenMarkers(dir)) base = "convite-token";
  else if (isNextProject(dir)) base = "casamento";
  else base = "generico";

  const personalizado = base === "convite-token" || hasTokenMarkers(dir);

  // 2) Categoria: config explícito > dica por conteúdo > default da base
  let category = null;
  let catLabel = null;
  if (cfg?.category) {
    category = String(cfg.category).toLowerCase();
    catLabel = category.replace(/-/g, " ");
  } else if (base !== "rsvp") {
    const guessed = guessCategory(dir);
    if (guessed) { category = guessed.category; catLabel = guessed.label; }
  }
  if (!category) {
    const def = BASE_DEFAULT[base];
    category = def.category;
    catLabel = def.label;
  }

  // 3) Label do header: "base de <categoria> [personalizada] detectada"
  const subject = base === "rsvp" ? "RSVP" : (catLabel || "site");
  const perso = personalizado ? " personalizada" : "";
  const label = `base de ${subject}${perso} detectada`;

  return { base, personalizado, category, label, fromConfig: !!cfg?.base };
}
