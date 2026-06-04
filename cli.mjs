#!/usr/bin/env node
/**
 * Criarte Deploy CLI
 * Publica um site finalizado no monorepo multi-site sem precisar cloná-lo localmente.
 */
import { execSync, spawnSync } from "node:child_process";
import {
  existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync,
  rmSync, cpSync, readdirSync, statSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve, basename } from "node:path";
import readline from "node:readline";

// ============================================================================
// CONFIG — ajuste se o repo do monorepo mudar
// ============================================================================
const REPO = "SamuelSantos-R/multisite-system";
const REPO_URL = `https://github.com/${REPO}.git`;
const DEPLOY_DOMAIN = "https://criartedesing.ao";
const ACTIONS_URL = `https://github.com/${REPO}/actions`;
const CONFIG_DIR = join(homedir(), ".criarte-deploy");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

// ============================================================================
// UI helpers (cores + ícones)
// ============================================================================
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};
const brand = (s) => `${c.magenta}${c.bold}${s}${c.reset}`;
const ok = (s) => console.log(`${c.green}✓${c.reset} ${s}`);
const info = (s) => console.log(`${c.cyan}ℹ${c.reset} ${s}`);
const warn = (s) => console.log(`${c.yellow}⚠${c.reset}  ${s}`);
const err = (s) => console.log(`${c.red}✗${c.reset} ${s}`);
const step = (s) => console.log(`${c.dim}⏳${c.reset} ${s}`);
const title = (s) => console.log(`\n${brand("🌸 " + s)}\n`);

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (hidden) {
      // Esconde digitação (pra token)
      const stdin = process.stdin;
      const onData = (char) => {
        char = char.toString();
        if (char === "\n" || char === "\r" || char === "\u0004") {
          stdin.removeListener("data", onData);
        } else {
          process.stdout.write("\x1b[2K\x1b[1G" + question + "•".repeat(rl.line.length));
        }
      };
      stdin.on("data", onData);
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

// ============================================================================
// Config (token armazenado em ~/.criarte-deploy/config.json)
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

// ============================================================================
// Comando: login
// ============================================================================
async function cmdLogin() {
  title("Configuração inicial");

  console.log("Pra publicar sites, o CLI precisa de um " + c.bold + "token do GitHub" + c.reset + ".");
  console.log("É uma chave que dá permissão pro CLI subir os arquivos no repositório.\n");

  console.log(c.bold + "Como criar (1 minuto):" + c.reset);
  console.log("  1. Abra esse link no navegador:");
  console.log(`     ${c.cyan}https://github.com/settings/tokens/new?scopes=repo&description=Criarte+Deploy${c.reset}`);
  console.log(`  2. Em ${c.bold}Expiration${c.reset}, escolha ${c.bold}"No expiration"${c.reset} (ou 1 ano)`);
  console.log(`  3. Role até o fim e clique em ${c.bold}"Generate token"${c.reset}`);
  console.log(`  4. Copie o token que aparece (começa com ${c.dim}ghp_...${c.reset})\n`);

  const token = await ask("Cole o token aqui: ", { hidden: true });

  if (!token.startsWith("ghp_") && !token.startsWith("github_pat_")) {
    err("Esse não parece um token válido do GitHub. Deve começar com 'ghp_' ou 'github_pat_'.");
    process.exit(1);
  }

  // Testa o token
  step("Verificando token...");
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (!res.ok) {
      err(`Token inválido ou sem acesso ao repositório (HTTP ${res.status}).`);
      err(`Confirme que o token tem o escopo ${c.bold}repo${c.reset} e que você tem acesso a ${REPO}.`);
      process.exit(1);
    }
  } catch (e) {
    err(`Erro de rede: ${e.message}`);
    process.exit(1);
  }

  // Pega nome/email do GitHub pra commits
  const user = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());

  const name = user.name || user.login || "Criarte";
  const email = user.email || `${user.login}@users.noreply.github.com`;

  saveConfig({ token, name, email, login: user.login });

  ok(`Logada como ${c.bold}${user.login}${c.reset} (${email})`);
  ok(`Configuração salva em ${c.dim}${CONFIG_FILE}${c.reset}`);
  console.log();
  console.log("🎉 Pronto! Agora é só ir na pasta de um site e rodar:");
  console.log(`   ${c.cyan}criarte-deploy${c.reset}`);
}

