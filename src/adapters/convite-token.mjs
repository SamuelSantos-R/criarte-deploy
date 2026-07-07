// ============================================================================
// CONVITE-TOKEN ADAPTER — Convite de casamento com token único por convidado
// ============================================================================
// Cada convidado recebe um link /<cat>/<slug>?t=<TOKEN>. O convite roda 100%
// client-side: lê ?t da URL, busca em guests.json (mapa token→nome) e só habilita
// o RSVP se o token existir. Identidade vem do token, nunca de input do usuário —
// intruso com o link não consegue inserir outro nome nem se passar por convidado.
//
// Papel do CLI (aqui):
//   1. Ler um .txt com 1 convidado por linha.
//   2. Gerar um token curto e aleatório pra cada um.
//   3. Escrever public/guests.json no staging (antes do build).
//   4. Reescrever o fetch("/guests.json") pra respeitar o basePath do site.
//   5. Cuspir um .txt (nome — link) na pasta do convite, pronto pro WhatsApp.
// ============================================================================
import { BaseAdapter } from "./base.mjs";
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from "node:fs";
import { join, extname, isAbsolute, resolve } from "node:path";
import { randomInt } from "node:crypto";
import { info, warn, err, c, ok as okLog } from "../lib/config.mjs";

const TOKEN_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const TOKEN_LENGTH = 12;
const GUEST_FILE_CANDIDATES = ["convidados.txt", "guests.txt", "lista.txt", "lista-convidados.txt"];

export class ConviteTokenAdapter extends BaseAdapter {
  name = "convite-token";

  detect(stagingDir) {
    const configPath = join(stagingDir, "criarte.config.json");
    if (existsSync(configPath)) {
      try {
        const cfg = JSON.parse(readFileSync(configPath, "utf8"));
        if (cfg.base === "convite-token") return true;
      } catch {}
    }
    // Heurística: base traz o sistema de token por convidado
    const hasGuestLib =
      existsSync(join(stagingDir, "src", "lib", "guest.tsx")) ||
      existsSync(join(stagingDir, "src", "lib", "guest.ts"));
    const hasGuestExample = existsSync(join(stagingDir, "public", "guests.example.json"));
    return hasGuestLib && hasGuestExample;
  }

  getRemovePatterns() {
    return ["app/api", "src/app/api", "pages/api", "src/pages/api", "src/lib/d1.ts", "src/lib/auth.ts"];
  }

  getMessages() {
    return {
      deployPhase: "🎟️  Publicar convite",
      summaryLabel: "Convite",
      baseLabel: "🎟️  Base convite-token detectada",
      autoSub: "gera tokens + guests.json por convidado",
    };
  }

