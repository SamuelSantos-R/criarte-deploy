// ============================================================================
// UI/MENU — menu principal interativo (setinha) do Criarte Deploy
// ============================================================================
// Só decide QUAL ação o usuário quer; quem executa é o router (onde os comandos
// vivem em escopo). Assim o menu não precisa importar o monolito inteiro.
// Retorna uma string de ação: "deploy" | "list" | "remove" | "doctor" |
// "config" | "exit".
// ============================================================================
import { basename } from "node:path";
import { intro, selectBack } from "./prompts.mjs";
import { c } from "../lib/config.mjs";

export async function mainMenu() {
  intro();
  const folder = basename(process.cwd());
  // ESC no menu principal = sair limpo (mesmo que escolher "Sair").
  const action = await selectBack({
    message: `O que vamos fazer? ${c.dim}(ESC pra sair)${c.reset}`,
    options: [
      { value: "deploy", label: "Fazer deploy desta pasta", hint: folder },
      { value: "list", label: "Listar sites no ar" },
      { value: "remove", label: "Remover um site" },
      { value: "doctor", label: `Diagnóstico ${c.dim}(doctor)${c.reset}` },
      { value: "config", label: "Configurações" },
      { value: "exit", label: "Sair" },
    ],
    initialValue: "deploy",
  }, "exit");
  return action;
}

// Submenu de configurações — retorna a ação de setup escolhida.
export async function configMenu() {
  // ESC aqui = voltar pro menu principal, não abortar o CLI.
  const action = await selectBack({
    message: `Configurações ${c.dim}(ESC pra voltar)${c.reset}`,
    options: [
      { value: "login", label: "Login / painel", hint: "GitHub token + URL/token do painel" },
      { value: "r2-setup", label: "Cloudflare R2", hint: "storage de assets pesados" },
      { value: "ssh-setup", label: "Deploy via SSH (rsync)", hint: "recomendado em Angola" },
      { value: "resend-setup", label: "Resend (emails RSVP)" },
      { value: "doctor", label: "Rodar diagnóstico" },
      { value: "back", label: "← Voltar" },
    ],
    initialValue: "login",
  }, "back");
  return action;
}
