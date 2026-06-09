#!/usr/bin/env node
/**
 * Criarte Deploy CLI
 * Publica um site finalizado no monorepo multi-site sem precisar cloná-lo localmente.
 */
import { execSync } from "node:child_process";
import {
  existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync,
  rmSync, cpSync, readdirSync, statSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, basename, relative, extname } from "node:path";
import readline from "node:readline";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { BANNER } from "./banner.mjs";

// ============================================================================
// CONFIG
// ============================================================================
const REPO = "SamuelSantos-R/multisite-system";
const DEPLOY_DOMAIN = "https://criartedesing.ao";
const DEFAULT_PANEL_URL = DEPLOY_DOMAIN;
const CONFIG_DIR = join(homedir(), ".criarte-deploy");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const VERSION = "3.6.0";

// Best-effort: registra o deploy no painel pra alimentar a aba Fila do app iOS.
// Não bloqueia o fluxo se falhar — é só telemetria pro app.
async function registerDeployInPanel(config, slug, action, commit_sha) {
  if (!config.panel_url || !config.admin_api_token) return;
  try {
    await fetch(`${config.panel_url.replace(/\/$/, "")}/api/deploys/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.admin_api_token}`,
      },
      body: JSON.stringify({ slug, action, commit_sha: commit_sha || null }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // silencioso
  }
}

/**
 * Preflight check remoto — valida se o slug está disponível antes de clonar o repo.
 * Chama /api/sites/preflight no painel pra verificar:
 * - Slug disponível (não existe ainda, ou existe e é update)
 * - Sem lock ativo (ninguém deployando o mesmo slug)
 * - Categoria e nome válidos
 *
 * Retorna null se ok, ou uma string com o erro.
 */
async function remotePreflight(config, slug, action) {
  if (!config.panel_url || !config.admin_api_token) return null; // sem painel, segue
  try {
    const res = await fetch(
      `${config.panel_url.replace(/\/$/, "")}/api/sites/preflight`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.admin_api_token}`,
        },
        body: JSON.stringify({ slug, action }),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (res.ok) return null; // tudo ok
    const body = await res.json().catch(() => ({}));
    if (res.status === 423) {
      return `🔒 "${slug}" está bloqueado — ${body.message || "outro deploy em andamento"}. Aguarde uns minutos e tente de novo.`;
    }
    if (res.status === 409) {
      return `⚠️  "${slug}" já existe no sistema. Use action: "update" se quiser atualizar.`;
    }
    return body.message || `Erro ${res.status} na validação remota.`;
  } catch {
    return null; // falha de rede não deve bloquear
  }
}

/**
 * Notifica o painel que o deploy terminou, liberando o lock.
 * Chama /api/deploys/callback com o status final.
 */
async function notifyDeployComplete(config, slug, status, commit_sha) {
  if (!config.panel_url || !config.admin_api_token) return;
  try {
    await fetch(`${config.panel_url.replace(/\/$/, "")}/api/deploys/callback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.admin_api_token}`,
      },
      body: JSON.stringify({ slug, status, commit_sha: commit_sha || null }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // silencioso
  }
}

// ============================================================================
// UI helpers
// ============================================================================
const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  blue: "\x1b[34m", magenta: "\x1b[35m", cyan: "\x1b[36m", gray: "\x1b[90m",
};
const ok    = (s) => console.log(`${c.green}✓${c.reset} ${s}`);
const info  = (s) => console.log(`${c.cyan}ℹ${c.reset} ${s}`);
const warn  = (s) => console.log(`${c.yellow}⚠${c.reset}  ${s}`);
const err   = (s) => console.log(`${c.red}✗${c.reset} ${s}`);
const hr    = ()  => console.log(`${c.dim}${"─".repeat(56)}${c.reset}`);
const heading = (s) => console.log(`\n${c.bold}${c.magenta}${s}${c.reset}\n`);

// OSC-8 hyperlink — terminais modernos (iTerm2, Terminal.app, WezTerm, Kitty) tornam clicável.
// Fallback: imprime só a URL em texto.
function linkify(url, color = c.cyan) {
  if (!process.stdout.isTTY) return url;
  return `\x1b]8;;${url}\x1b\\${color}${url}${c.reset}\x1b]8;;\x1b\\`;
}

function showBanner() {
  if (!process.stdout.isTTY) return;
  console.log(BANNER);
  console.log(`${c.bold}${c.magenta}        Criarte Deploy${c.reset} ${c.dim}v${VERSION}${c.reset}`);
  console.log(`${c.dim}        publique sites em segundos${c.reset}\n`);
}

// Header compacto pra comandos do dia-a-dia — sem poluir o terminal
function miniHeader(label) {
  console.log(`\n${c.magenta}${c.bold}❀ Criarte Deploy${c.reset} ${c.dim}v${VERSION}${c.reset}  ${c.dim}·${c.reset}  ${c.bold}${label}${c.reset}\n`);
}

// ============================================================================
// Screen — frame único estilo Claude Code
// Cada fase chama screen.phase() pra limpar a tela e redrawnar só o que importa.
// ============================================================================
const screen = {
  clear() {
    if (!process.stdout.isTTY) return;
    // Esconde cursor durante o redraw (evita flicker), reset, limpa tudo, cursor pra origem
    process.stdout.write("\x1b[?25l\x1b[2J\x1b[3J\x1b[H\x1b[?25h");
  },
  phase(label, subtitle) {
    this.clear();
    console.log(`${c.magenta}${c.bold}❀ Criarte Deploy${c.reset} ${c.dim}v${VERSION}${c.reset}  ${c.dim}·${c.reset}  ${c.bold}${label}${c.reset}`);
    if (subtitle) console.log(`${c.dim}${subtitle}${c.reset}`);
    console.log();
  },
};

// ============================================================================
// Spinner (estilo Claude Code / npm)
// ============================================================================
const FRAMES = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
class Spinner {
  constructor(text) {
    this.text = text;
    this.i = 0;
    this.iv = null;
    this.startTime = Date.now();
  }
  start() {
    if (!process.stdout.isTTY) {
      console.log(`${c.cyan}…${c.reset} ${this.text}`);
      return this;
    }
    process.stdout.write("\x1b[?25l"); // esconde cursor
    this.iv = setInterval(() => {
      process.stdout.write(`\r${c.cyan}${FRAMES[this.i = (this.i + 1) % FRAMES.length]}${c.reset} ${this.text}   `);
    }, 80);
    return this;
  }
  update(text) {
    this.text = text;
  }
  stop(symbol = "✓", color = c.green, finalText) {
    if (this.iv) clearInterval(this.iv);
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    if (process.stdout.isTTY) {
      process.stdout.write("\x1b[2K\r"); // limpa linha
      process.stdout.write("\x1b[?25h"); // mostra cursor
    }
    console.log(`${color}${symbol}${c.reset} ${finalText ?? this.text} ${c.dim}(${elapsed}s)${c.reset}`);
  }
  succeed(text) { this.stop("✓", c.green, text); }
  fail(text)    { this.stop("✗", c.red, text); }
  warn(text)    { this.stop("⚠", c.yellow, text); }
  // Para o spinner sem imprimir linha permanente — útil quando a próxima fase
  // vai chamar screen.phase() e redrawnar tudo do zero.
  clear() {
    if (this.iv) clearInterval(this.iv);
    if (process.stdout.isTTY) {
      process.stdout.write("\x1b[2K\r\x1b[?25h");
    }
  }
}

// ============================================================================
// Barra de progresso (pra cópia de arquivos)
// ============================================================================
function progressBar(current, total, label = "") {
  if (!process.stdout.isTTY) return;
  const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;
  const width = 30;
  const filled = Math.round((pct / 100) * width);
  const bar = `${c.cyan}${"█".repeat(filled)}${c.dim}${"░".repeat(width - filled)}${c.reset}`;
  const text = `${bar} ${c.bold}${pct.toFixed(0).padStart(3)}%${c.reset} ${c.dim}${current}/${total}${c.reset} ${label}`;
  process.stdout.write(`\r\x1b[2K${text}`);
  if (current >= total) process.stdout.write("\n");
}

// ============================================================================
// Input
// ============================================================================
function ask(question, { hidden = false, default: def } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const prompt = def ? `${question} ${c.dim}(${def})${c.reset} ` : question;
    if (hidden) {
      const _writeToOutput = rl._writeToOutput;
      rl._writeToOutput = function (str) { _writeToOutput.call(rl, str.replace(/./g, "•")); };
    }
    rl.question(prompt, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve((answer.trim()) || def || "");
    });
  });
}

// ============================================================================
// Config
// ============================================================================
function loadConfig() {
  if (!existsSync(CONFIG_FILE)) return null;
  try { return JSON.parse(readFileSync(CONFIG_FILE, "utf8")); }
  catch { return null; }
}

function saveConfig(config) {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

function requireLogin() {
  const config = loadConfig();
  if (!config) {
    err("Você ainda não fez login.");
    info(`Rode primeiro: ${c.cyan}criarte-deploy login${c.reset}`);
    process.exit(1);
  }
  return config;
}

// ============================================================================
// LOGIN
// ============================================================================
async function cmdLogin() {
  showBanner();
  console.log(`${c.bold}${c.magenta}🔐 Configuração inicial${c.reset}\n`);

  console.log(`Pra publicar sites o CLI precisa de um ${c.bold}token do GitHub${c.reset}.`);
  console.log("É uma chave que dá permissão pro CLI subir os arquivos.\n");

  console.log(`${c.bold}Como criar (1 minuto):${c.reset}`);
  console.log(`  ${c.dim}1.${c.reset} Abra esse link:`);
  console.log(`     ${c.cyan}https://github.com/settings/tokens/new?scopes=repo&description=Criarte+Deploy${c.reset}`);
  console.log(`  ${c.dim}2.${c.reset} Em ${c.bold}Expiration${c.reset}, escolha ${c.bold}"No expiration"${c.reset}`);
  console.log(`  ${c.dim}3.${c.reset} Role até o fim e clique em ${c.bold}"Generate token"${c.reset}`);
  console.log(`  ${c.dim}4.${c.reset} Copie o token (começa com ${c.dim}ghp_...${c.reset})\n`);

  const token = await ask("Cole o token aqui: ", { hidden: true });
  if (!token.startsWith("ghp_") && !token.startsWith("github_pat_")) {
    err("Esse não parece um token válido. Deve começar com 'ghp_' ou 'github_pat_'.");
    process.exit(1);
  }

  const sp = new Spinner("Verificando token e acesso ao repositório...").start();
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (!res.ok) {
      sp.fail(`Token sem acesso ao repositório (HTTP ${res.status})`);
      err(`Confirme que o token tem o escopo ${c.bold}repo${c.reset} e que você tem acesso a ${REPO}.`);
      process.exit(1);
    }
  } catch (e) {
    sp.fail("Erro de rede");
    err(e.message);
    process.exit(1);
  }
  sp.succeed("Token válido");

  const sp2 = new Spinner("Buscando seu perfil no GitHub...").start();
  const user = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  sp2.succeed(`Logada como ${c.bold}${user.login}${c.reset}`);

  const name  = user.name || user.login;
  const email = user.email || `${user.login}@users.noreply.github.com`;

  // Opcional: integração com o painel pra alimentar a aba Fila do app iOS
  console.log();
  console.log(`${c.dim}Opcional: integrar com o painel pra que seus deploys apareçam na aba Fila do app iOS.${c.reset}`);
  console.log(`${c.dim}Deixe em branco pra pular.${c.reset}`);
  const panel_url = await ask(`URL do painel ${c.dim}(${DEFAULT_PANEL_URL})${c.reset}: `, { default: "" });
  const admin_api_token = panel_url || panel_url === ""
    ? await ask(`Token ADMIN_API_TOKEN ${c.dim}(skip)${c.reset}: `, { hidden: true })
    : "";

  const cfg = { token, name, email, login: user.login };
  if (admin_api_token) {
    cfg.panel_url = panel_url || DEFAULT_PANEL_URL;
    cfg.admin_api_token = admin_api_token;
  }
  saveConfig(cfg);

  ok(`Configuração salva em ${c.dim}${CONFIG_FILE}${c.reset}`);
  if (cfg.panel_url) ok(`Integração com painel ativa (${cfg.panel_url})`);
  console.log();
  console.log("🎉 Pronto! Agora é só ir na pasta de um site e rodar:");
  console.log(`   ${c.cyan}criarte-deploy${c.reset}\n`);
}