// ============================================================================
// Comando: deploy (padrão)
// ============================================================================
async function cmdDeploy(argv) {
  title("Publicar site");

  const config = loadConfig();
  if (!config) {
    err("Você ainda não fez login.");
    info(`Rode primeiro: ${c.cyan}criarte-deploy login${c.reset}`);
    process.exit(1);
  }

  const cwd = process.cwd();
  const folderName = basename(cwd);

  // Valida que tem package.json (é um projeto Next.js)
  if (!existsSync(join(cwd, "package.json"))) {
    err("Esta pasta não parece um site (não tem package.json).");
    info("Entre na pasta do site finalizado antes de rodar o comando.");
    info(`Exemplo: ${c.cyan}cd ~/Desktop/joao-maria${c.reset}`);
    process.exit(1);
  }

  ok(`Pasta atual: ${c.dim}${cwd}${c.reset}`);
  ok(`Detectei um site Next.js`);
  console.log();

  // Pega categoria + slug (de argv ou interativo)
  let category = argv[0];
  let slug = argv[1];

  if (!category) {
    console.log("Qual a " + c.bold + "categoria" + c.reset + " do site?");
    console.log(c.dim + "Exemplos: casamento, aniversario, evento, debutante" + c.reset);
    category = await ask("> ");
  }

  if (!slug) {
    console.log("\nQual o " + c.bold + "nome" + c.reset + " do site? (use minúsculas com hífen)");
    console.log(c.dim + `Exemplos: joao-maria, ana-15-anos, festa-julho` + c.reset);
    console.log(c.dim + `Sugestão baseada na pasta: ${folderName}` + c.reset);
    slug = (await ask(`> `)) || folderName;
  }

  // Validações
  const slugRe = /^[a-z0-9][a-z0-9-]*$/;
  if (!slugRe.test(category)) {
    err(`Categoria inválida: "${category}". Use só minúsculas, números e hífen.`);
    process.exit(1);
  }
  if (!slugRe.test(slug)) {
    err(`Nome inválido: "${slug}". Use só minúsculas, números e hífen.`);
    process.exit(1);
  }

  const fullSlug = `${category}/${slug}`;
  const targetUrl = `${DEPLOY_DOMAIN}/${fullSlug}`;

  console.log();
  console.log("📋 " + c.bold + "Vou publicar:" + c.reset);
  console.log(`   ${c.dim}Pasta:${c.reset}    ${cwd}`);
  console.log(`   ${c.dim}Destino:${c.reset}  sites/${fullSlug}/`);
  console.log(`   ${c.dim}URL final:${c.reset} ${c.cyan}${targetUrl}${c.reset}`);
  console.log();

  const confirm = await ask("Confirma? (s/n) > ");
  if (confirm.toLowerCase() !== "s" && confirm.toLowerCase() !== "sim") {
    warn("Cancelado.");
    process.exit(0);
  }

  // Clona o repo num temp dir
  console.log();
  const tmp = mkdtempSync(join(tmpdir(), "criarte-deploy-"));
  step(`Clonando repositório (numa pasta temporária)...`);

  try {
    execSync(
      `git clone --depth 1 https://${config.token}@github.com/${REPO}.git "${tmp}"`,
      { stdio: "pipe" },
    );
  } catch (e) {
    err("Falha ao clonar o repositório.");
    err(e.stderr?.toString() || e.message);
    rmSync(tmp, { recursive: true, force: true });
    process.exit(1);
  }

  // Verifica se site já existe
  const targetPath = join(tmp, "sites", category, slug);
  let isUpdate = false;
  if (existsSync(targetPath)) {
    warn(`O site sites/${fullSlug}/ já existe no repositório.`);
    const overwrite = await ask("Sobrescrever (atualizar)? (s/n) > ");
    if (overwrite.toLowerCase() !== "s" && overwrite.toLowerCase() !== "sim") {
      warn("Cancelado.");
      rmSync(tmp, { recursive: true, force: true });
      process.exit(0);
    }
    isUpdate = true;
    rmSync(targetPath, { recursive: true, force: true });
  }

  // Copia arquivos (ignorando pesados)
  step(`Copiando arquivos do site...`);
  mkdirSync(targetPath, { recursive: true });
  copyFiltered(cwd, targetPath);
  const fileCount = countFiles(targetPath);
  ok(`${fileCount} arquivo(s) copiado(s)`);

  // Commit + push
  step(`Commitando e subindo pro GitHub...`);
  const gitOpts = { cwd: tmp, stdio: "pipe" };
  const verb = isUpdate ? "update" : "add";
  try {
    execSync(`git config user.email "${config.email}"`, gitOpts);
    execSync(`git config user.name "${config.name}"`, gitOpts);
    execSync(`git add sites/${category}/${slug}`, gitOpts);
    execSync(
      `git commit -m "feat(sites): ${verb} ${fullSlug}"`,
      gitOpts,
    );
    execSync(`git push`, gitOpts);
  } catch (e) {
    err("Falha ao commitar/subir.");
    err(e.stderr?.toString() || e.message);
    rmSync(tmp, { recursive: true, force: true });
    process.exit(1);
  }

  rmSync(tmp, { recursive: true, force: true });

  // Sucesso
  console.log();
  console.log(`${c.green}${c.bold}✅ Pronto! Site enviado.${c.reset}`);
  console.log();
  console.log(`🚀 ${c.bold}Build rodando agora:${c.reset}`);
  console.log(`   ${c.cyan}${ACTIONS_URL}${c.reset}`);
  console.log();
  console.log(`🌐 ${c.bold}Em ~5 minutos o site vai estar online em:${c.reset}`);
  console.log(`   ${c.cyan}${targetUrl}${c.reset}`);
  console.log();
}

