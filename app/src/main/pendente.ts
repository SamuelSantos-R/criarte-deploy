import { app, dialog, type BrowserWindow } from "electron";

// ALTERAÇÕES POR SALVAR — o convite perdia tudo o que não estava salvo ao fechar
// o Studio ou ao atualizá-lo: o processo saía sem perguntar. O renderer avisa
// aqui quando há edição pendente, e o fecho da janela passa a perguntar.

let sujo = false;
let liberado = false;
let querSair = false;

export function marcarSujo(v: unknown): void {
  sujo = v === true;
}

/** 0 = salvar, 1 = não salvar, 2 = cancelar — como no Photoshop. */
export async function perguntarSalvar(win?: BrowserWindow | null): Promise<number> {
  const opcoes = {
    type: "warning" as const,
    buttons: ["Salvar", "Não salvar", "Cancelar"],
    defaultId: 0,
    cancelId: 2,
    message: "Há alterações no convite que ainda não foram salvas.",
    detail: "Se não salvar, elas perdem-se.",
  };
  const r = win ? await dialog.showMessageBox(win, opcoes) : await dialog.showMessageBox(opcoes);
  return r.response;
}

export function protegerFecho(win: BrowserWindow): void {
  app.on("before-quit", () => {
    querSair = true;
  });
  win.on("close", (e) => {
    if (!sujo || liberado) return;
    e.preventDefault();
    void perguntarSalvar(win).then((r) => {
      if (r === 2) {
        querSair = false;
        return;
      }
      // Salvar: quem sabe gravar é o renderer; ele chama `sairDepoisDeSalvar`.
      if (r === 0) return win.webContents.send("pendente:salvar-e-sair");
      liberado = true;
      if (querSair) app.quit();
      else win.close();
    });
  });
}

export function sairDepoisDeSalvar(win: BrowserWindow | null): void {
  liberado = true;
  if (querSair || !win) app.quit();
  else win.close();
}
