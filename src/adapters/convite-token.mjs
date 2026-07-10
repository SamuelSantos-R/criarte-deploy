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

    // Estado atual (token→nome): o guests.json PUBLICADO é a fonte da verdade
    // (é o que os links já enviados usam). Local é só fallback offline.
    // Em reset, ignora e começa do zero.
    let existing = {};
    if (!reset) {
      const state = await loadExistingGuests(projectDir, targetUrl, fullSlug);
      existing = state.guests;
      if (!state.liveOk) {
        const proceed = await guardLiveUnreachable(_config, fullSlug, Object.keys(existing).length);
        if (!proceed) return false;
      }
    }
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
    let adds, renames, linkLines;
    try {
      ({ adds, renames, linkLines } = parseGuestList(readFileSync(guestFile, "utf8")));
    } catch (e) {
      err(`Falha ao ler ${guestFile}: ${e.message}`);
      return false;
    }
    // Guarda-corpo: se o arquivo apontado é na real um `-links.txt` (ou similar),
    // aborta em vez de gerar tokens novos com URLs no lugar dos nomes.
    if (linkLines.length > 0 && linkLines.length >= adds.length) {
      err(`${guestFile} parece ser um arquivo de LINKS, não uma lista de convidados (${linkLines.length} linha(s) com URL/token).`);
      info(`A lista de convidados é um .txt com ${c.bold}um nome por linha${c.reset} (ex.: "João e Maria"). Os links (convidados-<slug>-links.txt) são a SAÍDA, não a entrada.`);
      return false;
    }
    if (linkLines.length > 0) {
      warn(`${linkLines.length} linha(s) com URL/token ignorada(s) em ${guestFile} — não são nomes de convidado.`);
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

    // 6) Resumo compacto — só contagens + amostra; a lista completa vive nos .txt.
    okLog(`${allRows.length} convidado(s) no total → ${c.bold}public/guests.json${c.reset}`);
    if (reset) {
      warn(`--guests-reset: TODOS os ${allRows.length} tokens foram regenerados — os links antigos deixaram de funcionar.`);
    } else {
      const kept = allRows.length - newRows.length;
      info(`Merge: ${c.bold}${newRows.length}${c.reset} novo(s) · ${c.bold}${renamed.length}${c.reset} renomeado(s) · ${c.bold}${kept}${c.reset} preservado(s) (token intacto).`);
    }
    printSample("Novos", newRows.map((r) => r.name));
    printSample("Renomeados", renamed.map((r) => `${r.from} → ${r.to}`));
    for (const m of renameMisses.slice(0, 5)) warn(`  rename "${m} => ..." ignorado: "${m}" não existe no site — o novo nome virou convidado novo (link novo).`);
    if (renameMisses.length > 5) warn(`  … + ${renameMisses.length - 5} rename(s) ignorado(s).`);
    if (rewritten > 0) info(`fetch do guests.json reescrito em ${rewritten} arquivo(s) pro basePath /${fullSlug}/`);
    info(`Lista completa: ${c.brand}${fullPath}${c.reset}`);
    if (novosPath) info(`Só os novos (pra mandar no WhatsApp): ${c.brand}${novosPath}${c.reset}`);

    return true;
  }
}

// ============================================================================
// Utilitários
// ============================================================================

// Amostra compacta: até 8 itens numa linha, resto vira "… + X mais".
const SAMPLE_MAX = 8;
function printSample(label, items) {
  if (items.length === 0) return;
  const shown = items.slice(0, SAMPLE_MAX).join(" · ");
  const more = items.length > SAMPLE_MAX ? ` ${c.dim}… + ${items.length - SAMPLE_MAX} mais${c.reset}` : "";
  info(`  ${label}: ${shown}${more}`);
}

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
// Uma linha é "link" (URL de convite) e não um nome de convidado. Guardar isso
// como convidado geraria um token novo com a URL inteira no lugar do nome — a
// corrupção que aconteceu quando um `-links.txt` foi usado como lista.
function isLinkLine(line) {
  return /\?t=[A-Za-z0-9]/.test(line) || /^https?:\/\//i.test(line);
}

function parseGuestList(txt) {
  const adds = [];
  const renames = [];
  const linkLines = [];
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (isLinkLine(line)) { linkLines.push(line); continue; }
    const arrow = line.indexOf("=>");
    if (arrow >= 0) {
      const from = line.slice(0, arrow).trim();
      const to = line.slice(arrow + 2).trim();
      if (from && to) { renames.push({ from, to }); continue; }
    }
    adds.push(line);
  }
  return { adds, renames, linkLines };
}