// ============================================================================
// Comando: list
// ============================================================================
async function cmdList() {
  title("Sites publicados");
  const config = loadConfig();
  if (!config) {
    err("Você ainda não fez login.");
    info(`Rode primeiro: ${c.cyan}criarte-deploy login${c.reset}`);
    process.exit(1);
  }

  step("Buscando lista de sites...");
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/config/sites.json?ref=main`,
    { headers: { Authorization: `Bearer ${config.token}`, Accept: "application/vnd.github.v3.raw" } },
  );
  if (!res.ok) {
    err(`Erro ao buscar lista (HTTP ${res.status})`);
    process.exit(1);
  }
  const sites = await res.json();
  if (!sites.length) {
    info("Nenhum site publicado ainda.");
    return;
  }
  const byCat = {};
  for (const s of sites) (byCat[s.category] ||= []).push(s);
  for (const [cat, items] of Object.entries(byCat)) {
    console.log(`\n${c.bold}${cat}${c.reset} ${c.dim}(${items.length})${c.reset}`);
    for (const s of items) {
      console.log(`  ${c.green}●${c.reset} ${s.slug}  ${c.dim}→ ${DEPLOY_DOMAIN}/${s.slug}${c.reset}`);
    }
  }
  console.log();
}

// ============================================================================
// Comando: help
// ============================================================================
function cmdHelp() {
  console.log(`
${brand("🌸 Criarte Deploy")} ${c.dim}v1.0.0${c.reset}

Publica sites finalizados no sistema multi-site sem precisar baixar o monorepo.

${c.bold}Comandos:${c.reset}

  ${c.cyan}criarte-deploy login${c.reset}
    Configura o token do GitHub (1ª vez apenas).

  ${c.cyan}criarte-deploy${c.reset}
    Publica o site da pasta atual. Pergunta categoria e nome.

  ${c.cyan}criarte-deploy <categoria> <nome>${c.reset}
    Publica direto sem perguntar.
    Ex: ${c.dim}criarte-deploy casamento joao-maria${c.reset}

  ${c.cyan}criarte-deploy list${c.reset}
    Mostra todos os sites publicados.

  ${c.cyan}criarte-deploy help${c.reset}
    Mostra essa ajuda.

${c.bold}Como usar (depois do login):${c.reset}

  ${c.dim}1.${c.reset} Entre na pasta do site finalizado:
     ${c.cyan}cd ~/Desktop/joao-maria${c.reset}

  ${c.dim}2.${c.reset} Rode o deploy:
     ${c.cyan}criarte-deploy${c.reset}

  ${c.dim}3.${c.reset} Responda as perguntas (categoria, nome).

  ${c.dim}4.${c.reset} Em ~5min o site tá online em ${DEPLOY_DOMAIN}/<categoria>/<nome>
`);
}

// ============================================================================
// Helpers
// ============================================================================
const IGNORE = new Set([
  "node_modules", ".next", "out", ".git", "dist", ".turbo",
  ".DS_Store", ".env", ".env.local", ".env.production.local",
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  ".vscode", ".idea", "tsconfig.tsbuildinfo",
]);

function copyFiltered(src, dest) {
  for (const entry of readdirSync(src)) {
    if (IGNORE.has(entry)) continue;
    if (entry.startsWith(".") && entry !== ".gitignore" && entry !== ".env.example") continue;
    const s = join(src, entry);
    const d = join(dest, entry);
    const st = statSync(s);
    if (st.isDirectory()) {
      mkdirSync(d, { recursive: true });
      copyFiltered(s, d);
    } else {
      cpSync(s, d);
    }
  }
}

function countFiles(dir) {
  let n = 0;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) n += countFiles(p);
    else n++;
  }
  return n;
}

// ============================================================================
// Router
// ============================================================================
const [, , cmd, ...rest] = process.argv;

(async () => {
  try {
    switch (cmd) {
      case "login":
        await cmdLogin();
        break;
      case "list":
      case "ls":
        await cmdList();
        break;
      case "help":
      case "--help":
      case "-h":
        cmdHelp();
        break;
      case undefined:
        // sem argumento = deploy interativo
        await cmdDeploy([]);
        break;
      default:
        // primeiro argumento que não é comando = categoria do deploy
        await cmdDeploy([cmd, ...rest]);
    }
  } catch (e) {
    err(`Erro inesperado: ${e.message}`);
    process.exit(1);
  }
})();
