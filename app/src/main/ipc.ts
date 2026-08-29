import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import { existsSync } from "node:fs";
import { loadSettings, saveSettings } from "./paths";
import { listSites, readConvite, siteDir, writeConvite } from "./sites";
import { cancelJob, startJob, type Job } from "./cli";
import { FILTROS, importAssets } from "./assets";
import { carregarLista, carregarModelo, definirPasta, gerar, pastaDaSaida } from "./envelope";
import {
  esconderVista,
  estadoPreview,
  iniciarServidor,
  montarVista,
  pararServidor,
  recarregarVista,
} from "./preview";

export type Result<T> = { ok: true; data: T } | { ok: false; erro: string };

/**
 * Nenhum handler devolve stack trace pro renderer. E erro de fs vem com o
 * caminho absoluto na mensagem — vira só o código, senão o renderer ganha de
 * graça o mapa da árvore de diretórios da máquina.
 */
function mensagem(e: unknown): string {
  if (!(e instanceof Error)) return "falha desconhecida";
  const codigo = (e as NodeJS.ErrnoException).code;
  return codigo ? `falha de sistema (${codigo})` : e.message;
}

function handle<T>(canal: string, fn: (e: IpcMainInvokeEvent, ...a: never[]) => Promise<T> | T): void {
  ipcMain.handle(canal, async (event, ...args) => {
    try {
      return { ok: true, data: await fn(event, ...(args as never[])) } satisfies Result<T>;
    } catch (e) {
      return { ok: false, erro: mensagem(e) } satisfies Result<T>;
    }
  });
}

function asString(v: unknown, campo: string): string {
  if (typeof v !== "string" || v.length === 0 || v.length > 2048) {
    throw new Error(`${campo} inválido`);
  }
  return v;
}

async function abrir(
  event: IpcMainInvokeEvent,
  opcoes: Electron.OpenDialogOptions,
): Promise<string | null> {
  const win = BrowserWindow.fromWebContents(event.sender);
  const r = win ? await dialog.showOpenDialog(win, opcoes) : await dialog.showOpenDialog(opcoes);
  return r.canceled ? null : (r.filePaths[0] ?? null);
}

function asJob(v: unknown): Job {
  if (!v || typeof v !== "object") throw new Error("job inválido");
  const j = v as Record<string, unknown>;
  switch (j.kind) {
    case "deploy":
      return { kind: "deploy", siteId: asString(j.siteId, "siteId"), dryRun: j.dryRun === true };
    case "check":
      return { kind: "check", siteId: asString(j.siteId, "siteId") };
    case "fotos":
      return {
        kind: "fotos",
        siteId: asString(j.siteId, "siteId"),
        max: Number(j.max) || 2000,
        qualidade: Number(j.qualidade) || 82,
      };
    case "doctor":
      return { kind: "doctor" };
    default:
      throw new Error("job desconhecido");
  }
}

export function registerIpc(): void {
  handle("settings:get", () => loadSettings());

  handle("settings:pickRoot", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const escolha = win
      ? await dialog.showOpenDialog(win, {
          title: "Escolha a pasta sites/ do sistema multi-site",
          properties: ["openDirectory"],
        })
      : await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (escolha.canceled || !escolha.filePaths[0]) return loadSettings();
    const sitesRoot = escolha.filePaths[0];
    if (!existsSync(sitesRoot)) throw new Error("pasta não existe");
    saveSettings({ sitesRoot });
    return { sitesRoot };
  });

  handle("sites:list", () => listSites());
  handle("convite:read", (_e, id: unknown) => readConvite(asString(id, "id")));
  handle("convite:write", (_e, id: unknown, data: unknown) => writeConvite(asString(id, "id"), data));

  handle("assets:import", (_e, id: unknown, origens: unknown) => {
    if (!Array.isArray(origens)) throw new Error("seleção inválida");
    return importAssets(asString(id, "id"), origens.map((o) => asString(o, "caminho")));
  });

  handle("assets:pick", async (event, id: unknown, pasta: unknown) => {
    const siteId = asString(id, "id");
    const win = BrowserWindow.fromWebContents(event.sender);
    const opcoes: Electron.OpenDialogOptions =
      pasta === true
        ? { title: "Escolha uma pasta de assets", properties: ["openDirectory"] }
        : { title: "Escolha os arquivos", properties: ["openFile", "multiSelections"], filters: FILTROS };
    const escolha = win
      ? await dialog.showOpenDialog(win, opcoes)
      : await dialog.showOpenDialog(opcoes);
    if (escolha.canceled || escolha.filePaths.length === 0) return [];
    return importAssets(siteId, escolha.filePaths);
  });

  handle("preview:start", (_e, id: unknown) => iniciarServidor(asString(id, "id")));
  handle("preview:stop", () => pararServidor());
  handle("preview:state", () => estadoPreview());
  handle("preview:mount", (_e, area: unknown, disp: unknown) => montarVista(area, disp));
  handle("preview:hide", () => esconderVista());
  handle("preview:reload", () => recarregarVista());

  handle("envelope:modelo", async (event) => {
    const escolha = await abrir(event, {
      title: "Escolha a imagem do convite",
      properties: ["openFile"],
      filters: [{ name: "Imagem", extensions: ["jpg", "jpeg", "png"] }],
    });
    return escolha ? carregarModelo(escolha) : null;
  });

  handle("envelope:lista", async (event) => {
    const escolha = await abrir(event, {
      title: "Escolha o .txt dos convidados",
      properties: ["openFile"],
      filters: [{ name: "Texto", extensions: ["txt"] }],
    });
    return escolha ? carregarLista(escolha) : null;
  });

  handle("envelope:pasta", async (event) => {
    const escolha = await abrir(event, {
      title: "Onde salvar os PDFs",
      properties: ["openDirectory", "createDirectory"],
    });
    return escolha ? definirPasta(escolha) : null;
  });

  handle("envelope:gerar", (_e, opcoes: unknown) => gerar(opcoes));

  // Sem caminho vindo do renderer: abre só a pasta que o próprio main escolheu.
  handle("envelope:abrirSaida", async () => {
    const pasta = pastaDaSaida();
    if (!pasta) throw new Error("nenhuma pasta de saída ainda");
    await shell.openPath(pasta);
  });

  handle("job:start", (event, job: unknown) => startJob(event.sender, asJob(job)));
  handle("job:cancel", (_e, runId: unknown) => cancelJob(runId));

  handle("shell:reveal", async (_e, id: unknown) => {
    shell.openPath(await siteDir(asString(id, "id")));
  });

  handle("shell:openExternal", async (_e, url: unknown) => {
    const parsed = new URL(asString(url, "url"));
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("só http(s)");
    }
    await shell.openExternal(parsed.toString());
  });
}
