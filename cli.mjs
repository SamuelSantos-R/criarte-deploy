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
import { join, basename, relative } from "node:path";
import readline from "node:readline";
import { BANNER } from "./banner.mjs";

// ============================================================================
// CONFIG
// ============================================================================
const REPO = "SamuelSantos-R/multisite-system";
const DEPLOY_DOMAIN = "https://criartedesing.ao";
const ACTIONS_URL = `https://github.com/${REPO}/actions`;
const CONFIG_DIR = join(homedir(), ".criarte-deploy");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const VERSION = "1.1.0";

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

function showBanner() {
  if (!process.stdout.isTTY) return;
  console.log(BANNER);
  console.log(`${c.bold}${c.magenta}        Criarte Deploy${c.reset} ${c.dim}v${VERSION}${c.reset}`);
  console.log(`${c.dim}        publique sites em segundos${c.reset}\n`);
}

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
  heading("🔐 Configuração inicial");

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
  saveConfig({ token, name, email, login: user.login });

  ok(`Configuração salva em ${c.dim}${CONFIG_FILE}${c.reset}`);
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
    const sample = absoluteImagePaths.slice(0, 3).map(p => `  ${c.dim}${p.file}:${c.reset} ${p.src}`).join("\n");
    issues.push({
      level: "warn",
      msg: `${absoluteImagePaths.length} imagem(ns) com caminho absoluto detectada(s). Com basePath '/${category}/${slug}' elas vão quebrar.\n${sample}${absoluteImagePaths.length > 3 ? `\n  ${c.dim}... e mais ${absoluteImagePaths.length - 3}${c.reset}` : ""}`,
      fix: "Use caminho relativo ou prefixe com basePath. O sync.mjs do CI tenta corrigir automaticamente.",
    });
  }

  // 5. next.config.* tem output: "export"? (sync.mjs faz isso mas avisa)
  const cfgFile = ["next.config.ts","next.config.mjs","next.config.js"]
    .map(f => join(cwd, f)).find(existsSync);
  if (cfgFile) {
    const cfg = readFileSync(cfgFile, "utf8");
    if (!/output\s*:\s*['"]export['"]/.test(cfg)) {
      issues.push({
        level: "warn",
        msg: "next.config sem output:'export'. O sync.mjs do CI tenta corrigir, mas se a config for muito custom pode falhar.",
      });
    }
  }

  // 6. site.json (opcional mas recomendado)
  if (!existsSync(join(cwd, "site.json"))) {
    issues.push({
      level: "info",
      msg: "Sem site.json — vai ser criado automaticamente com nome capitalizado e descrição vazia.",
    });
  }

  // 7. Tamanho da pasta
  let totalBytes = 0;
  walkSource(cwd, (full) => { totalBytes += statSync(full).size; });
  if (totalBytes > 100 * 1024 * 1024) {
    issues.push({
      level: "warn",
      msg: `Pasta grande: ${(totalBytes / 1024 / 1024).toFixed(1)} MB. Considere otimizar imagens (TinyPNG, squoosh.app).`,
    });
  }

  return issues;
}

function renderIssues(issues) {
  if (!issues.length) {
    ok("Nenhum problema detectado na estrutura do site.\n");
    return { canDeploy: true };
  }
  const errors   = issues.filter(i => i.level === "error");
  const warnings = issues.filter(i => i.level === "warn");
  const infos    = issues.filter(i => i.level === "info");

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
  console.log();

  return { canDeploy: errors.length === 0, hasWarnings: warnings.length > 0 };
}