// ============================================================================
// PREFLIGHT CHECKS — detecta problemas que causariam crash no build do CI
// ============================================================================
const IGNORE_DIRS = new Set([
  "node_modules", ".next", "out", ".git", "dist", ".turbo",
  ".vscode", ".idea",
]);
const IGNORE_FILES = new Set([
  ".DS_Store", ".env", ".env.local", ".env.production.local",
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  "tsconfig.tsbuildinfo",
  // Arquivos do shell raiz que não fazem sentido dentro de um site individual
  "discloud.config", "server.js", ".discloudignore",
]);

function walkSource(dir, cb, base = dir) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue;
    if (IGNORE_FILES.has(entry)) continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walkSource(p, cb, base);
    else cb(p, relative(base, p));
  }
}

async function preflightChecks(cwd, category, slug) {
  const issues = []; // { level: 'error'|'warn', msg, fix? }

  // 0. Você tá na pasta errada? (raiz do monorepo)
  if (existsSync(join(cwd, "sites")) && existsSync(join(cwd, "discloud.config"))) {
    issues.push({
      level: "error",
      msg: "Você está na RAIZ do monorepo multi-site, não em um site individual.",
      fix: "Entre na pasta do site (ex: cd sites/casamento/joao-maria) ou na pasta do site finalizado fora do monorepo.",
    });
    return issues;
  }

  // 1. Tem package.json?
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) {
    issues.push({ level: "error", msg: "Não tem package.json — não é um projeto Node/Next." });
    return issues;
  }
  let pkg;
  try { pkg = JSON.parse(readFileSync(pkgPath, "utf8")); }
  catch { issues.push({ level: "error", msg: "package.json com sintaxe inválida (JSON quebrado)." }); return issues; }

  // 2. É um projeto Next?
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (!deps.next) {
    issues.push({
      level: "error",
      msg: "Projeto não tem 'next' como dependência — o sistema só suporta sites Next.js.",
    });
    return issues;
  }

  // 3. Tem pages/ ou app/ ?
  const hasApp = existsSync(join(cwd, "src", "app")) || existsSync(join(cwd, "app"));
  const hasPages = existsSync(join(cwd, "src", "pages")) || existsSync(join(cwd, "pages"));
  if (!hasApp && !hasPages) {
    issues.push({
      level: "error",
      msg: "Não achei pasta 'app/' nem 'pages/'. O site precisa ter pelo menos uma página.",
    });
  }

  // 4. Detecção de API routes / Server Actions / getServerSideProps (incompatível com export estático)
  let hasApi = false;
  let hasSsr = false;
  let hasMiddleware = false;
  let problematicFonts = [];
  let absoluteImagePaths = [];

  walkSource(cwd, (full, rel) => {
    if (/\bapp\/.+\/route\.(ts|js)x?$/.test(rel) || /\bapi\/.+\.(ts|js)x?$/.test(rel)) {
      hasApi = true;
    }
    if (/^middleware\.(ts|js)x?$/.test(rel)) hasMiddleware = true;
    if (!/\.(tsx?|jsx?|mjs|cjs)$/.test(rel)) return;
    let content = "";
    try { content = readFileSync(full, "utf8"); } catch { return; }
    if (/export\s+(async\s+)?function\s+getServerSideProps/.test(content)) hasSsr = true;
    if (/from\s+['"]next\/font\/google['"]/.test(content)) {
      problematicFonts.push(rel);
    }
    // <img src="/algo.png"> ou <Image src="/algo.png"> — caminhos absolutos quebram com basePath
    const imgMatches = [...content.matchAll(/(?:<img|<Image)[^>]+src\s*=\s*["']\/([^"'/][^"']*)["']/g)];
    for (const m of imgMatches) {
      if (!m[1].startsWith("api/") && !m[1].startsWith("_next/")) {
        absoluteImagePaths.push({ file: rel, src: "/" + m[1] });
      }
    }
  });

  if (hasApi) issues.push({
    level: "error",
    msg: "Site tem API routes (app/.../route.ts ou pages/api/*). Export estático não suporta.",
    fix: "Remova as API routes ou mova a lógica pro servidor principal.",
  });
  if (hasSsr) issues.push({
    level: "error",
    msg: "Site usa getServerSideProps. Export estático só aceita getStaticProps.",
    fix: "Troca por getStaticProps + getStaticPaths.",
  });
  if (hasMiddleware) issues.push({
    level: "error",
    msg: "Site tem middleware.ts. Export estático não suporta middleware.",
    fix: "Remova middleware.ts (lógica de routing precisa ir pra outro lugar).",
  });
  if (problematicFonts.length) issues.push({
    level: "warn",
    msg: `Uso de next/font/google em ${problematicFonts.length} arquivo(s) — pode falhar no build offline.`,
    fix: "Considere usar fontes locais ou <link rel='stylesheet'> direto no <head>.",
  });
  if (absoluteImagePaths.length) {
    issues.push({
      level: "info",
      msg: `${absoluteImagePaths.length} imagem(ns) com caminho absoluto — o CI vai prefixar automaticamente com /${category}/${slug}/ no build (prefix-assets.mjs).`,
    });
  }

  // 5. next.config.* — sync.mjs do CI reescreve, então só info
  const cfgFile = ["next.config.ts","next.config.mjs","next.config.js"]
    .map(f => join(cwd, f)).find(existsSync);
  if (cfgFile) {
    const cfg = readFileSync(cfgFile, "utf8");
    if (!/output\s*:\s*['"]export['"]/.test(cfg)) {
      issues.push({
        level: "info",
        msg: "next.config será reescrito pelo CI com output:'export' + basePath.",
      });
    }
  }

  // 6. site.json — pode ser auto-criado
  if (!existsSync(join(cwd, "site.json"))) {
    issues.push({
      level: "fixable",
      kind: "site-json",
      msg: "Sem site.json (nome + descrição que aparecem no painel).",
    });
  }

  // 7. Assets órfãos (nunca referenciados no source)
  try {
    const { orphans } = detectOrphanAssets(cwd);
    if (orphans.length > 0) {
      const totalBytes = orphans.reduce((a, o) => a + o.sz, 0);
      const totalMb = (totalBytes / 1024 / 1024).toFixed(1);
      const sample = orphans.slice(0, 3)
        .map(o => `${c.dim}·${c.reset} ${o.publicRel} ${c.dim}(${(o.sz / 1024).toFixed(0)} KB)${c.reset}`)
        .join("\n  ");
      issues.push({
        level: "info",
        msg: `${orphans.length} arquivo(s) órfão(s) em public/ (${totalMb} MB) — vou oferecer remover durante o deploy:\n  ${sample}${orphans.length > 3 ? `\n  ${c.dim}… e mais ${orphans.length - 3}${c.reset}` : ""}`,
      });
    }
  } catch {}

  // 8. Tamanho da pasta + arquivos individuais grandes
  let totalBytes = 0;
  const bigFiles = [];
  walkSource(cwd, (full, rel) => {
    const sz = statSync(full).size;
    totalBytes += sz;
    if (sz > 10 * 1024 * 1024) bigFiles.push({ rel, sz });
  });
  if (totalBytes > 100 * 1024 * 1024) {
    issues.push({
      level: "warn",
      msg: `Pasta grande: ${(totalBytes / 1024 / 1024).toFixed(1)} MB. Otimize imagens (squoosh.app, tinypng.com).`,
    });
  }
  if (bigFiles.length) {
    const sample = bigFiles.slice(0, 3)
      .map(f => `  ${c.dim}${(f.sz / 1024 / 1024).toFixed(1)} MB:${c.reset} ${f.rel}`).join("\n");
    issues.push({
      level: "warn",
      msg: `${bigFiles.length} arquivo(s) acima de 10 MB — push via HTTPS pode falhar:\n${sample}`,
      fix: "Comprima imagens em squoosh.app ou tinypng.com antes de publicar.",
    });
  }

  return issues;
}

async function renderIssues(issues, cwd, category, slug) {
  if (!issues.length) {
    ok("Nenhum problema detectado na estrutura do site.\n");
    return { canDeploy: true };
  }
  const errors   = issues.filter(i => i.level === "error");
  const warnings = issues.filter(i => i.level === "warn");
  const infos    = issues.filter(i => i.level === "info");
  const fixables = issues.filter(i => i.level === "fixable");

  console.log();
  for (const i of errors) {
    err(i.msg);
    if (i.fix) console.log(`   ${c.dim}↳ fix:${c.reset} ${i.fix}`);
  }
  for (const i of warnings) {
    warn(i.msg);
    if (i.fix) console.log(`   ${c.dim}↳ sugestão:${c.reset} ${i.fix}`);
  }
  for (const i of infos) info(i.msg);

  // Auto-fix interativo
  for (const i of fixables) {
    console.log();
    console.log(`${c.yellow}⚠${c.reset}  ${i.msg}`);
    const yn = await ask(`   ${c.cyan}?${c.reset} Quer que eu corrija agora? ${c.dim}(S/n)${c.reset} → `);
    if (yn.toLowerCase() === "n" || yn.toLowerCase() === "nao" || yn.toLowerCase() === "não") {
      info("   Pulando — vai ser criado automaticamente com nome capitalizado.");
      continue;
    }
    await applyFix(i.kind, cwd, category, slug);
  }
  console.log();
  return { canDeploy: errors.length === 0, hasWarnings: warnings.length > 0 };
}

async function applyFix(kind, cwd, category, slug) {
  if (kind === "site-json") {
    const defaultName = slug
      .split("-")
      .map(w => w[0].toUpperCase() + w.slice(1))
      .join(" ");
    console.log(`   ${c.bold}Nome${c.reset} (que aparece no painel)`);
    const name = await ask(`   → `, { default: defaultName });
    console.log(`   ${c.bold}Descrição${c.reset} ${c.dim}(opcional — Enter pra pular)${c.reset}`);
    const description = await ask(`   → `);
    const siteJson = { name, description, category };
    writeFileSync(join(cwd, "site.json"), JSON.stringify(siteJson, null, 2) + "\n");
    ok(`   site.json criado com nome "${name}"`);
  }
}

// ============================================================================
// EXPIRAÇÃO — pergunta quanto tempo o site fica no ar
// ============================================================================
async function askExpiration(siteJsonPath) {
  let current = null;
  if (existsSync(siteJsonPath)) {
    try { current = JSON.parse(readFileSync(siteJsonPath, "utf8")).expires_at || null; }
    catch {}
  }

  console.log(`Quanto tempo o site fica no ar?`);
  console.log(`  ${c.dim}0${c.reset}   Sem expiração (permanente)`);
  console.log(`  ${c.dim}1${c.reset}   1 mês`);
  console.log(`  ${c.dim}3${c.reset}   3 meses`);
  console.log(`  ${c.dim}6${c.reset}   6 meses`);
  console.log(`  ${c.dim}12${c.reset}  1 ano`);
  console.log(`  ${c.dim}D${c.reset}   Data específica (YYYY-MM-DD)`);
  if (current) console.log(`  ${c.dim}M${c.reset}   Manter atual (${current.slice(0, 10)})`);

  const def = current ? "M" : "3";
  const raw = (await ask(`→ `, { default: def })).trim().toLowerCase();

  if (raw === "" || raw === def.toLowerCase()) {
    if (def === "M") return current;
    return monthsFromNow(parseInt(def, 10));
  }
  if (raw === "0" || raw === "n" || raw === "sem") return null;
  if (raw === "m" && current) return current;
  if (raw === "d") {
    while (true) {
      const date = (await ask(`Data ${c.dim}(YYYY-MM-DD)${c.reset} → `)).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date + "T00:00:00Z"))) return date;
      err("Formato inválido. Use YYYY-MM-DD (ex: 2027-12-31).");
    }
  }
  const months = parseInt(raw, 10);
  if (!Number.isFinite(months) || months <= 0) {
    warn(`Valor não reconhecido "${raw}" — assumindo 3 meses.`);
    return monthsFromNow(3);
  }
  return monthsFromNow(months);
}