  /**
   * Monta o guests.json do convite fazendo MERGE com o que já está publicado:
   * convidados que já existem mantêm o mesmo token (o link já enviado continua
   * valendo), nomes novos ganham token novo e `Antigo => Novo` renomeia sem
   * trocar o token. `--guests-reset` força regenerar tudo (quebra links antigos).
   */
  async prepare(stagingDir, fullSlug, _config, targetUrl) {
    const projectDir = process.cwd();
    const reset = /^(1|true|yes)$/i.test(process.env.CRIARTE_GUESTS_RESET || "");

    // Estado atual (token→nome): o registro local `convidados-<slug>-links.txt`
    // é a fonte primária (o que foi gerado/enviado nesta máquina), com o
    // guests.json do site no ar como fallback. Em reset, ignora e começa do zero.
    const existing = reset ? {} : await loadExistingGuests(projectDir, targetUrl, fullSlug);
    const existingCount = Object.keys(existing).length;

    // 1) Resolve o arquivo de convidados (flag → auto-detect → prompt)
    const guestFile = await resolveGuestFile(projectDir);
    if (!guestFile) {
      // Sem lista nova: preserva o que já está no ar em vez de zerar — um redeploy
      // de design não pode apagar os convidados/tokens já distribuídos.
      if (existingCount > 0) {
        writeGuestsJson(stagingDir, fullSlug, existing);
        const rewritten = rewriteGuestsFetch(stagingDir, fullSlug);
        okLog(`${existingCount} convidado(s) preservado(s) do site no ar (nenhuma lista nova informada).`);
        if (rewritten > 0) info(`fetch do guests.json reescrito em ${rewritten} arquivo(s) pro basePath /${fullSlug}/`);
        return true;
      }
      // Nada no ar tampouco: remove guests.json stale (ex.: o de dev commitado na
      // base) pra NÃO vazar tokens de teste — site sobe em prévia.
      const stale = join(stagingDir, "public", "guests.json");
      if (existsSync(stale)) { rmSync(stale, { force: true }); }
      warn("Nenhuma lista de convidados e nada publicado — guests.json NÃO foi gerado.");
      info(`O convite vai subir só em modo prévia. Rode de novo com ${c.cyan}--guests-file <arquivo.txt>${c.reset} pra ativar os tokens.`);
      return true;
    }

    // 2) Lê o .txt: nomes soltos (add) + diretivas `Antigo => Novo` (rename)
    let adds, renames;
    try {
      ({ adds, renames } = parseGuestList(readFileSync(guestFile, "utf8")));
    } catch (e) {
      err(`Falha ao ler ${guestFile}: ${e.message}`);
      return false;
    }
    if (adds.length === 0 && renames.length === 0 && existingCount === 0) {
      err(`Lista de convidados vazia em ${guestFile}.`);
      return false;
    }

    // 3) Merge. Parte do estado atual e aplica renomes + adições.
    const guests = { ...existing }; // token → nome
    const seen = new Set(Object.keys(guests));
    const nameToToken = new Map();
    for (const [tok, nm] of Object.entries(guests)) nameToToken.set(normName(nm), tok);

    const newRows = [];   // { name, token } — só os novos, pra o .txt de novos
    const renamed = [];   // { from, to }
    const renameMisses = [];

    for (const { from, to } of renames) {
      const tok = nameToToken.get(normName(from));
      if (tok) {
        guests[tok] = to;
        nameToToken.delete(normName(from));
        nameToToken.set(normName(to), tok);
        renamed.push({ from, to });
      } else {
        // Antigo não encontrado no site: trata o "novo" como convidado novo.
        const t = genUniqueToken(seen);
        guests[t] = to;
        nameToToken.set(normName(to), t);
        newRows.push({ name: to, token: t });
        renameMisses.push(from);
      }
    }

    for (const name of adds) {
      if (nameToToken.has(normName(name))) continue; // já existe → mantém token
      const t = genUniqueToken(seen);
      guests[t] = name;
      nameToToken.set(normName(name), t);
      newRows.push({ name, token: t });
    }

    // 4) Escreve public/guests.json + reescreve o fetch pro basePath
    const generatedAt = writeGuestsJson(stagingDir, fullSlug, guests);
    const rewritten = rewriteGuestsFetch(stagingDir, fullSlug);

    // 5) Cospe os .txt de links na pasta do projeto (prontos pro WhatsApp).
    //    O link PRECISA carregar o fullSlug no path, senão o convidado cai no
    //    root do domínio e o convite não abre.
    const domain = targetUrl.replace(/\/$/, "");
    const base = domain.endsWith(`/${fullSlug}`) ? domain : `${domain}/${fullSlug}`;
    const slug = fullSlug.split("/").pop();
    const allRows = Object.entries(guests).map(([token, name]) => ({ name, token }));

    const fullPath = join(projectDir, `convidados-${slug}-links.txt`);
    writeFileSync(fullPath, renderLinks(
      `# Links de convite — ${fullSlug} (lista completa)`,
      generatedAt, base, allRows,
    ));

    // Só os novos: evita reenviar quem já recebeu.
    let novosPath = null;
    if (newRows.length > 0 && (existingCount > 0 || renamed.length > 0)) {
      novosPath = join(projectDir, `convidados-${slug}-novos.txt`);
      writeFileSync(novosPath, renderLinks(
        `# Links NOVOS — ${fullSlug} (só os adicionados agora)`,
        generatedAt, base, newRows,
      ));
    }

    // 6) Resumo
    okLog(`${allRows.length} convidado(s) no total → ${c.bold}public/guests.json${c.reset}`);
    if (reset) {
      warn(`--guests-reset: TODOS os ${allRows.length} tokens foram regenerados — os links antigos deixaram de funcionar.`);
    } else {
      const kept = allRows.length - newRows.length;
      info(`Merge: ${c.bold}${newRows.length}${c.reset} novo(s), ${c.bold}${renamed.length}${c.reset} renomeado(s), ${c.bold}${kept}${c.reset} preservado(s) (token intacto).`);
    }
    for (const r of renamed) info(`  renomeado: ${c.dim}${r.from}${c.reset} → ${c.bold}${r.to}${c.reset} ${c.dim}(mesmo link)${c.reset}`);
    for (const m of renameMisses) warn(`  rename "${m} => ..." ignorado: "${m}" não existe no site — o novo nome virou convidado novo (link novo).`);
    if (rewritten > 0) info(`fetch do guests.json reescrito em ${rewritten} arquivo(s) pro basePath /${fullSlug}/`);
    info(`Lista completa: ${c.brand}${fullPath}${c.reset}`);
    if (novosPath) info(`Só os novos (pra mandar no WhatsApp): ${c.brand}${novosPath}${c.reset}`);

    return true;
  }
}

