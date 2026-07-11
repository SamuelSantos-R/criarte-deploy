// ============================================================================
// UI/PROMPTS — wrapper do @clack/prompts com o branding Criarte
// ============================================================================
// Centraliza a interação por setinha (select/confirm/text/spinner) num só lugar,
// com a paleta laranja do CLI e tratamento de cancelamento (Ctrl+C) consistente:
// o cursor volta a aparecer e o processo sai com 130, sem stack trace.
// ============================================================================
import {
  intro as clackIntro,
  outro as clackOutro,
  select as clackSelect,
  confirm as clackConfirm,
  text as clackText,
  isCancel,
  cancel as clackCancel,
  spinner as clackSpinner,
  note as clackNote,
  log as clackLog,
} from "@clack/prompts";
import { c, VERSION } from "../lib/config.mjs";

// Um deploy/menu só faz sentido num terminal interativo. Fora de TTY (CI, pipe)
// os comandos devem usar flags — quem chamar isto sem TTY recebe erro claro.
export function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

// Sai limpo quando o usuário cancela (Ctrl+C ou ESC) em qualquer prompt.
function guard(value, onCancelMsg = "Operação cancelada.") {
  if (isCancel(value)) {
    process.stdout.write("\x1b[?25h");
    clackCancel(onCancelMsg);
    process.exit(130);
  }
  return value;
}

export function intro(title = `❀ Criarte Deploy ${c.dim}v${VERSION}${c.reset}`) {
  clackIntro(`${c.brand}${title}${c.reset}`);
}

export function outro(msg) {
  clackOutro(msg);
}

// select({ message, options: [{ value, label, hint }], initialValue }) → value
export async function select(opts) {
  return guard(await clackSelect(opts));
}

// Igual ao select, mas ESC/cancel NÃO mata o processo: devolve `cancelValue`.
// Serve pros menus, onde ESC deve "voltar", não "abortar tudo".
export async function selectBack(opts, cancelValue) {
  const v = await clackSelect(opts);
  if (isCancel(v)) return cancelValue;
  return v;
}

export async function confirm(message, initialValue = true) {
  return guard(await clackConfirm({ message, initialValue }));
}

// text({ message, placeholder, defaultValue, validate }) → string
export async function text(opts) {
  return guard(await clackText(opts));
}

export const note = clackNote;
export const log = clackLog;

// Spinner com API estável: start/message/stop.
export function spinner() {
  return clackSpinner();
}

// Segura o resultado na tela até o usuário apertar Enter, pra não redesenhar o
// menu por cima da saída (ex: lista de sites) e dar a impressão de que "voltou
// direto pro menu". Fora de TTY não faz nada.
// Reaproveita o mesmo caminho de input do clack (confiável), em vez de readline
// solto depois do clack (que trava nesse fluxo). Enter OU ESC voltam pro menu.
export async function pause(message = "Pronto — dá uma olhada acima") {
  if (!isInteractive()) return;
  await clackSelect({
    message,
    options: [{ value: "ok", label: "↵ Voltar ao menu" }],
    initialValue: "ok",
  });
}