function monthsFromNow(months) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function writeSiteMeta(cwd, category, slug, expires_at, subdomain) {
  const siteJsonPath = join(cwd, "site.json");
  let meta = {};
  if (existsSync(siteJsonPath)) {
    try { meta = JSON.parse(readFileSync(siteJsonPath, "utf8")); } catch {}
  }
  meta.category = category;
  if (!meta.name) {
    meta.name = slug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  }
  if (typeof meta.description !== "string") meta.description = "";
  if (expires_at) meta.expires_at = expires_at;
  else delete meta.expires_at;
  if (subdomain) meta.subdomain = subdomain;
  else delete meta.subdomain;
  writeFileSync(siteJsonPath, JSON.stringify(meta, null, 2) + "\n");
}

// ============================================================================
// DEPLOY
// ============================================================================
async function cmdDeploy(argv) {
  screen.phase("📦 Publicar site");

  // Filtra flags antes de pegar args posicionais (categoria + slug)
  const noWait = argv.includes("--no-wait");
  // Extrai --subdomain <valor> E remove do argv
  let subdomain = null;
  const subIdx = argv.indexOf("--subdomain");
  if (subIdx >= 0) {
    subdomain = argv[subIdx + 1] || null;
    if (subdomain && (subdomain.startsWith("--") || subdomain.startsWith("-"))) subdomain = null;
    argv.splice(subIdx, subdomain ? 2 : 1);
  }
  argv = argv.filter((a) => !a.startsWith("--"));

  let config = requireLogin();
  const cwd = process.cwd();
  const folderName = basename(cwd);

  // Se panel_url não tá configurado, oferece setup rápido inline
  if (!config.panel_url || !config.admin_api_token) {
    warn("Painel não configurado — sem isso o deploy não é registrado e o monitor cai no fallback de domínio.");
    const setup = await ask(`Configurar agora? ${c.dim}(S/n)${c.reset} → `, { default: "s" });
    if (setup.toLowerCase() !== "n" && setup.toLowerCase() !== "nao" && setup.toLowerCase() !== "não") {
      await cmdPanel();
      config = loadConfig();
      screen.phase("📦 Publicar site");
    }
  }

  // Pega argumentos
  let category = argv[0];
  let slug = argv[1];

  if (!category) {
    console.log(`Qual a ${c.bold}categoria${c.reset} do site?`);
    console.log(`${c.dim}Exemplos: casamento, aniversario, evento, debutante${c.reset}`);
    category = await ask("→ ");
  }
  if (!slug) {
    console.log(`\nQual o ${c.bold}nome${c.reset} (slug) do site? Minúsculas com hífen.`);
    console.log(`${c.dim}Exemplos: joao-maria, ana-15-anos${c.reset}`);
    slug = await ask("→ ", { default: folderName });
  }

  const slugRe = /^[a-z0-9][a-z0-9-]*$/;
  if (!slugRe.test(category)) { err(`Categoria inválida: "${category}"`); process.exit(1); }
  if (!slugRe.test(slug))     { err(`Nome inválido: "${slug}"`); process.exit(1); }

  const fullSlug = `${category}/${slug}`;
  // Usa panel_url do login como destino se configurado — pra quem migrou
  // pra Coolify (criartedesing.ao na Discloud tá quebrada).
  const liveDomain = (config.panel_url || DEPLOY_DOMAIN).replace(/\/$/, "");
  const targetUrl = `${liveDomain}/${fullSlug}`;
  const futureDomain = DEFAULT_PANEL_URL.replace(/\/$/, "");
  const futureUrl = futureDomain !== liveDomain ? `${futureDomain}/${fullSlug}` : null;

  // ====== Subdomínio personalizado (pra migrar sites legados da Discloud) ======
  // Permite flag --subdomain dominio.com ou pergunta interativo
  if (!subdomain) {
    console.log();
    console.log(`${c.bold}Subdomínio personalizado${c.reset} ${c.dim}(opcional)${c.reset}`);
    console.log(`${c.dim}Se o site já tinha um subdomínio na Discloud (ex: mariaepaulo.criartedesing.ao),${c.reset}`);
    console.log(`${c.dim}informe aqui pra manter o mesmo endereço. Deixe vazio pra pular.${c.reset}`);
    const raw = await ask(`Subdomínio ${c.dim}(ex: mariaepaulo.criartedesing.ao)${c.reset}: `);
    if (raw.trim()) {
      subdomain = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    }
  }
  const subdomainUrl = subdomain ? `https://${subdomain}` : null;

  // ====== Preflight remoto (valida slug + lock check no painel) ======
  const action = "new"; // será ajustado depois do clone (se já existir)
  const preflightErr = await remotePreflight(config, fullSlug, action);
  if (preflightErr && preflightErr.includes("🔒")) {
    screen.phase("🔒 Bloqueado", fullSlug);
    err(preflightErr);
    process.exit(1);
  }
  if (preflightErr && preflightErr.includes("já existe")) {
    // Vamos verificar durante o clone — pode ser update
    info(`${c.dim}Preflight: ${preflightErr}${c.reset}`);
  }

  // ====== Análise pré-deploy ======
  screen.phase("🔍 Análise", `${fullSlug} · ${targetUrl}`);
  const sp1 = new Spinner("Analisando arquivos, dependências e configuração...").start();
  const issues = await preflightChecks(cwd, category, slug);
  sp1.clear();

  const result = await renderIssues(issues, cwd, category, slug);

  if (!result.canDeploy) {
    err("Não dá pra publicar por causa dos erros acima.");
    info("Corrija e rode de novo.");
    process.exit(1);
  }

  if (result.hasWarnings) {
    const cont = await ask(`Continuar mesmo com os avisos? ${c.dim}(s/N)${c.reset} → `);
    if (cont.toLowerCase() !== "s" && cont.toLowerCase() !== "sim") {
      warn("Cancelado.");
      process.exit(0);
    }
  }

  // ====== Expiração ======
  screen.phase("⏳ Validade", fullSlug);
  const expires_at = await askExpiration(join(cwd, "site.json"));
  writeSiteMeta(cwd, category, slug, expires_at, subdomain);

  // ====== Resumo ======
  screen.phase("📋 Resumo", fullSlug);
  console.log(`  ${c.dim}Pasta:${c.reset}    ${cwd}`);
  console.log(`  ${c.dim}Destino:${c.reset}  sites/${fullSlug}/`);
  if (subdomainUrl) {
    console.log(`  ${c.dim}Subdomínio:${c.reset} ${c.bold}${c.cyan}${subdomainUrl}${c.reset}`);
  } else {
    console.log(`  ${c.dim}URL:${c.reset}      ${c.cyan}${targetUrl}${c.reset}`);
  }
  if (futureUrl) {
    console.log(`  ${c.dim}Futuro:${c.reset}   ${c.dim}${futureUrl}${c.reset} ${c.dim}(quando o DNS migrar)${c.reset}`);
  }
  console.log(`  ${c.dim}Expira:${c.reset}   ${expires_at ? `${c.bold}${expires_at}${c.reset}` : `${c.dim}sem expiração${c.reset}`}`);
  console.log();

  const confirm = await ask(`Confirma o envio? ${c.dim}(s/N)${c.reset} → `);
  if (confirm.toLowerCase() !== "s" && confirm.toLowerCase() !== "sim") {
    warn("Cancelado.");
    process.exit(0);
  }

  // ====== Clone temp ======
  screen.phase("🚀 Enviando", fullSlug);

  const tmp = mkdtempSync(join(tmpdir(), "criarte-deploy-"));
  const sp2 = new Spinner("Conectando ao repositório do sistema...").start();
  try {
    execSync(
      `git clone --depth 1 -c http.postBuffer=524288000 https://${config.token}@github.com/${REPO}.git "${tmp}"`,
      { stdio: "pipe" },
    );
  } catch (e) {
    sp2.fail("Falha ao conectar");
    err(e.stderr?.toString() || e.message);
    rmSync(tmp, { recursive: true, force: true });
    process.exit(1);
  }
  sp2.succeed("Repositório acessado");

  // Verifica se já existe
  const targetPath = join(tmp, "sites", category, slug);
  let isUpdate = false;
  if (existsSync(targetPath)) {
    warn(`O site sites/${fullSlug}/ já existe.`);
    const overwrite = await ask(`Atualizar/sobrescrever? ${c.dim}(s/N)${c.reset} → `);
    if (overwrite.toLowerCase() !== "s" && overwrite.toLowerCase() !== "sim") {
      warn("Cancelado.");
      rmSync(tmp, { recursive: true, force: true });
      process.exit(0);
    }
    isUpdate = true;
    rmSync(targetPath, { recursive: true, force: true });
  }

  // ====== Copia arquivos com barra de progresso ======
  mkdirSync(targetPath, { recursive: true });

  // Conta total primeiro
  let total = 0;
  walkSource(cwd, () => total++);

  let done = 0;
  walkSource(cwd, (full, rel) => {
    const dest = join(targetPath, rel);
    mkdirSync(join(dest, ".."), { recursive: true });
    cpSync(full, dest);
    done++;
    progressBar(done, total, c.dim + rel.slice(0, 40) + c.reset);
  });
  console.log(`${c.green}✓${c.reset} ${done} arquivo(s) copiado(s)`);

  // ====== Limpeza de assets órfãos (não referenciados pelo source) ======
  await maybeCleanOrphans(targetPath);

  // ====== Upload de assets pesados pro R2 (se configurado) ======
  if (config.r2) {
    try {
      const r2Result = await uploadAssetsToR2(targetPath, category, slug, config.r2);
      if (r2Result.uploaded > 0 || r2Result.skipped > 0) {
        const touched = rewriteSourceForR2(targetPath, config.r2, r2Result.remoteMap, category, slug);
        const totalMb = (r2Result.totalBytes / 1024 / 1024).toFixed(1);
        console.log();
        ok(`R2: ${r2Result.uploaded} novo(s), ${r2Result.skipped} já existia(m) — ${totalMb}MB enviados`);
        ok(`Source reescrito em ${touched} arquivo(s) — referências agora apontam pro R2`);
      }
    } catch (e) {
      err(`Falha no upload R2: ${e.message}`);
      info("Pulando R2 — os assets vão pro git mesmo (zip pode estourar 100MB).");
    }
  } else {
    info(`${c.dim}R2 não configurado — assets vão pro git. Rode ${c.cyan}criarte-deploy r2-setup${c.reset}${c.dim} pra ativar.${c.reset}`);
  }

  // ====== Commit + push ======
  const sp3 = new Spinner("Commitando e subindo pro GitHub...").start();
  const gitOpts = { cwd: tmp, stdio: "pipe" };
  const verb = isUpdate ? "update" : "add";
  try {
    execSync(`git config user.email "${config.email}"`, gitOpts);
    execSync(`git config user.name "${config.name}"`, gitOpts);
    // Buffer maior pra pushes com imagens pesadas via HTTPS
    execSync(`git config http.postBuffer 524288000`, gitOpts);
    execSync(`git config http.maxRequestBuffer 100M`, gitOpts);
    execSync(`git config core.compression 0`, gitOpts);
    execSync(`git add sites/${category}/${slug}`, gitOpts);

    // Detecta se tem mudanças staged antes de tentar commitar
    const staged = execSync(`git diff --cached --name-only`, gitOpts).toString().trim();
    if (!staged) {
      sp3.warn("Nada mudou — site já tá sincronizado");
      console.log();
      info("Os arquivos enviados são idênticos aos que já estão publicados.");
      info("Não tem o que commitar. O site já está no ar.");
      rmSync(tmp, { recursive: true, force: true });
      console.log();
      console.log(`🌐 ${c.cyan}${targetUrl}${c.reset}\n`);
      return;
    }

    execSync(`git commit -m "feat(sites): ${verb} ${fullSlug}"`, gitOpts);
    // Tenta push; se falhar com erro de buffer, tenta de novo com --no-thin
    try {
      execSync(`git push`, gitOpts);
    } catch (pushErr) {
      const msg = (pushErr.stderr?.toString() || "") + (pushErr.stdout?.toString() || "");
      if (/HTTP 400|sideband|RPC failed|hung up/.test(msg)) {
        sp3.update("Push grande — tentando com configuração otimizada...");
        execSync(`git push --no-thin`, gitOpts);
      } else {
        throw pushErr;
      }
    }
  } catch (e) {
    sp3.fail("Falha ao subir");
    // Captura stderr + stdout pra dar contexto real do erro do git
    const stderr = e.stderr?.toString().trim();
    const stdout = e.stdout?.toString().trim();
    const errMsg = stderr || stdout || e.message;
    err(errMsg);
    if (/HTTP 400|sideband|RPC failed/i.test(errMsg)) {
      console.log();
      info("Geralmente isso acontece quando tem arquivo muito grande na pasta.");
      info("Dica: comprima imagens pesadas com https://squoosh.app ou https://tinypng.com");
      info("Arquivos grandes detectados:");
      const big = [];
      walkSource(cwd, (full, rel) => {
        const sz = statSync(full).size;
        if (sz > 5 * 1024 * 1024) big.push({ rel, sz });
      });
      big.sort((a, b) => b.sz - a.sz).slice(0, 5).forEach(f => {
        console.log(`   ${c.yellow}${(f.sz / 1024 / 1024).toFixed(1)} MB${c.reset}  ${f.rel}`);
      });
      if (!big.length) info("   (nenhum arquivo > 5MB encontrado — pode ser problema de rede)");
    }
    rmSync(tmp, { recursive: true, force: true });
    process.exit(1);
  }
  sp3.succeed("Código enviado pro GitHub");

  // Pega o SHA do commit recém-criado pra registrar no painel
  let commitSha = null;
  try {
    commitSha = execSync(`git rev-parse HEAD`, { cwd: tmp, stdio: "pipe" }).toString().trim();
  } catch {}
  rmSync(tmp, { recursive: true, force: true });

  // Registra deploy no painel pra alimentar a aba Fila do app iOS (best-effort)
  await registerDeployInPanel(config, fullSlug, isUpdate ? "update" : "new", commitSha);

  // ====== Monitora o deploy direto pela URL ======
  // Se tem subdomínio, mostra ele como URL principal mesmo monitorando a slug
  const displayUrl = subdomainUrl || targetUrl;
  if (noWait) {
    screen.phase("🚀 Push enviado", fullSlug);
    console.log(`Push pra ${c.cyan}${REPO}${c.reset} concluído.`);
    console.log(`Coolify vai detectar e rebuildar em ~30s. Site no ar em ~2-4min.`);
    console.log();
    if (subdomainUrl) {
      console.log(`🌐 ${c.bold}${c.cyan}${subdomainUrl}${c.reset} ${c.dim}(subdomínio)${c.reset}`);
      console.log(`🔗 ${c.dim}${targetUrl}${c.reset} ${c.dim}(slug, fallback)${c.reset}`);
    } else {
      console.log(`🌐 ${c.bold}${c.cyan}${targetUrl}${c.reset}\n`);
    }
    return;
  }
  screen.phase("👀 Acompanhando o deploy", fullSlug);
  const monitorResult = await monitorDeploy(targetUrl, config.panel_url);

  // ====== Resultado final ======
  if (monitorResult.ok) {
    screen.phase("🎉 Site no ar", fullSlug);
    if (subdomainUrl) {
      console.log(`🌐 ${c.bold}${c.cyan}${subdomainUrl}${c.reset} ${c.dim}(subdomínio)${c.reset}`);
      console.log(`🔗 ${c.dim}${targetUrl}${c.reset} ${c.dim}(slug, fallback)${c.reset}\n`);
    } else {
      console.log(`🌐 ${c.bold}${c.cyan}${targetUrl}${c.reset}\n`);
    }
    // Notifica painel que deploy concluiu com sucesso
    await notifyDeployComplete(config, fullSlug, "live", commitSha);
  } else {
    screen.phase("❌ Deploy falhou", fullSlug);
    if (monitorResult.reason) console.log(`${c.red}${monitorResult.reason}${c.reset}\n`);
    if (monitorResult.url) console.log(`📋 Ver detalhes: ${c.cyan}${monitorResult.url}${c.reset}\n`);
    await notifyDeployComplete(config, fullSlug, "failed", commitSha);
    process.exit(1);
  }
}

