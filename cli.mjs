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
const ACTIONS_URL = `https://github.com/${REPO}/actions`;
const CONFIG_DIR = join(homedir(), ".criarte-deploy");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const VERSION = "2.1.0";

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

// Header compacto pra comandos do dia-a-dia — sem poluir o terminal
function miniHeader(label) {
  console.log(`\n${c.magenta}${c.bold}❀ Criarte Deploy${c.reset} ${c.dim}v${VERSION}${c.reset}  ${c.dim}·${c.reset}  ${c.bold}${label}${c.reset}\n`);
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
// DEPLOY
// ============================================================================
async function cmdDeploy(argv) {
  miniHeader("📦 Publicar site");

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
  rmSync(tmp, { recursive: true, force: true });

  // ====== Monitora o CI até o fim ======
  console.log();
  hr();
  heading("👀 Acompanhando o deploy");
  const monitorResult = await monitorDeploy(config.token, fullSlug);

  // ====== Resultado final ======
  console.log();
  hr();
  console.log();
  if (monitorResult.ok) {
    console.log(`${c.green}${c.bold}🎉 Site no ar!${c.reset}`);
    console.log();
    console.log(`🌐 ${c.bold}${targetUrl}${c.reset}`);
    console.log();
  } else {
    console.log(`${c.red}${c.bold}❌ Deploy falhou.${c.reset}`);
    console.log();
    if (monitorResult.reason) console.log(`${c.red}${monitorResult.reason}${c.reset}`);
    if (monitorResult.url) {
      console.log();
      console.log(`📋 Ver log completo: ${c.cyan}${monitorResult.url}${c.reset}`);
    }
    console.log();
    process.exit(1);
  }
}

// ============================================================================
// MONITOR DO CI — espera o workflow_run desse push terminar
// ============================================================================
async function monitorDeploy(token, fullSlug) {
  const start = Date.now();
  const TIMEOUT_MS = 15 * 60 * 1000; // 15min teto
  const POLL_MS = 6000;

  // 1) Acha o workflow run criado pelo nosso push (espera até 60s pra ele aparecer)
  let run = null;
  const findSp = new Spinner("Aguardando o GitHub registrar o build...").start();
  const lookStart = Date.now();
  while (Date.now() - lookStart < 60000) {
    const res = await ghFetch(
      `/repos/${REPO}/actions/workflows/deploy-discloud.yml/runs?per_page=3`,
      token,
    );
    if (res && res.workflow_runs?.length) {
      // Pega o mais recente que tá in_progress, queued OU completed nos últimos 90s
      const fresh = res.workflow_runs.find((r) => {
        const age = Date.now() - new Date(r.created_at).getTime();
        return age < 90_000;
      });
      if (fresh) { run = fresh; break; }
    }
    await sleep(3000);
  }
  if (!run) {
    findSp.fail("Não detectei o workflow no GitHub Actions");
    return { ok: false, reason: "Talvez o push não tenha disparado o CI. Verifica em " + ACTIONS_URL };
  }
  findSp.succeed(`Build #${run.run_number} registrado (commit "${(run.display_title || "").slice(0, 50)}…")`);
  console.log(`   ${c.dim}→ ${run.html_url}${c.reset}`);

  // 2) Polla até completar
  let lastStatus = null;
  let lastJob = null;
  const runSp = new Spinner("Build em fila...").start();

  while (Date.now() - start < TIMEOUT_MS) {
    const cur = await ghFetch(`/repos/${REPO}/actions/runs/${run.id}`, token);
    if (!cur) {
      await sleep(POLL_MS);
      continue;
    }

    // Mostra status do job atual (validate / deploy)
    if (cur.status === "in_progress") {
      const jobsRes = await ghFetch(`/repos/${REPO}/actions/runs/${run.id}/jobs`, token);
      const inProgressJob = jobsRes?.jobs?.find((j) => j.status === "in_progress");
      const currentJob = inProgressJob?.name || lastJob || "build";
      if (currentJob !== lastJob || cur.status !== lastStatus) {
        runSp.update(`Rodando: ${c.bold}${currentJob}${c.reset}`);
        lastJob = currentJob;
      }
    } else if (cur.status === "queued" && lastStatus !== "queued") {
      runSp.update("Aguardando runner disponível...");
    }
    lastStatus = cur.status;

    if (cur.status === "completed") {
      if (cur.conclusion === "success") {
        runSp.succeed(`Deploy concluído (${cur.conclusion})`);
        return { ok: true, url: cur.html_url };
      } else {
        runSp.fail(`Deploy falhou (${cur.conclusion})`);
        // Tenta pegar o motivo real: último step que falhou
        const jobsRes = await ghFetch(`/repos/${REPO}/actions/runs/${run.id}/jobs`, token);
        const failedJob = jobsRes?.jobs?.find((j) => j.conclusion === "failure");
        const failedStep = failedJob?.steps?.find((s) => s.conclusion === "failure");
        const reason = failedStep
          ? `Falhou em "${failedStep.name}" do job "${failedJob.name}"`
          : `Conclusão: ${cur.conclusion}`;
        return { ok: false, reason, url: cur.html_url };
      }
    }

    await sleep(POLL_MS);
  }

  runSp.warn("Tempo esgotado (15min) — ainda rodando");
  return { ok: false, reason: "Build demorou mais que 15min. Acompanhe manualmente.", url: run.html_url };
}

async function ghFetch(path, token) {
  try {
    const r = await fetch(`https://api.github.com${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
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
      console.log(`  ${c.green}●${c.reset} ${s.name.padEnd(28)} ${c.dim}${DEPLOY_DOMAIN}/${s.slug}${c.reset}`);
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

  ${c.cyan}criarte-deploy r2-setup${c.reset}
    Configura upload automático de assets pesados pro Cloudflare R2.
    Reduz drasticamente o tamanho do zip da Discloud. Recomendado!

  ${c.cyan}criarte-deploy r2-disable${c.reset}
    Desativa R2 — assets voltam pro git.

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
      case "login":      await cmdLogin();     break;
      case "r2-setup":   await cmdR2Setup();   break;
      case "r2-disable": await cmdR2Disable(); break;
      case "list":
      case "ls":         await cmdList();      break;
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