// ============================================================================
// Utilitários
// ============================================================================

function genToken() {
  let s = "";
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    s += TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)];
  }
  return s;
}

function genUniqueToken(seen) {
  let t;
  do { t = genToken(); } while (seen.has(t));
  seen.add(t);
  return t;
}

// Normaliza nome pra comparar identidade entre deploys (case/espaço-insensível).
function normName(s) {
  return String(s).toLowerCase().replace(/\s+/g, " ").trim();
}

// Separa nomes soltos (add) de diretivas de rename `Antigo => Novo`.
function parseGuestList(txt) {
  const adds = [];
  const renames = [];
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const arrow = line.indexOf("=>");
    if (arrow >= 0) {
      const from = line.slice(0, arrow).trim();
      const to = line.slice(arrow + 2).trim();
      if (from && to) { renames.push({ from, to }); continue; }
    }
    adds.push(line);
  }
  return { adds, renames };
}

// Fonte do estado atual: local primeiro (registro do que foi enviado desta
// máquina), site no ar como fallback. {} = primeiro deploy → gera do zero.
async function loadExistingGuests(projectDir, targetUrl, fullSlug) {
  const slug = fullSlug.split("/").pop();
  const local = loadLocalLinks(projectDir, slug);
  if (Object.keys(local).length > 0) {
    info(`Estado atual lido de ${c.brand}convidados-${slug}-links.txt${c.reset} (${Object.keys(local).length} convidado(s)).`);
    return local;
  }
  const live = await loadLiveGuests(targetUrl, fullSlug);
  if (Object.keys(live).length > 0) {
    info(`Estado atual lido do site no ar (${Object.keys(live).length} convidado(s)).`);
  }
  return live;
}

// Lê convidados-<slug>-links.txt (linhas "URL?t=TOKEN — Nome") → {token: nome}.
function loadLocalLinks(projectDir, slug) {
  const out = {};
  const file = join(projectDir, `convidados-${slug}-links.txt`);
  if (!existsSync(file)) return out;
  try {
    for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const m = line.match(/\?t=([A-Za-z0-9]+)\s*[—-]\s*(.+?)\s*$/);
      if (m) out[m[1]] = m[2].trim();
    }
  } catch {}
  return out;
}