// ============================================================================
// MONITOR DO DEPLOY — polla a URL final até responder 200
// ============================================================================
// Coolify monitora o GitHub via App e rebuilda na infra (Hetzner). Build leva
// ~2-4min. Não temos workflow_run pra polar — checamos a URL final.
async function monitorDeploy(targetUrl, panelUrl) {
  const TIMEOUT_MS = 10 * 60 * 1000;
  const POLL_MS = 6000;
  const MAX_ATTEMPTS = Math.floor(TIMEOUT_MS / POLL_MS);

  // 1) Detecta estado inicial: site novo (404) ou re-deploy (200)?
  let initialOk = false;
  try {
    const r = await fetch(targetUrl, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(5000) });
    initialOk = r.ok;
  } catch {}

  // 2) Pega snapshot do uptime do painel ANTES do build — quando subir de novo,
  //    uptime reseta = sabemos que o rebuild aconteceu (heurística melhor que só URL)
  let preUptime = null;
  if (panelUrl) {
    try {
      const r = await fetch(`${panelUrl.replace(/\/$/, "")}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) preUptime = (await r.json()).uptime_s;
    } catch {}
  }

  const sp = new Spinner(
    initialOk
      ? "Re-deploy: aguardando Coolify rebuildar + restartar..."
      : "Site novo: aguardando primeira build..."
  ).start();

  const start = Date.now();
  let attempts = 0;
  let restartDetected = false;

  while (Date.now() - start < TIMEOUT_MS) {
    attempts++;
    const elapsed = Math.round((Date.now() - start) / 1000);
    sp.update(
      `${initialOk ? "Re-deploy" : "Site novo"} ${c.dim}· ${elapsed}s · tentativa ${attempts}/${MAX_ATTEMPTS}${c.reset}${restartDetected ? c.green + " · restart detectado" + c.reset : ""}`
    );

    // Checa restart do painel via health endpoint (uptime caiu = rebuildou)
    if (panelUrl && preUptime !== null && !restartDetected) {
      try {
        const r = await fetch(`${panelUrl.replace(/\/$/, "")}/api/health`, { signal: AbortSignal.timeout(4000) });
        if (r.ok) {
          const { uptime_s } = await r.json();
          if (uptime_s < preUptime) restartDetected = true;
        }
      } catch {}
    }

    // Pra novo: 200 = pronto
    // Pra re-deploy: restart detectado + 200 = pronto (assume cache invalidado)
    try {
      const r = await fetch(targetUrl, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        if (!initialOk) {
          sp.succeed(`Site no ar em ${elapsed}s`);
          return { ok: true, url: targetUrl };
        }
        if (restartDetected) {
          // Re-deploy: dá uns segundinhos extras pra cache do navegador invalidar
          await sleep(3000);
          sp.succeed(`Re-deploy completo em ${elapsed}s (restart confirmado)`);
          return { ok: true, url: targetUrl };
        }
      }
    } catch {}

    await sleep(POLL_MS);
  }

  sp.warn(`Timeout em ${Math.round(TIMEOUT_MS/60000)}min`);
  return {
    ok: false,
    reason: restartDetected
      ? "Painel rebuildou mas a URL não respondeu OK — pode ser erro de rota. Verifique manualmente."
      : "Coolify não rebuildou em 10min — verifique o painel da Coolify (Logs ou Deployments).",
    url: targetUrl,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ============================================================================
// LIST
// ============================================================================
async function cmdList() {
  miniHeader("📂 Sites publicados");
  const config = requireLogin();

  const sp = new Spinner("Buscando lista de sites...").start();
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/config/sites.json?ref=main`,
    { headers: { Authorization: `Bearer ${config.token}`, Accept: "application/vnd.github.v3.raw" } },
  );
  if (!res.ok) { sp.fail("Erro ao buscar lista"); process.exit(1); }
  const sites = await res.json();
  sp.succeed(`${sites.length} site(s) publicado(s)`);

  if (!sites.length) { info("Nenhum site publicado ainda."); return; }

  const byCat = {};
  for (const s of sites) (byCat[s.category] ||= []).push(s);
  for (const [cat, items] of Object.entries(byCat)) {
    console.log(`\n${c.bold}${cat}${c.reset} ${c.dim}(${items.length})${c.reset}`);
    for (const s of items) {
      const sub = s.subdomain ? ` ${c.green}→${c.reset} ${c.bold}https://${s.subdomain}${c.reset}` : "";
      console.log(`  ${c.green}●${c.reset} ${s.name.padEnd(28)} ${c.dim}${DEPLOY_DOMAIN}/${s.slug}${c.reset}${sub}`);
    }
  }
  console.log();
}

// ============================================================================
// CHECK (preflight standalone, sem fazer deploy)
// ============================================================================
async function cmdCheck() {
  miniHeader("🔍 Verificar estrutura do site");
  const cwd = process.cwd();
  const sp = new Spinner("Analisando...").start();
  const issues = await preflightChecks(cwd, "categoria", "slug");
  sp.succeed("Análise concluída");
  const result = await renderIssues(issues, cwd, "categoria", "slug");
  if (result.canDeploy) {
    ok("Site tá pronto pra publicar.");
    info(`Rode ${c.cyan}criarte-deploy${c.reset} pra subir.`);
  } else {
    err("Site tem erros que precisam ser corrigidos antes do deploy.");
  }
}

// ============================================================================
// HELP
// ============================================================================
function cmdHelp() {
  showBanner();
  console.log(`Publica sites finalizados no sistema multi-site sem precisar baixar o monorepo.

${c.bold}Comandos principais:${c.reset}

  ${c.cyan}criarte-deploy${c.reset}
    Publica o site da pasta atual (pergunta categoria + nome).

  ${c.cyan}criarte-deploy ${c.dim}<categoria> <nome> [--subdomain dominio.com]${c.reset}\n    Publica direto, sem perguntar.\n    Ex: ${c.dim}criarte-deploy casamento joao-maria${c.reset}\n    Ex: ${c.dim}criarte-deploy casamento joao-maria --subdomain joaoemaria.criartedesing.ao${c.reset}\n\n  ${c.cyan}criarte-deploy --direct ${c.dim}[categoria] [nome]${c.reset}\n    Upload direto pra VPS via API — sem git, sem rebuild do Coolify.\n    O site fica no ar em segundos, sem afetar os outros sites.\n    Ex: ${c.dim}criarte-deploy --direct casamento joao-maria${c.reset}

  ${c.cyan}criarte-deploy check${c.reset}
    Analisa estrutura do site SEM enviar.

  ${c.cyan}criarte-deploy list${c.reset}
    Lista todos os sites publicados.

${c.bold}Configuração:${c.reset}

  ${c.cyan}criarte-deploy login${c.reset}
    Configura tudo (GitHub + painel). Roda 1x.

  ${c.cyan}criarte-deploy panel${c.reset}
    Atualiza só URL+token do painel (sem refazer login GitHub).

  ${c.cyan}criarte-deploy doctor${c.reset}
    Diagnostica conexão GitHub + painel + R2.
    Roda antes de migrar muitos sites.

${c.bold}Assets pesados:${c.reset}

  ${c.cyan}criarte-deploy r2-setup${c.reset}
    Ativa upload de assets pesados pro Cloudflare R2.

  ${c.cyan}criarte-deploy r2-disable${c.reset}
    Desativa R2 — assets voltam pro git.

${c.bold}Fluxo do dia-a-dia (depois do login):${c.reset}

  ${c.dim}$${c.reset} cd ~/Desktop/joao-maria
  ${c.dim}$${c.reset} criarte-deploy
  ${c.dim}→ categoria → nome → validade → confirma → ☕ café → site no ar${c.reset}

${c.bold}Migração de muitos sites:${c.reset}

  ${c.dim}1.${c.reset} ${c.cyan}criarte-deploy doctor${c.reset}            ${c.dim}# garante que tudo tá ok${c.reset}
  ${c.dim}2.${c.reset} ${c.dim}cd ~/sites/joao-maria${c.reset}
  ${c.dim}3.${c.reset} ${c.cyan}criarte-deploy casamento joao-maria${c.reset}
  ${c.dim}4.${c.reset} ${c.dim}# repete pro próximo${c.reset}
`);
}

// ============================================================================
// PANEL — setup rápido só do panel_url + ADMIN_API_TOKEN
// (pra quem já tinha login GitHub mas precisa apontar pro Coolify)
// ============================================================================
async function cmdPanel() {
  screen.phase("🔗 Configurar painel");
  const existing = loadConfig();
  if (!existing) {
    err("Você ainda não fez login. Rode: criarte-deploy login");
    process.exit(1);
  }

  console.log(`URL atual: ${c.cyan}${existing.panel_url || "(não configurado)"}${c.reset}`);
  console.log(`Token:     ${existing.admin_api_token ? c.green + "✓ configurado" + c.reset : c.yellow + "✗ não configurado" + c.reset}`);
  console.log();

  const url = await ask(`URL do painel ${c.dim}(ex: http://...sslip.io)${c.reset}: `,
    { default: existing.panel_url || DEFAULT_PANEL_URL });
  const token = await ask(`Token (ADMIN_API_TOKEN): `, { hidden: true });

  const normalized = url.trim().replace(/\/$/, "");
  if (!/^https?:\/\//.test(normalized)) {
    err(`URL inválida: "${normalized}" — precisa começar com http:// ou https://`);
    process.exit(1);
  }
  if (!token || token.length < 16) {
    err("Token muito curto (mínimo 16 chars).");
    process.exit(1);
  }

  // Testa antes de salvar
  const sp = new Spinner("Testando conexão com o painel...").start();
  try {
    const res = await fetch(`${normalized}/api/health`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      sp.fail(`Painel respondeu ${res.status}`);
      err("Verifique a URL — talvez o painel esteja offline ou em outra URL.");
      process.exit(1);
    }
    const health = await res.json();
    sp.succeed(`Painel respondeu (uptime ${Math.round((health.uptime_s || 0) / 60)}min)`);
  } catch (e) {
    sp.fail("Falha ao conectar");
    err(e.message);
    process.exit(1);
  }

  // Testa o token
  const sp2 = new Spinner("Validando token...").start();
  try {
    const res = await fetch(`${normalized}/api/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401) {
      sp2.fail("Token inválido (401)");
      err("O ADMIN_API_TOKEN não bate com o que tá no painel.");
      process.exit(1);
    }
    if (!res.ok) {
      sp2.warn(`Painel respondeu ${res.status} (não-fatal)`);
    } else {
      sp2.succeed("Token válido");
    }
  } catch (e) {
    sp2.warn(`Não consegui validar: ${e.message}`);
  }

  saveConfig({ ...existing, panel_url: normalized, admin_api_token: token });
  ok("Configuração salva.");
  console.log();
  info(`Próximos deploys vão pra ${c.cyan}${normalized}${c.reset}`);
}

// ============================================================================
// DOCTOR — health-check completo
// ============================================================================
async function cmdDoctor() {
  screen.phase("🩺 Diagnóstico");
  const config = loadConfig();

  let allOk = true;
  const check = (label, ok, detail = "") => {
    const sym = ok ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
    console.log(`  ${sym} ${label}${detail ? ` ${c.dim}— ${detail}${c.reset}` : ""}`);
    if (!ok) allOk = false;
  };

  console.log(`${c.bold}Config local${c.reset}`);
  check("config existe", !!config, config ? CONFIG_FILE : "rode 'criarte-deploy login'");
  if (!config) { console.log(); err("Sem config, não dá pra continuar."); process.exit(1); }
  check("GitHub token", !!config.token, config.token ? `${config.token.slice(0, 7)}...` : "ausente");
  check("Email", !!config.email, config.email);
  check("Panel URL", !!config.panel_url, config.panel_url || "ausente (rode 'criarte-deploy panel')");
  check("Admin API token", !!config.admin_api_token, config.admin_api_token ? "configurado" : "ausente");
  check("R2 config", !!config.r2, config.r2 ? `bucket ${config.r2.bucket}` : "desativado (opcional)");
  console.log();

  console.log(`${c.bold}GitHub${c.reset}`);
  const ghSp = new Spinner("Validando GitHub token e acesso ao repo...").start();
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: { Authorization: `Bearer ${config.token}`, Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const repo = await res.json();
      ghSp.clear();
      check("Token válido + acesso ao repo", true, `${repo.full_name} (${repo.private ? "privado" : "público"})`);
    } else {
      ghSp.clear();
      check("Token válido", false, `HTTP ${res.status}`);
    }
  } catch (e) {
    ghSp.clear();
    check("Conexão com api.github.com", false, e.message);
  }
  console.log();

  if (config.panel_url) {
    console.log(`${c.bold}Painel${c.reset}`);
    const healthSp = new Spinner(`Pingando ${config.panel_url}...`).start();
    try {
      const res = await fetch(`${config.panel_url.replace(/\/$/, "")}/api/health`, { signal: AbortSignal.timeout(8000) });
      const body = res.ok ? await res.json() : null;
      healthSp.clear();
      check("/api/health respondendo", res.ok, body ? `uptime ${Math.round((body.uptime_s || 0) / 60)}min · node ${body.node_version || "?"}` : `HTTP ${res.status}`);
    } catch (e) {
      healthSp.clear();
      check("/api/health respondendo", false, e.message);
    }

    if (config.admin_api_token) {
      const dashSp = new Spinner("Verificando token contra /api/dashboard...").start();
      try {
        const res = await fetch(`${config.panel_url.replace(/\/$/, "")}/api/dashboard`, {
          headers: { Authorization: `Bearer ${config.admin_api_token}` },
          signal: AbortSignal.timeout(8000),
        });
        dashSp.clear();
        if (res.ok) {
          const data = await res.json();
          const stats = data.server?.process ? `RAM ${data.server.process.ram_mb.toFixed(0)}MB · ${data.sites?.total || 0} sites` : "dashboard ok";
          check("Token válido (dashboard acessível)", true, stats);
        } else if (res.status === 401) {
          check("Token válido", false, "401 — ADMIN_API_TOKEN não bate com o do servidor");
        } else {
          check("Dashboard reachable", false, `HTTP ${res.status}`);
        }
      } catch (e) {
        dashSp.clear();
        check("Token válido", false, e.message);
      }
    }
    console.log();
  }

  if (config.r2) {
    console.log(`${c.bold}Cloudflare R2${c.reset}`);
    check("Account ID", !!config.r2.accountId);
    check("Bucket", !!config.r2.bucket, config.r2.bucket);
    check("Access keys", !!(config.r2.accessKeyId && config.r2.secretAccessKey));
    check("Public URL", !!config.r2.publicUrl, config.r2.publicUrl);
    console.log();
  }

  if (allOk) {
    ok("Tudo verde. Pode migrar sites sem medo.");
  } else {
    warn("Algumas verificações falharam. Corrija antes de migrar em massa.");
  }
}

// ============================================================================
// R2 — Cloudflare Object Storage (S3-compatible)
// ============================================================================
async function cmdR2Setup() {
  miniHeader("☁️  Configurar Cloudflare R2");
  const config = requireLogin();

  console.log("Vamos configurar o upload de assets pesados pro R2.");
  console.log("Antes de continuar, você precisa de 4 valores do dashboard do Cloudflare:\n");
  console.log(`  ${c.dim}1.${c.reset} Endpoint S3            ${c.dim}(https://<conta>.r2.cloudflarestorage.com)${c.reset}`);
  console.log(`  ${c.dim}2.${c.reset} Nome do bucket          ${c.dim}(ex: criarte)${c.reset}`);
  console.log(`  ${c.dim}3.${c.reset} Public Development URL  ${c.dim}(https://pub-xxx.r2.dev)${c.reset}`);
  console.log(`  ${c.dim}4.${c.reset} Access Key ID + Secret Key  ${c.dim}(do API Token)${c.reset}\n`);

  const endpoint = await ask("Endpoint S3 → ");
  // Endpoint pode vir com o bucket no path (ex: .../criarte) — separa
  let cleanEndpoint = endpoint.trim().replace(/\/$/, "");
  let bucketFromEndpoint = "";
  const m = cleanEndpoint.match(/^(https:\/\/[^/]+)\/([^/]+)$/);
  if (m) { cleanEndpoint = m[1]; bucketFromEndpoint = m[2]; }

  const bucket = await ask("Nome do bucket → ", { default: bucketFromEndpoint });
  const publicUrl = (await ask("Public Development URL → ")).replace(/\/$/, "");
  const accessKeyId = await ask("Access Key ID → ");
  const secretAccessKey = await ask("Secret Access Key → ", { hidden: true });

  if (!cleanEndpoint || !bucket || !publicUrl || !accessKeyId || !secretAccessKey) {
    err("Todos os campos são obrigatórios.");
    process.exit(1);
  }
  if (!/^https:\/\//.test(cleanEndpoint))    { err("Endpoint inválido (precisa começar com https://)"); process.exit(1); }
  if (!/^https:\/\/pub-/.test(publicUrl))     { err("Public URL inválida (precisa ser https://pub-xxx.r2.dev)"); process.exit(1); }

  // Testa criando um cliente e fazendo um HEAD
  const sp = new Spinner("Testando credenciais...").start();
  const s3 = new S3Client({
    region: "auto",
    endpoint: cleanEndpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  try {
    // Sobe um arquivo de teste e remove via PutObjectCommand
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: ".criarte-deploy-test",
      Body: "ok",
      ContentType: "text/plain",
    }));
    sp.succeed("Credenciais válidas — consegui escrever no bucket");
  } catch (e) {
    sp.fail("Credenciais inválidas ou sem permissão");
    err(e.message);
    info("Confirma se o token tem permissão 'Object Read & Write' e cobre esse bucket.");
    process.exit(1);
  }

  saveConfig({
    ...config,
    r2: { endpoint: cleanEndpoint, bucket, publicUrl, accessKeyId, secretAccessKey },
  });

  ok("R2 configurado!");
  info(`Daqui pra frente, ${c.cyan}criarte-deploy${c.reset} vai subir assets pesados (>${SMALL_LIMIT_KB}KB) automaticamente pro R2.`);
  info(`Pra desativar: ${c.cyan}criarte-deploy r2-disable${c.reset}`);
}

async function cmdR2Disable() {
  const config = requireLogin();
  if (!config.r2) { warn("R2 já está desativado."); return; }
  delete config.r2;
  saveConfig(config);
  ok("R2 desativado. Próximos deploys vão incluir tudo no git.");
}

// Tamanho mínimo pra enviar pro R2. Arquivos menores que isso ficam no Git
// (não vale a pena pagar request fee + latência pra 50KB).
const SMALL_LIMIT_KB = 100;

const MIME_TYPES = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".avif": "image/avif", ".ico": "image/x-icon",
  ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".wav": "audio/wav",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
  ".pdf": "application/pdf",
};

function getMimeType(file) {
  return MIME_TYPES[extname(file).toLowerCase()] || "application/octet-stream";
}

/**
 * Faz upload dos assets pesados pro R2 e reescreve o source pra apontar pras
 * URLs públicas. Trabalha sobre a CÓPIA do site no temp dir, não toca os
 * arquivos originais do usuário.
 *
 * Retorna { uploaded: number, totalBytes: number, skipped: number }
 */
/**
 * Procura no source (src/, app/, etc — não public/) por arquivos referenciados
 * via `import` ou `require`. Esses arquivos precisam ficar locais — next/font/local,
 * webpack asset imports, etc, exigem o arquivo no disco no momento do build.
 *
 * Retorna Set com nomes-base de arquivos a NÃO subir pro R2.
 */
function detectImportedAssets(siteCopyPath) {
  const imported = new Set();
  const EXTS = /\.(tsx?|jsx?|css|scss|mjs|cjs|html)$/;
  // Detecta QUALQUER string com caminho relativo (./X, ../X, public/X) terminando em
  // extensão de asset. Pega: `import "../font.ttf"`, `localFont({ src: "../X.ttf" })`,
  // `require("./img.png")`, etc. Caminhos RELATIVOS no source significam que o
  // arquivo precisa estar no disco no build time — não pode ir pro R2.
  const ASSET_EXT_GROUP = "ttf|otf|woff2?|eot|png|jpe?g|gif|webp|svg|avif|ico|mp3|mp4|webm|m4a|ogg|wav|mov|pdf";
  const REL_PATH_RE = new RegExp(
    `["'\`]((?:\\./|\\.\\./|public/)[^"'\`]+\\.(?:${ASSET_EXT_GROUP}))["'\`]`,
    "gi",
  );

  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      if (entry === "public" || entry === "node_modules" || entry === ".next" || entry === "out") continue;
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) { walk(full); continue; }
      if (!EXTS.test(entry)) continue;
      const content = readFileSync(full, "utf8");
      let m;
      while ((m = REL_PATH_RE.exec(content)) !== null) {
        const filename = basename(m[1]);
        imported.add(filename);
      }
    }
  }
  walk(siteCopyPath);
  return imported;
}

