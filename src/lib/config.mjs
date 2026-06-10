// ============================================================================
// CONFIG — Constantes, cores e helpers globais do Criarte Deploy CLI
// ============================================================================
import { homedir } from "node:os";
import { join } from "node:path";

export const REPO = "SamuelSantos-R/multisite-system";
export const DEPLOY_DOMAIN = "https://criartedesing.ao";
export const DEFAULT_PANEL_URL = DEPLOY_DOMAIN;
export const CONFIG_DIR = join(homedir(), ".criarte-deploy");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");
export const VERSION = "3.9.0";

export const c = {
  reset: "\x1b[0m",      bold: "\x1b[1m",      dim: "\x1b[2m",
  italic: "\x1b[3m",     red: "\x1b[31m",      green: "\x1b[32m",
  yellow: "\x1b[33m",    blue: "\x1b[34m",      magenta: "\x1b[35m",
  cyan: "\x1b[36m",      gray: "\x1b[90m",
  brand: "\x1b[38;5;214m",   brand2: "\x1b[38;5;209m",
  accent: "\x1b[38;5;111m",  muted: "\x1b[38;5;243m",
  ok: "\x1b[38;5;155m",      warnFg: "\x1b[38;5;221m",
  errFg: "\x1b[38;5;203m",
};

export function ok(s)   { console.log(`${c.ok}✓${c.reset} ${s}`); }
export function info(s)  { console.log(`${c.blue}ℹ${c.reset} ${s}`); }
export function warn(s)  { console.log(`${c.warnFg}⚠${c.reset} ${s}`); }
export function err(s)    { console.log(`${c.errFg}✗${c.reset} ${s}`); }

export function hr(char = "─", color = c.dim, width = 60) {
  console.log(color + char.repeat(Math.min(width, process.stdout.columns || 80)) + c.reset);
}

export function boxed(lines, { color = c.brand, padding = 1 } = {}) {
  if (!process.stdout.isTTY) { for (const l of lines) console.log(l); return; }
  const maxLen = Math.max(...lines.map((l) => stripAnsi(l).length));
  const w = maxLen + padding * 2;
  const p = " ".repeat(padding);
  console.log(color + "┌"  + "─".repeat(w) + "┐" + c.reset);
  for (const l of lines) {
    const pad = " ".repeat(Math.max(0, maxLen - stripAnsi(l).length));
    console.log(color + "│" + c.reset + p + l + pad + p + color + "│" + c.reset);
  }
  console.log(color + "└"  + "─".repeat(w) + "┘" + c.reset);
}

export function section(label, sub) {
  console.log();
  console.log(`${c.brand}❖${c.reset} ${c.bold}${label}${c.reset}  ${c.dim}${sub || ""}${c.reset}`);
  hr("─", c.dim, 60);
}

export function linkify(url, color = c.dim) {
  return `\x1b]8;;${url}\x1b\\${color}${url}${c.reset}\x1b]8;;\x1b\\`;
}

export function screenPhase(phase, sub) {
  console.log();
  console.log(`${c.brand}❀${c.reset} Criarte Deploy v${VERSION}  ·  ${c.bold}${phase}${c.reset}`);
  if (sub) console.log(sub);
  console.log();
}

const STRIP_ANSI_RE = /\x1b\[[0-9;]*m/g;
function stripAnsi(s) {
  return String(s).replace(STRIP_ANSI_RE, "");
}