// ============================================================================
// DEPLOY
// ============================================================================
async function cmdDeploy(argv) {
  showBanner();
  heading("📦 Publicar site");

  const config = requireLogin();
  const cwd = process.cwd();
  const folderName = basename(cwd);

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
  const targetUrl = `${DEPLOY_DOMAIN}/${fullSlug}`;

  // ====== Análise pré-deploy ======
  console.log();
  hr();
  heading("🔍 Análise da estrutura");
  const sp1 = new Spinner("Analisando arquivos, dependências e configuração...").start();
  const issues = await preflightChecks(cwd, category, slug);
  sp1.succeed("Análise concluída");

  const result = renderIssues(issues);

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

  // ====== Resumo ======
  hr();
  heading("📋 Resumo");
  console.log(`  ${c.dim}Pasta:${c.reset}    ${cwd}`);
  console.log(`  ${c.dim}Destino:${c.reset}  sites/${fullSlug}/`);
  console.log(`  ${c.dim}URL:${c.reset}      ${c.cyan}${targetUrl}${c.reset}`);
  console.log();

  const confirm = await ask(`Confirma o envio? ${c.dim}(s/N)${c.reset} → `);
  if (confirm.toLowerCase() !== "s" && confirm.toLowerCase() !== "sim") {
    warn("Cancelado.");
    process.exit(0);
  }

  // ====== Clone temp ======
  console.log();
  hr();
  heading("🚀 Enviando");

  const tmp = mkdtempSync(join(tmpdir(), "criarte-deploy-"));
  const sp2 = new Spinner("Conectando ao repositório do sistema...").start();
  try {
    execSync(
      `git clone --depth 1 https://${config.token}@github.com/${REPO}.git "${tmp}"`,
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

  // ====== Commit + push ======
  const sp3 = new Spinner("Commitando e subindo pro GitHub...").start();
  const gitOpts = { cwd: tmp, stdio: "pipe" };
  const verb = isUpdate ? "update" : "add";
  try {
    execSync(`git config user.email "${config.email}"`, gitOpts);
    execSync(`git config user.name "${config.name}"`, gitOpts);
    execSync(`git add sites/${category}/${slug}`, gitOpts);
    execSync(`git commit -m "feat(sites): ${verb} ${fullSlug}"`, gitOpts);
    execSync(`git push`, gitOpts);
  } catch (e) {
    sp3.fail("Falha ao subir");
    err(e.stderr?.toString() || e.message);
    rmSync(tmp, { recursive: true, force: true });
    process.exit(1);
  }
  sp3.succeed("Código enviado pro GitHub");
  rmSync(tmp, { recursive: true, force: true });

  // ====== Sucesso ======
  console.log();
  hr();
  console.log();
  console.log(`${c.green}${c.bold}🎉 Pronto! Site enviado com sucesso.${c.reset}`);
  console.log();
  console.log(`${c.dim}O CI vai agora:${c.reset}`);
  console.log(`  ${c.dim}1.${c.reset} Reescrever package.json e next.config (basePath /${fullSlug})`);
  console.log(`  ${c.dim}2.${c.reset} Buildar o site (next build → static export)`);
  console.log(`  ${c.dim}3.${c.reset} Deployar na Discloud`);
  console.log();
  console.log(`🚀 ${c.bold}Acompanhe:${c.reset}`);
  console.log(`   ${c.cyan}${ACTIONS_URL}${c.reset}`);
  console.log();
  console.log(`🌐 ${c.bold}Em ~5 minutos o site estará em:${c.reset}`);
  console.log(`   ${c.cyan}${targetUrl}${c.reset}`);
  console.log();
}

// ============================================================================
// LIST
// ============================================================================
async function cmdList() {
  showBanner();
  heading("📂 Sites publicados");
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
      console.log(`  ${c.green}●${c.reset} ${s.name.padEnd(28)} ${c.dim}${DEPLOY_DOMAIN}/${s.slug}${c.reset}`);
    }
  }
  console.log();
}

// ============================================================================
// CHECK (preflight standalone, sem fazer deploy)
// ============================================================================
async function cmdCheck() {
  showBanner();
  heading("🔍 Verificar estrutura do site");
  const cwd = process.cwd();
  const sp = new Spinner("Analisando...").start();
  const issues = await preflightChecks(cwd, "categoria", "slug");
  sp.succeed("Análise concluída");
  const result = renderIssues(issues);
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

${c.bold}Comandos:${c.reset}

  ${c.cyan}criarte-deploy login${c.reset}
    Configura o token do GitHub (1ª vez apenas).

  ${c.cyan}criarte-deploy${c.reset}
    Publica o site da pasta atual. Pergunta categoria e nome.

  ${c.cyan}criarte-deploy <categoria> <nome>${c.reset}
    Publica direto, sem perguntar.
    Ex: ${c.dim}criarte-deploy casamento joao-maria${c.reset}

  ${c.cyan}criarte-deploy check${c.reset}
    Analisa a estrutura do site da pasta atual e mostra problemas,
    SEM enviar pro GitHub. Ótimo pra checar antes de publicar.

  ${c.cyan}criarte-deploy list${c.reset}
    Mostra todos os sites publicados.

  ${c.cyan}criarte-deploy help${c.reset}
    Mostra essa ajuda.

${c.bold}Fluxo do dia-a-dia (depois do login):${c.reset}

  ${c.dim}$${c.reset} cd ~/Desktop/joao-maria
  ${c.dim}$${c.reset} criarte-deploy
  ${c.dim}→ responde categoria e nome → confirma → ☕ café → site no ar${c.reset}
`);
}

// ============================================================================
// Router
// ============================================================================
const [, , cmd, ...rest] = process.argv;
const COMMANDS = new Set(["login", "list", "ls", "check", "help", "--help", "-h", "-v", "--version", "version"]);

(async () => {
  try {
    if (cmd === "-v" || cmd === "--version" || cmd === "version") {
      console.log(VERSION);
      return;
    }
    switch (cmd) {
      case "login":  await cmdLogin();  break;
      case "list":
      case "ls":     await cmdList();   break;
      case "check":  await cmdCheck();  break;
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