// Arquivos especiais que o browser/crawlers acessam direto sem aparecer no
// source — nunca devem ser marcados como órfãos.
const ALWAYS_USED = new Set([
  "favicon.ico", "favicon.png", "favicon-16x16.png", "favicon-32x32.png",
  "robots.txt", "sitemap.xml", "site.webmanifest", "manifest.json",
  "apple-touch-icon.png", "apple-touch-icon-precomposed.png",
  "android-chrome-192x192.png", "android-chrome-512x512.png",
  "browserconfig.xml", "mstile-150x150.png",
  ".gitkeep", ".keep",
]);

/**
 * Detecta arquivos em public/ que NUNCA são referenciados pelo source.
 * Filename match (basename) — pega tanto `/assets/X` quanto `../../public/X`
 * e variantes em CSS url(). É conservador: se o nome aparece em qualquer
 * lugar do source, considera usado.
 *
 * Retorna { used: Set<basename>, orphans: Array<{publicRel, sz, fullPath}> }
 */
function detectOrphanAssets(siteCopyPath) {
  const publicDir = join(siteCopyPath, "public");
  if (!existsSync(publicDir)) return { used: new Set(), orphans: [] };

  // 1) Coleta TODOS os arquivos de public/ com seu nome-base
  const publicFiles = []; // { basename, publicRel, fullPath, sz }
  function walkPub(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walkPub(full);
      else publicFiles.push({
        basename: entry,
        publicRel: relative(publicDir, full).replace(/\\/g, "/"),
        fullPath: full,
        sz: st.size,
      });
    }
  }
  walkPub(publicDir);

  if (publicFiles.length === 0) return { used: new Set(), orphans: [] };

  // 2) Concatena todo o source em uma string gigante e procura cada basename
  const SOURCE_EXTS = /\.(tsx?|jsx?|css|scss|sass|html|mjs|cjs|json|md|svg)$/i;
  let sourceBlob = "";
  function walkSrc(dir) {
    for (const entry of readdirSync(dir)) {
      if (entry === "public" || entry === "node_modules" || entry === ".next" || entry === "out" || entry === "dist") continue;
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) { walkSrc(full); continue; }
      if (!SOURCE_EXTS.test(entry)) continue;
      try { sourceBlob += "\n" + readFileSync(full, "utf8"); } catch {}
    }
  }
  walkSrc(siteCopyPath);

  // 3) Pra cada arquivo de public/, checa se o nome aparece no source
  const used = new Set();
  const orphans = [];
  for (const f of publicFiles) {
    if (ALWAYS_USED.has(f.basename)) {
      used.add(f.basename);
      continue;
    }
    // Match por basename — mais permissivo (evita falsos positivos)
    // Aceita: foo.png, /foo.png, "foo.png", "/path/foo.png", etc.
    if (sourceBlob.includes(f.basename)) {
      used.add(f.basename);
    } else {
      orphans.push(f);
    }
  }
  return { used, orphans };
}