// Puxa o guests.json publicado (token→nome). Retorna {} se não houver/erro —
// primeiro deploy ou site fora do ar caem em geração do zero, sem quebrar.
async function loadLiveGuests(targetUrl, fullSlug) {
  const domain = (targetUrl || "").replace(/\/$/, "");
  if (!domain) return {};
  const base = domain.endsWith(`/${fullSlug}`) ? domain : `${domain}/${fullSlug}`;
  const url = `${base}/guests.json?_=${Date.now()}`;
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "Cache-Control": "no-cache" },
    });
    if (!r.ok) return {};
    const data = await r.json();
    if (data && data.guests && typeof data.guests === "object") return { ...data.guests };
    return {};
  } catch {
    return {};
  }
}

// Escreve public/guests.json no staging. Devolve o generatedAt usado.
function writeGuestsJson(stagingDir, fullSlug, guests) {
  const publicDir = join(stagingDir, "public");
  mkdirSync(publicDir, { recursive: true });
  const generatedAt = new Date().toISOString();
  const payload = { version: 1, generatedAt, site: fullSlug, guests };
  writeFileSync(join(publicDir, "guests.json"), JSON.stringify(payload, null, 2) + "\n");
  return generatedAt;
}

function renderLinks(header, generatedAt, base, rows) {
  return [
    header,
    `# Gerado em ${generatedAt}`,
    `# ${rows.length} convidado(s). Um link por convidado, único e intransferível.`,
    "",
    ...rows.map((r) => `${base}?t=${r.token} — ${r.name}`),
    "",
  ].join("\n");
}

async function resolveGuestFile(projectDir) {
  // a) flag --guests-file <path> (repassada via env pelo cmdDirectDeploy)
  const fromFlag = (process.env.CRIARTE_GUESTS_FILE || "").trim();
  if (fromFlag) {
    const abs = isAbsolute(fromFlag) ? fromFlag : resolve(projectDir, fromFlag);
    if (existsSync(abs)) return abs;
    err(`--guests-file: arquivo não encontrado em ${abs}`);
    return null;
  }

  // b) auto-detect na pasta do projeto
  for (const cand of GUEST_FILE_CANDIDATES) {
    const abs = join(projectDir, cand);
    if (existsSync(abs)) {
      info(`Lista de convidados encontrada: ${c.brand}${cand}${c.reset}`);
      return abs;
    }
  }

  // c) prompt interativo
  const readline = await import("node:readline");
  const ask = createAsk(readline.default);
  console.log();
  console.log(`  ${c.bold}→ Lista de convidados (.txt, 1 por linha)${c.reset}`);
  console.log(`    ${c.dim}Cada linha vira um token único. Deixe vazio pra subir só em prévia.${c.reset}`);
  const answer = (await ask(`    Caminho do .txt → `)).trim();
  if (!answer) return null;
  const abs = isAbsolute(answer) ? answer : resolve(projectDir, answer);
  if (!existsSync(abs)) {
    err(`Arquivo não encontrado em ${abs}`);
    return null;
  }
  return abs;
}

function rewriteGuestsFetch(stagingDir, fullSlug) {
  const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
  const target = `/${fullSlug}/guests.json`;
  // Casa fetch("/guests.json"), fetch('/guests.json', ...), com ou sem query
  const re = /(["'`])\/guests\.json(\?[^"'`]*)?\1/g;
  let touched = 0;
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!EXTS.has(extname(e.name))) continue;
      const content = readFileSync(full, "utf8");
      const next = content.replace(re, (_m, q, query) => `${q}${target}${query || ""}${q}`);
      if (next !== content) { writeFileSync(full, next); touched++; }
    }
  })(stagingDir);
  return touched;
}

function createAsk(rl) {
  return (question, { default: def } = {}) =>
    new Promise((resolve) => {
      const iface = rl.createInterface({ input: process.stdin, output: process.stdout });
      let done = false;
      const finish = (v) => { if (done) return; done = true; iface.close(); resolve(v); };
      // stdin sem TTY (EOF/CI): 'close' dispara sem resposta → resolve vazio em vez de pendurar
      iface.on("close", () => finish(def || ""));
      iface.question(question, (answer) => finish(answer || def || ""));
    });
}