// Fonte do estado atual: SERVIDOR primeiro (guests.json publicado é a verdade —
// é o que os links já enviados usam). O arquivo local convidados-<slug>-links.txt
// é só fallback offline: ele fica desatualizado quando outro computador deploya,
// e confiar nele foi a causa do incidente de convidados duplicados (85→167).
// Retorna { guests, source: "live"|"local"|"none", liveOk }.
export async function loadExistingGuests(projectDir, targetUrl, fullSlug) {
  const slug = fullSlug.split("/").pop();
  const live = await loadLiveGuests(targetUrl, fullSlug);

  if (live.ok) {
    const count = Object.keys(live.guests).length;
    if (count > 0) {
      info(`Estado atual lido do ${c.bold}site no ar${c.reset} (${count} convidado(s) com token ativo).`);
      return { guests: live.guests, source: "live", liveOk: true };
    }
    // 404/vazio no servidor = primeiro deploy legítimo (ou prévia sem tokens).
    const local = loadLocalLinks(projectDir, slug);
    if (Object.keys(local).length > 0) {
      warn(`Site no ar não tem guests.json, mas existe ${c.brand}convidados-${slug}-links.txt${c.reset} local (${Object.keys(local).length}). Usando o local.`);
      return { guests: local, source: "local", liveOk: true };
    }
    return { guests: {}, source: "none", liveOk: true };
  }

  // Servidor inacessível (rede/5xx): NÃO dá pra saber o estado real dos tokens.
  return { guests: loadLocalLinks(projectDir, slug), source: "local", liveOk: false };
}

// Guard rail do incidente 85→167: se o site JÁ EXISTE no registry mas não deu
// pra ler o guests.json publicado, prosseguir às cegas pode regenerar tokens já
// enviados. Interativo → exige confirmação explícita; não-interativo → aborta.
async function guardLiveUnreachable(config, fullSlug, localCount) {
  const exists = await slugExistsInRegistry(config, fullSlug);
  if (exists === false) return true; // site novo confirmado → seguro

  const why = exists === true
    ? `O site ${c.bold}${fullSlug}${c.reset} JÁ EXISTE no servidor, mas não consegui ler os tokens publicados (guests.json).`
    : `Não consegui falar com o servidor pra saber se ${c.bold}${fullSlug}${c.reset} já tem tokens publicados.`;
  err(why);
  warn(`Prosseguir sem esse estado pode ${c.bold}regenerar tokens já enviados${c.reset} (links em PDFs quebram) — foi assim que convidados duplicaram num deploy passado.`);
  if (localCount > 0) info(`Estado local disponível: ${localCount} convidado(s) em convidados-*-links.txt (pode estar desatualizado).`);

  if (!process.stdin.isTTY) {
    err("Modo não-interativo: abortando por segurança. Tente de novo com rede OK ou confirme manualmente num terminal.");
    return false;
  }
  const readline = await import("node:readline");
  const ask = createAsk(readline.default);
  const answer = (await ask(`  Digite ${c.bold}CONTINUAR${c.reset} pra prosseguir mesmo assim (qualquer outra coisa aborta) → `)).trim();
  if (answer !== "CONTINUAR") {
    err("Deploy abortado — estado dos convidados não confirmado.");
    return false;
  }
  warn("Prosseguindo por sua conta e risco com o estado local.");
  return true;
}

// Consulta o registry público do painel. true/false = resposta confiável;
// null = não deu pra saber (offline).
export async function slugExistsInRegistry(config, fullSlug) {
  const base = (config?.panel_url || "").replace(/\/$/, "");
  if (!base) return null;
  try {
    const r = await fetch(`${base}/api/sites/registry?slug=${encodeURIComponent(fullSlug)}`, {
      signal: AbortSignal.timeout(8000),
      headers: { "Cache-Control": "no-cache" },
    });
    if (!r.ok) return null;
    const data = await r.json();
    if (typeof data?.exists === "boolean") return data.exists;
    return null;
  } catch {
    return null;
  }
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

// Puxa o guests.json publicado (token→nome). Distingue "não existe" (404 =
// primeiro deploy legítimo, ok:true) de "não deu pra saber" (rede/5xx, ok:false)
// — colapsar os dois em {} foi o que permitiu regenerar tokens sem querer.
export async function loadLiveGuests(targetUrl, fullSlug) {
  const domain = (targetUrl || "").replace(/\/$/, "");
  if (!domain) return { ok: false, guests: {} };
  const base = domain.endsWith(`/${fullSlug}`) ? domain : `${domain}/${fullSlug}`;
  const url = `${base}/guests.json?_=${Date.now()}`;
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "Cache-Control": "no-cache" },
    });
    if (r.status === 404) return { ok: true, guests: {} };
    if (!r.ok) return { ok: false, guests: {} };
    const data = await r.json();
    if (data && data.guests && typeof data.guests === "object") {
      return { ok: true, guests: { ...data.guests } };
    }
    return { ok: true, guests: {} };
  } catch {
    return { ok: false, guests: {} };
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