async function maybeCleanOrphans(siteCopyPath) {
  const { orphans } = detectOrphanAssets(siteCopyPath);
  if (orphans.length === 0) return { removed: 0, savedBytes: 0 };

  const totalBytes = orphans.reduce((a, o) => a + o.sz, 0);
  const totalMb = (totalBytes / 1024 / 1024).toFixed(2);

  console.log();
  console.log(`${c.yellow}🗑${c.reset}  ${c.bold}${orphans.length} arquivo(s) órfão(s)${c.reset} ${c.dim}(${totalMb} MB total)${c.reset}`);
  console.log(`${c.dim}   Não são referenciados em nenhum lugar do source:${c.reset}`);
  for (const o of orphans.slice(0, 10)) {
    const mb = o.sz >= 1024 * 1024
      ? `${(o.sz / 1024 / 1024).toFixed(2)} MB`
      : `${(o.sz / 1024).toFixed(0)} KB`;
    console.log(`   ${c.dim}·${c.reset} ${o.publicRel} ${c.dim}(${mb})${c.reset}`);
  }
  if (orphans.length > 10) console.log(`   ${c.dim}… e mais ${orphans.length - 10}${c.reset}`);

  console.log();
  const yn = await ask(`Remover esses arquivos do deploy? ${c.dim}(S/n)${c.reset} → `, { default: "s" });
  if (yn.toLowerCase() === "n" || yn.toLowerCase() === "nao" || yn.toLowerCase() === "não") {
    info("Mantendo órfãos no deploy.");
    return { removed: 0, savedBytes: 0 };
  }

  for (const o of orphans) {
    rmSync(o.fullPath, { force: true });
  }
  // Remove pastas vazias
  const publicDir = join(siteCopyPath, "public");
  function pruneEmpty(dir) {
    if (!existsSync(dir) || dir === publicDir) return;
    if (!statSync(dir).isDirectory()) return;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) pruneEmpty(full);
    }
    if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true, force: true });
  }
  function pruneAll(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) pruneAll(full);
    }
    if (dir !== publicDir && existsSync(dir) && readdirSync(dir).length === 0) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  pruneAll(publicDir);

  ok(`${orphans.length} arquivo(s) órfão(s) removido(s) — ${totalMb} MB economizado(s)`);
  info(`${c.dim}Arquivos originais em ${cwdNote(siteCopyPath)} permanecem intactos.${c.reset}`);
  return { removed: orphans.length, savedBytes: totalBytes };
}

function cwdNote(siteCopyPath) {
  // Mostra hint útil pro user — diz que a remoção foi só na cópia
  return "~/Downloads/<seu site>";
}

async function uploadAssetsToR2(siteCopyPath, category, slug, r2Config) {
  const s3 = new S3Client({
    region: "auto",
    endpoint: r2Config.endpoint,
    credentials: { accessKeyId: r2Config.accessKeyId, secretAccessKey: r2Config.secretAccessKey },
  });

  // Lista todos os arquivos em public/ — eles são os candidatos
  const publicDir = join(siteCopyPath, "public");
  if (!existsSync(publicDir)) {
    return { uploaded: 0, totalBytes: 0, skipped: 0, remoteMap: new Map() };
  }

  // Detecta arquivos importados via `import`/`require` no source — esses
  // PRECISAM ficar locais (next/font/local, webpack asset modules, etc).
  const importedAssets = detectImportedAssets(siteCopyPath);
  if (importedAssets.size > 0) {
    info(`${importedAssets.size} asset(s) detectado(s) como import — mantidos locais: ${c.dim}${[...importedAssets].slice(0, 5).join(", ")}${importedAssets.size > 5 ? "…" : ""}${c.reset}`);
  }

  // Coleta arquivos elegíveis (> SMALL_LIMIT_KB e NÃO importados via código)
  const candidates = []; // { localPath, publicRelPath, sz }
  let protectedCount = 0;
  function walkPublic(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) { walkPublic(full); continue; }
      if (st.size < SMALL_LIMIT_KB * 1024) continue;
      // Pula se o arquivo é importado em código (basename match)
      if (importedAssets.has(entry)) { protectedCount++; continue; }
      const publicRel = relative(publicDir, full).replace(/\\/g, "/");
      candidates.push({ localPath: full, publicRelPath: publicRel, sz: st.size });
    }
  }
  walkPublic(publicDir);
  if (protectedCount > 0) {
    info(`${protectedCount} arquivo(s) pesado(s) mantido(s) local pq são importados via código`);
  }

  if (candidates.length === 0) {
    return { uploaded: 0, totalBytes: 0, skipped: 0, remoteMap: new Map() };
  }

  console.log(`\n${c.bold}📤 Upload de ${candidates.length} asset(s) pro R2:${c.reset}`);

  const remoteMap = new Map(); // publicRelPath -> URL pública
  let uploaded = 0;
  let totalBytes = 0;
  let skipped = 0;

  for (let i = 0; i < candidates.length; i++) {
    const { localPath, publicRelPath, sz } = candidates[i];
    const key = `${category}/${slug}/${publicRelPath}`;
    const publicAssetUrl = `${r2Config.publicUrl}/${key}`;
    const mb = (sz / 1024 / 1024).toFixed(2);

    // Verifica se já está lá (skip pra ser idempotente)
    let exists = false;
    try {
      await s3.send(new HeadObjectCommand({ Bucket: r2Config.bucket, Key: key }));
      exists = true;
    } catch {}

    if (exists) {
      process.stdout.write(`  ${c.dim}↻${c.reset} ${publicRelPath} ${c.dim}(${mb}MB — já existe)${c.reset}\n`);
      remoteMap.set(publicRelPath, publicAssetUrl);
      skipped++;
      continue;
    }

    const sp = new Spinner(`Subindo ${publicRelPath} (${mb}MB) ${c.dim}[${i + 1}/${candidates.length}]${c.reset}`).start();
    try {
      await s3.send(new PutObjectCommand({
        Bucket: r2Config.bucket,
        Key: key,
        Body: readFileSync(localPath),
        ContentType: getMimeType(localPath),
        CacheControl: "public, max-age=31536000, immutable",
      }));
      sp.succeed(`${publicRelPath} ${c.dim}(${mb}MB)${c.reset}`);
      remoteMap.set(publicRelPath, publicAssetUrl);
      uploaded++;
      totalBytes += sz;
    } catch (e) {
      sp.fail(`Falha em ${publicRelPath}: ${e.message}`);
      throw e;
    }
  }

  return { uploaded, totalBytes, skipped, remoteMap };
}

