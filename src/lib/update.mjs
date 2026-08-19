// ============================================================================
// UPDATE — auto-atualização do CLI na abertura
// ============================================================================
// Todo mundo que usa o CLI roda a versão do GitHub. Sem isso, uma máquina fica
// pra trás em silêncio e o CLI "não funciona" por motivo invisível (foi o que
// aconteceu com a detecção de tokenização rodando num CLI 4.0.1 contra repo
// 4.2.0). Aqui: compara com o package.json do repo, atualiza sozinho e
// re-executa o comando original já na versão nova.
//
// Nunca bloqueia: sem rede, sem TTY ou install falhando, segue com a versão
// atual. `CRIARTE_NO_UPDATE=1` desliga.
// ============================================================================
import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CLI_REPO, CLI_ROOT, VERSION, c, info, ok, warn } from "./config.mjs";

const MANIFEST_URL = `https://raw.githubusercontent.com/${CLI_REPO}/main/package.json`;
const CHECK_TIMEOUT_MS = 3000;
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;

// "4.10.0" > "4.9.1" — compara numericamente, não alfabeticamente.
export function isNewer(candidate, current) {
  const parse = (v) => String(v).trim().split(".").map((n) => parseInt(n, 10) || 0);
  const a = parse(candidate);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

async function fetchLatestVersion() {
  try {
    const res = await fetch(`${MANIFEST_URL}?_=${Date.now()}`, {
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      headers: { "Cache-Control": "no-cache" },
    });
    if (!res.ok) return null;
    const pkg = await res.json();
    return typeof pkg?.version === "string" ? pkg.version : null;
  } catch {
    return null;
  }
}

// Duas instalações convivem: npm global (`npm i -g github:...`) e symlink direto
// pro clone do repo. Atualizar o clone com npm não faz nada — tem que ser git pull.
function installKind() {
  return existsSync(join(CLI_ROOT, ".git")) ? "git" : "npm";
}

// Máquina de dev: o CLI é um symlink pro clone do repo. Dar `git pull` por baixo
// de trabalho em andamento é invasivo — nesse caso não atualiza nada.
function gitIsDirty() {
  try {
    return execSync(`git -C "${CLI_ROOT}" status --porcelain`, { stdio: "pipe", timeout: 10_000 })
      .toString().trim().length > 0;
  } catch {
    return true; // não deu pra saber → não mexe
  }
}

function runUpdate(kind) {
  const cmd = kind === "git"
    ? `git -C "${CLI_ROOT}" pull --ff-only`
    : `npm install -g github:${CLI_REPO}`;
  try {
    execSync(cmd, { stdio: "pipe", timeout: INSTALL_TIMEOUT_MS });
    return { ok: true, cmd };
  } catch (e) {
    const out = `${e.stderr?.toString() || ""}${e.stdout?.toString() || ""}`.trim();
    return { ok: false, cmd, error: out || e.message };
  }
}

// Roda de novo o MESMO comando, agora com o código novo em disco. O caminho do
// argv[1] não muda (npm e git sobrescrevem no lugar), então basta re-executar.
function reexec() {
  const r = spawnSync(process.execPath, [process.argv[1], ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, CRIARTE_UPDATED: "1" },
  });
  process.exit(r.status ?? 0);
}

/**
 * Checa e atualiza antes de despachar o comando. Só instala sozinho em terminal
 * interativo — em CI/pipe apenas avisa, pra um script nunca trocar de versão no
 * meio da execução.
 */
export async function autoUpdate({ interactive }) {
  if (process.env.CRIARTE_NO_UPDATE || process.env.CRIARTE_UPDATED) return;

  const latest = await fetchLatestVersion();
  if (!latest || !isNewer(latest, VERSION)) return;

  if (!interactive) {
    warn(`Versão nova disponível: ${c.bold}v${latest}${c.reset} (você está na v${VERSION}). Atualize com ${c.cyan}npm i -g github:${CLI_REPO}${c.reset}`);
    return;
  }

  const kind = installKind();
  if (kind === "git" && gitIsDirty()) {
    warn(`v${latest} disponível, mas o repo do CLI tem alterações não commitadas — não vou dar pull por cima. Seguindo na v${VERSION}.`);
    return;
  }
  info(`Atualizando o CLI: v${VERSION} → ${c.bold}v${latest}${c.reset} ${c.dim}(${kind})${c.reset}`);
  const r = runUpdate(kind);
  if (!r.ok) {
    warn(`Não deu pra atualizar automaticamente — seguindo na v${VERSION}.`);
    info(`${c.dim}${r.error.split("\n").slice(0, 3).join("\n")}${c.reset}`);
    if (/EACCES|permission denied/i.test(r.error)) {
      info(`Permissão negada. Devolve a pasta global pro teu usuário e tenta de novo ${c.bold}(sem sudo)${c.reset}:`);
      info(`  ${c.cyan}sudo chown -R $(whoami) "$(dirname "$(dirname "$(npm root -g)")")" ~/.npm${c.reset}`);
    } else {
      info(`Manual: ${c.cyan}${r.cmd}${c.reset}`);
    }
    return;
  }
  ok(`Atualizado pra v${latest} — reabrindo…`);
  reexec();
}
