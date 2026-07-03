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
   * Gera guests.json a partir do .txt de convidados, reescreve o fetch pro
   * basePath correto e cospe o .txt de links na pasta do projeto.
   */
  async prepare(stagingDir, fullSlug, _config, targetUrl) {
    const projectDir = process.cwd();

    // 1) Resolve o arquivo de convidados (flag → auto-detect → prompt)
    const guestFile = await resolveGuestFile(projectDir);
    if (!guestFile) {
      // Sem lista: remove qualquer guests.json stale (ex.: o de dev commitado na
      // base) pra NÃO vazar tokens de teste em produção — site sobe em prévia.
      const stale = join(stagingDir, "public", "guests.json");
      if (existsSync(stale)) { rmSync(stale, { force: true }); }
      warn("Nenhuma lista de convidados informada — guests.json NÃO foi gerado.");
      info(`O convite vai subir só em modo prévia. Rode de novo com ${c.cyan}--guests-file <arquivo.txt>${c.reset} pra ativar os tokens.`);
      return true;
    }

    // 2) Lê e normaliza os nomes (1 por linha, ignora vazias e comentários #)
    let names;
    try {
      names = parseGuestList(readFileSync(guestFile, "utf8"));
    } catch (e) {
      err(`Falha ao ler ${guestFile}: ${e.message}`);
      return false;
    }
    if (names.length === 0) {
      err(`Lista de convidados vazia em ${guestFile}.`);
      return false;
    }

    // 3) Gera tokens únicos
    const seen = new Set();
    const guests = {};
    const rows = [];
    for (const name of names) {
      let token;
      do {
        token = genToken();
      } while (seen.has(token));
      seen.add(token);
      guests[token] = name;
      rows.push({ name, token });
    }

    // 4) Escreve public/guests.json no staging (vai junto no build)
    const publicDir = join(stagingDir, "public");
    mkdirSync(publicDir, { recursive: true });
    const guestsJson = {
      version: 1,
      generatedAt: new Date().toISOString(),
      site: fullSlug,
      guests,
    };
    writeFileSync(join(publicDir, "guests.json"), JSON.stringify(guestsJson, null, 2) + "\n");

    // 5) Reescreve fetch("/guests.json") → fetch("/<cat>/<slug>/guests.json")
    //    Sem isso, em produção o site vive em /<cat>/<slug>/ e o fetch pro root
    //    daria 404 → convite cairia sempre em modo prévia.
    const rewritten = rewriteGuestsFetch(stagingDir, fullSlug);

    // 6) Cospe o .txt de links na pasta do projeto (pronto pro WhatsApp)
    //    targetUrl aqui é só o domínio (https://criartedesing.ao) — o site vive
    //    em /<cat>/<slug>/, então o link PRECISA carregar o fullSlug no path.
    //    Sem isso o convidado cairia no root do domínio e o convite não abriria.
    const domain = targetUrl.replace(/\/$/, "");
    const base = domain.endsWith(`/${fullSlug}`) ? domain : `${domain}/${fullSlug}`;
    const slug = fullSlug.split("/").pop();
    const outPath = join(projectDir, `convidados-${slug}-links.txt`);
    const out = [
      `# Links de convite — ${fullSlug}`,
      `# Gerado em ${guestsJson.generatedAt}`,
      `# ${rows.length} convidado(s). Um link por convidado, único e intransferível.`,
      "",
      ...rows.map((r) => `${base}?t=${r.token} — ${r.name}`),
      "",
    ].join("\n");
    writeFileSync(outPath, out);

    okLog(`${rows.length} token(s) gerado(s) → ${c.bold}public/guests.json${c.reset}`);
    if (rewritten > 0) info(`fetch do guests.json reescrito em ${rewritten} arquivo(s) pro basePath /${fullSlug}/`);
    info(`Links prontos pro WhatsApp: ${c.brand}${outPath}${c.reset}`);

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

function parseGuestList(txt) {
  const out = [];
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    out.push(line);
  }
  return out;
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