/**
 * Reescreve referências no source: /assets/foo.png → https://pub-xxx.r2.dev/<cat>/<slug>/assets/foo.png
 * Também remove os arquivos do public/ que já estão no R2 (pra não ir no git).
 */
function rewriteSourceForR2(siteCopyPath, r2Config, remoteMap, category, slug) {
  if (remoteMap.size === 0) return 0;

  let touched = 0;
  // Mapa de prefixos a substituir: /assets/, /fonts/, /videos/, etc
  // Pega os primeiros segmentos únicos dos publicRelPath
  const prefixes = new Set();
  for (const key of remoteMap.keys()) {
    const first = key.split("/")[0];
    if (first) prefixes.add(first);
  }

  // Walk no source (excluindo public/ — ele será removido depois)
  const EXTS = /\.(tsx?|jsx?|css|scss|html|mjs|cjs|json|md)$/;
  function walkSrc(dir) {
    for (const entry of readdirSync(dir)) {
      if (entry === "public" || entry === "node_modules" || entry === ".next" || entry === "out") continue;
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) { walkSrc(full); continue; }
      if (!EXTS.test(entry)) continue;

      let content = readFileSync(full, "utf8");
      let changed = false;

      for (const prefix of prefixes) {
        // Match `/assets/<algo-sem-aspas>` precedido por aspas, parêntese, vírgula, espaço ou início
        // Captura: precedente + caminho relativo dentro do prefixo
        const re = new RegExp(`(["'(\`,\\s=])/${prefix}/([^"'\`)\\s]+)`, "g");
        content = content.replace(re, (m, pre, rest) => {
          const publicRel = `${prefix}/${rest}`;
          if (remoteMap.has(publicRel)) {
            changed = true;
            return `${pre}${remoteMap.get(publicRel)}`;
          }
          return m;
        });
      }
      if (changed) {
        writeFileSync(full, content);
        touched++;
      }
    }
  }
  walkSrc(siteCopyPath);

  // Remove os arquivos do public/ que foram pro R2 — eles não precisam mais
  // estar no git. Mas mantém os pequenos (<100KB) que ficaram no git.
  const publicDir = join(siteCopyPath, "public");
  for (const publicRel of remoteMap.keys()) {
    const localPath = join(publicDir, publicRel);
    if (existsSync(localPath)) rmSync(localPath);
  }
  // Remove pastas vazias que sobraram (assets/, fonts/, etc)
  function pruneEmpty(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) pruneEmpty(full);
    }
    if (readdirSync(dir).length === 0 && dir !== publicDir) rmSync(dir, { recursive: true, force: true });
  }
  pruneEmpty(publicDir);

  return touched;
}

// ============================================================================
// DIRECT DEPLOY (upload direto pra VPS via API — sem git, sem rebuild)
// ============================================================================
async function cmdRemove(argv) {
  const config = requireLogin();
  const targetUrl = (config.panel_url || "").replace(/\/$/, "");
  if (!targetUrl || !config.admin_api_token) {
    err("Painel/token não configurados. Rode: criarte-deploy panel");
    process.exit(1);
  }

  let argSlug = argv.find(a => !a.startsWith("-"));
  let force = argv.includes("--force") || argv.includes("-f");
  if (!argSlug) {
    err("Uso: criarte-deploy rm <categoria>/<nome> [--force]");
    process.exit(1);
  }
  const slug = argSlug.toLowerCase().replace(/^\/+|\/+$/g, "");
  if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(slug)) {
    err(`Slug inválido: ${slug}`);
    process.exit(1);
  }

  miniHeader(`🗑  Remover site: ${slug}`);
  console.log(`  ${c.dim}Servidor:${c.reset} ${targetUrl}`);
  console.log(`  ${c.dim}Slug:${c.reset}     ${c.bold}${slug}${c.reset}`);
  console.log(`  ${c.dim}Apaga:${c.reset}    arquivos da VPS + assets do R2 + registro`);
  console.log();

  if (!force) {
    const ans = await ask(`Confirmar remoção? ${c.red}(digite o slug pra confirmar)${c.reset} → `);
    if (ans.trim().toLowerCase() !== slug) {
      warn("Cancelado.");
      process.exit(0);
    }
  }

  const sp = new Spinner("Removendo...").start();
  try {
    const res = await fetch(`${targetUrl}/api/sites/remove`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.admin_api_token}`,
      },
      body: JSON.stringify({ slug }),
      signal: AbortSignal.timeout(60000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      sp.fail(`Falha: ${data.error || `HTTP ${res.status}`}`);
      process.exit(1);
    }
    sp.succeed("Removido");
    console.log();
    if (data.existed === false) warn("Site não estava no registry (talvez já tivesse sido removido).");
    ok(`VPS: ${data.fs ? "arquivos apagados" : "nada a apagar"}`);
    if (data.r2) {
      ok(`R2: ${data.r2.deleted} objeto(s) deletado(s)${data.r2.errors?.length ? ` ${c.yellow}(${data.r2.errors.length} erro(s))${c.reset}` : ""}`);
    } else {
      info(`${c.dim}R2 não configurado no servidor — assets do R2 (se houver) não foram tocados.${c.reset}`);
    }
  } catch (e) {
    sp.fail("Erro de rede");
    err(e.message);
    process.exit(1);
  }
}

async function cmdDirectDeploy(argv) {
  const config = requireLogin();
  const targetUrl = (config.panel_url || "").replace(/\/$/, "");
  if (!targetUrl) {
    err("URL do painel não configurada. Rode: criarte-deploy panel");
    process.exit(1);
  }
  if (!config.admin_api_token) {
    err("Token de admin não configurado. Rode: criarte-deploy panel");
    process.exit(1);
  }

  screen.phase("📦 Publicar site (upload direto)", "VPS: " + targetUrl);

  let noWait = argv.includes("--no-wait");

  // Extrai flags
  let subdomain = null;
  const subIdx = argv.indexOf("--subdomain");
  if (subIdx >= 0) {
    subdomain = argv[subIdx + 1] || null;
    if (subdomain && (subdomain.startsWith("--") || subdomain.startsWith("-"))) subdomain = null;
    argv.splice(subIdx, subdomain ? 2 : 1);
  }
  argv = argv.filter((a) => !a.startsWith("--"));

  const cwd = process.cwd();
  let [rawCategory, rawSlug] = argv;

  // Pergunta categoria
  let category = rawCategory;
  while (!category || !/^[a-z0-9-]+$/.test(category)) {
    const raw = await ask(`Categoria ${c.dim}(ex: casamento, aniversario)${c.reset}: `);
    if (raw && /^[a-z0-9-]+$/.test(raw.trim().toLowerCase())) {
      category = raw.trim().toLowerCase();
    } else {
      warn("Apenas letras minúsculas, números e hífens.");
    }
  }

  // Slug
  let slug = rawSlug;
  if (!slug) {
    slug = basename(cwd).toLowerCase().replace(/[^a-z0-9-]/g, "");
    const suggested = slug;
    const raw = await ask(`Slug ${c.dim}(${suggested})${c.reset}: `);
    if (raw.trim()) slug = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    else slug = suggested;
    if (!slug) { err("Slug inválido"); process.exit(1); }
  } else {
    slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
  }

  const fullSlug = `${category}/${slug}`;
  const liveDomain = (config.panel_url || DEPLOY_DOMAIN).replace(/\/$/, "");
  const targetUrlSlug = `${liveDomain}/${fullSlug}`;
  const futureDomain = DEFAULT_PANEL_URL.replace(/\/$/, "");
  const futureUrl = futureDomain !== liveDomain ? `${futureDomain}/${fullSlug}` : null;

  // Subdomínio personalizado
  if (!subdomain) {
    console.log();
    console.log(`${c.bold}Subdomínio personalizado${c.reset} ${c.dim}(opcional)${c.reset}`);
    console.log(`${c.dim}Deixe vazio pra pular. O site vai ficar em ${fullSlug}${c.reset}`);
    const raw = await ask(`Subdomínio ${c.dim}(ex: cliente.criartedesing.ao)${c.reset}: `);
    if (raw.trim()) {
      subdomain = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    }
  }
  const subdomainUrl = subdomain ? `https://${subdomain}` : null;

  // Análise pré-deploy
  screen.phase("🔍 Análise", `${fullSlug}`);
  const sp1 = new Spinner("Analisando arquivos...").start();
  const pkgPath = join(cwd, "package.json");
  let isNextSource = false;
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      isNextSource = !!deps.next;
      console.log("[debug] deps.next =", deps.next, "→ isNextSource =", isNextSource);
      if (isNextSource) {
        console.log("[debug] buildDir será cwd (source project)");
      } else {
        console.log("[debug] buildDir será out/ ou public/ (static site)");
      }
    } catch (e) {
      console.log("[debug] erro ao ler package.json:", e.message);
    }
  } else {
    console.log("[debug] package.json não encontrado em:", pkgPath);
  }
  if (isNextSource) info("Projeto Next.js detectado — build será feito na VPS");
  const publicDir = join(cwd, "public");
  const outDir = join(cwd, "out");
  const buildDir = isNextSource ? cwd : (existsSync(outDir) ? outDir : (existsSync(publicDir) ? publicDir : cwd));
  sp1.clear();

  // Conta arquivos (exclui node_modules e outras pastas ignoradas)
  const IGNORE_DIRS_WALK = new Set(["node_modules", ".next", "out", ".git", "dist", ".turbo", ".vscode", ".idea", ".cache", "__pycache__"]);
  let totalFiles = 0;
  let totalSize = 0;
  function walk(dir) {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (!IGNORE_DIRS_WALK.has(e)) walk(full);
        continue;
      }
      if (st.isFile()) {
        totalFiles++;
        totalSize += st.size;
      }
    }
  }
  walk(buildDir);
  const sizeMb = (totalSize / 1024 / 1024).toFixed(1);
  ok(`${totalFiles} arquivo(s), ${sizeMb}MB`);

  // Expiração
  screen.phase("⏳ Validade", fullSlug);
  const expires_at = await askExpiration(join(cwd, "site.json"));

  // Resumo
  screen.phase("📋 Resumo", fullSlug);
  console.log(`  ${c.dim}Pasta:${c.reset}    ${cwd}`);
  console.log(`  ${c.dim}Destino:${c.reset}  ${fullSlug}`);
  if (subdomainUrl) {
    console.log(`  ${c.dim}Subdomínio:${c.reset} ${c.bold}${c.cyan}${subdomainUrl}${c.reset}`);
  } else {
    console.log(`  ${c.dim}URL:${c.reset}      ${c.cyan}${targetUrl}/${fullSlug}${c.reset}`);
  }
  console.log(`  ${c.dim}Expira:${c.reset}   ${expires_at ? `${c.bold}${expires_at}${c.reset}` : `${c.dim}sem expiração${c.reset}`}`);
  console.log();

  const confirm = await ask(`Confirmar envio? ${c.dim}(s/N)${c.reset} → `);
  if (confirm.toLowerCase() !== "s" && confirm.toLowerCase() !== "sim") {
    warn("Cancelado.");
    process.exit(0);
  }

  // ====== Staging: copia cwd pra temp dir antes de zipar ======
  // Permite limpar órfãos + upar pro R2 + reescrever paths SEM tocar no projeto original
  screen.phase("📂 Staging", fullSlug);
  const stagingDir = mkdtempSync(join(tmpdir(), `criarte-stage-${slug}-`));
  const sp1b = new Spinner("Copiando arquivos pro staging...").start();
  const IGNORE_STAGE = new Set(["node_modules", ".next", "out", ".git", "dist", ".turbo", ".vscode", ".idea", ".cache", "__pycache__"]);
  function copyTree(src, dst) {
    mkdirSync(dst, { recursive: true });
    for (const entry of readdirSync(src)) {
      if (IGNORE_STAGE.has(entry)) continue;
      const s = join(src, entry);
      const d = join(dst, entry);
      const st = statSync(s);
      if (st.isDirectory()) copyTree(s, d);
      else cpSync(s, d);
    }
  }
  try {
    copyTree(isNextSource ? cwd : buildDir, stagingDir);
    sp1b.succeed("Staging pronto");
  } catch (e) {
    sp1b.fail("Falha no staging");
    err(e.message);
    rmSync(stagingDir, { recursive: true, force: true });
    process.exit(1);
  }

  // ====== Limpa órfãos (assets em public/ não referenciados) ======
  if (isNextSource) {
    try { await maybeCleanOrphans(stagingDir); } catch (e) { warn(`Skip orphan cleanup: ${e.message}`); }
  }

  // ====== Upload de assets pesados pro R2 ======
  if (config.r2 && isNextSource) {
    try {
      const r2Result = await uploadAssetsToR2(stagingDir, category, slug, config.r2);
      if (r2Result.uploaded > 0 || r2Result.skipped > 0) {
        const touched = rewriteSourceForR2(stagingDir, config.r2, r2Result.remoteMap, category, slug);
        const totalMb = (r2Result.totalBytes / 1024 / 1024).toFixed(1);
        console.log();
        ok(`R2: ${r2Result.uploaded} novo(s), ${r2Result.skipped} já existia(m) — ${totalMb}MB`);
        ok(`Source reescrito em ${touched} arquivo(s) — assets servidos pelo R2`);
      }
    } catch (e) {
      err(`Falha no upload R2: ${e.message}`);
      info("Pulando R2 — assets vão pra VPS no zip.");
    }
  } else if (!config.r2 && isNextSource) {
    info(`${c.dim}R2 não configurado — assets vão pra VPS. Rode ${c.cyan}criarte-deploy r2-setup${c.reset}${c.dim} pra ativar.${c.reset}`);
  }

  // ====== Cria o zip a partir do staging ======
  screen.phase("🚀 Enviando", fullSlug);
  const sp2 = new Spinner("Compactando arquivos...").start();

  const tmpZip = join(tmpdir(), `criarte-deploy-${slug}.zip`);
  try {
    execSync(`cd "${stagingDir}" && zip -r "${tmpZip}" .`, { stdio: "pipe", timeout: 120000 });
  } catch (e) {
    sp2.fail("Falha ao criar zip");
    err(e.stderr?.toString() || e.message);
    rmSync(stagingDir, { recursive: true, force: true });
    process.exit(1);
  }

  // Recalcula tamanho do zip pós-staging (órfãos removidos + R2)
  const finalSize = statSync(tmpZip).size;
  const finalMb = (finalSize / 1024 / 1024).toFixed(1);
  sp2.succeed(`Zip pronto: ${finalMb}MB ${finalSize < totalSize ? c.dim + `(${sizeMb}MB original)` + c.reset : ""}`);
  rmSync(stagingDir, { recursive: true, force: true });

  // ====== Upload pra VPS ======
  const sp3 = new Spinner("Enviando pra VPS...").start();
  const uploadUrl = isNextSource
    ? `${targetUrl}/api/sites/upload`
    : `${targetUrl}/api/sites/upload`;
  const zipBuffer = readFileSync(tmpZip);

  try {
    // Usa FormData via fetch (Node 18+ tem fetch nativo)
    const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`;
    const bodyParts = [];

    // slug
    bodyParts.push(`--${boundary}\r\nContent-Disposition: form-data; name="slug"\r\n\r\n${fullSlug}\r\n`);
    // name
    bodyParts.push(`--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\n${slug.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ")}\r\n`);
    // category
    bodyParts.push(`--${boundary}\r\nContent-Disposition: form-data; name="category"\r\n\r\n${category}\r\n`);
    // subdomain (opcional)
    if (subdomain) {
      bodyParts.push(`--${boundary}\r\nContent-Disposition: form-data; name="subdomain"\r\n\r\n${subdomain}\r\n`);
    }
    // expires_at (opcional)
    if (expires_at) {
      bodyParts.push(`--${boundary}\r\nContent-Disposition: form-data; name="expires_at"\r\n\r\n${expires_at}\r\n`);
    }
    // file (zip)
    bodyParts.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${slug}.zip"\r\nContent-Type: application/zip\r\n\r\n`);
    bodyParts.push(zipBuffer.toString("binary"));
    bodyParts.push(`\r\n--${boundary}--\r\n`);

    const body = Buffer.from(bodyParts.join(""), "binary");
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.admin_api_token}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length.toString(),
      },
      body,
      // Timeout reduzido: upload é assíncrono, resposta vem rápido
      signal: AbortSignal.timeout(60000),
    });

    const result = await res.json();
    rmSync(tmpZip);

    if (!res.ok || !result.success) {
      sp3.fail(isNextSource ? "Falha ao iniciar build" : "Falha no upload");
      err(result.error || `HTTP ${res.status}`);
      process.exit(1);
    }

    // Upload enviado com sucesso — build iniciou (ou já completou)
    if (isNextSource && result.buildId) {
      sp3.succeed("Build iniciado na VPS");
    } else {
      sp3.succeed(isNextSource ? "Build concluído" : `Site publicado em ${result.url}`);
    }

    // Mostra resultado
    if (!noWait) {
      screen.phase("🎉 Site no ar!", fullSlug);
      if (isNextSource && result.buildId) {
        // Poll build status
        const statusUrl = `${targetUrl}/api/builds/status?buildId=${result.buildId}`;
        const statusSp = new Spinner("Build em andamento...").start();
        let done = false;
        const startPoll = Date.now();
        const POLL_TIMEOUT = 10 * 60 * 1000; // 10min
        while (Date.now() - startPoll < POLL_TIMEOUT && !done) {
          await new Promise(r => setTimeout(r, 5000));
          try {
            const sr = await fetch(statusUrl, {
              headers: { Authorization: `Bearer ${config.admin_api_token}` },
              signal: AbortSignal.timeout(5000),
            });
            if (!sr.ok) continue;
            const statusData = await sr.json();
            const buildStatus = statusData.status || statusData.job?.status || "unknown";
            statusSp.update(`Build: ${buildStatus} ${c.dim}· ${Math.round((Date.now() - startPoll)/1000)}s${c.reset}`);
            if (buildStatus === "done" || buildStatus === "completed") {
              statusSp.succeed(`Build concluído em ${Math.round((Date.now() - startPoll)/1000)}s`);
              done = true;
            } else if (buildStatus === "failed") {
              statusSp.fail(`Build falhou: ${statusData.error || statusData.job?.error || "erro desconhecido"}`);
              done = true;
            }
          } catch {}
        }
        if (!done) statusSp.warn("Build ainda em andamento — verifique manualmente");

        // Pós-build: confirma que a URL responde 200 de verdade antes de declarar "no ar"
        if (done) {
          const liveUrl = `${targetUrl}/${fullSlug}`;
          const liveSp = new Spinner("Verificando se o site está respondendo...").start();
          const startLive = Date.now();
          const LIVE_TIMEOUT = 90 * 1000;
          let liveOk = false;
          let lastCode = 0;
          while (Date.now() - startLive < LIVE_TIMEOUT) {
            try {
              const lr = await fetch(`${liveUrl}?_=${Date.now()}`, {
                method: "GET",
                redirect: "follow",
                signal: AbortSignal.timeout(8000),
                headers: { "Cache-Control": "no-cache" },
              });
              lastCode = lr.status;
              if (lr.ok) { liveOk = true; break; }
            } catch {}
            liveSp.update(`Aguardando 200 OK ${c.dim}(último: ${lastCode || "-"}, ${Math.round((Date.now()-startLive)/1000)}s)${c.reset}`);
            await new Promise(r => setTimeout(r, 2000));
          }
          if (liveOk) liveSp.succeed(`Site respondendo 200 OK em ${Math.round((Date.now()-startLive)/1000)}s`);
          else liveSp.warn(`Site ainda não respondeu 200 (último: ${lastCode}). Pode ser cache da Cloudflare — tente em 1min.`);
        }

        const liveUrl = `${targetUrl}/${fullSlug}`;
        console.log(`🌐 ${linkify(liveUrl)}`);
        console.log(`   ${c.dim}O build continua em background mesmo se você fechar o terminal${c.reset}`);
      } else {
        if (subdomainUrl) {
          console.log(`🌐 ${linkify(subdomainUrl, c.bold + c.cyan)} ${c.dim}(subdomínio)${c.reset}`);
          console.log(`🔗 ${linkify(`${targetUrl}/${fullSlug}`, c.dim)} ${c.dim}(slug, fallback)${c.reset}\n`);
        } else {
          console.log(`🌐 ${linkify(`${targetUrl}/${fullSlug}`, c.bold + c.cyan)}\n`);
        }
        if (result.files) ok(`${result.files} arquivo(s) enviados`);
      }
    }
  } catch (e) {
    sp3.fail("Falha no upload");
    err(`Erro: ${e.message}`);
    err(`Tipo: ${e.constructor?.name || "desconhecido"}`);
    err(`URL: ${uploadUrl}`);
    if (e.cause) err(`Causa: ${JSON.stringify(e.cause)}`);
    if (existsSync(tmpZip)) rmSync(tmpZip);
    process.exit(1);
  }
}

// ============================================================================
// Router
// ============================================================================
const [, , cmd, ...rest] = process.argv;
const hasDirect = cmd === "deploy" ? rest.includes("--direct") : cmd === "--direct";

(async () => {
  try {
    if (cmd === "-v" || cmd === "--version" || cmd === "version") {
      console.log(VERSION);
      return;
    }
    if (hasDirect) {
      const deployArgs = cmd === "--direct" ? rest : rest.filter(a => a !== "--direct");
      await cmdDirectDeploy(deployArgs);
      return;
    }
    switch (cmd) {
      case "login":      await cmdLogin();     break;
      case "panel":      await cmdPanel();     break;
      case "doctor":     await cmdDoctor();    break;
      case "r2-setup":   await cmdR2Setup();   break;
      case "r2-disable": await cmdR2Disable(); break;
      case "list":
      case "ls":         await cmdList();      break;
      case "rm":
      case "remove":
      case "delete":     await cmdRemove(rest); break;
      case "check":      await cmdCheck();     break;
      case "help":
      case "--help":
      case "-h":     cmdHelp();          break;
      case undefined: await cmdDeploy([]); break;
      default:
        if (cmd && cmd.startsWith("-")) {
          err(`Comando desconhecido: ${cmd}`);
          cmdHelp();
          process.exit(1);
        }
        await cmdDeploy([cmd, ...rest]);
    }
  } catch (e) {
    process.stdout.write("\x1b[?25h"); // garante cursor visível
    err(`Erro inesperado: ${e.message}`);
    if (process.env.DEBUG) console.error(e.stack);
    process.exit(1);
  }
})();
