import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import { existsSync } from "node:fs";
import { loadSettings, saveSettings } from "./paths";
import { listSites, readConvite, siteDir, writeConvite } from "./sites";
import { cancelJob, destinoPublicacao, startJob, type Job } from "./cli";
import { estadoDeps } from "./deps";
import { duplicarSite, renomearSite, salvarSessaoComoNovo } from "./duplicar";
import { FILTROS, importAssets } from "./assets";
import { instalarFonte, listarFontes } from "./fontes";
import { carregarLista, carregarModelo, definirPasta, gerar, pastaDaSaida } from "./envelope";
import { estadoPreview, iniciarServidor, pararServidor, rolarPreview } from "./preview";
import { trocarPorWebp } from "./webp";
import { vigiarConvite } from "./vigia";
import {
  abrirSessao,
  entrarSessao,
  enviarAssets,
  enviarPatch,
  estadoCoop,
  fecharSessao,
  fontesDaSessao,
  pedirTranca,
  type Patch,
} from "./coop";

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

/** "0" (permanente), meses de 1 a 120, ou DD/MM/AAAA. Nada mais passa. */
function asExpires(v: unknown): string {
  const t = asString(v, "expires").trim();
  const ok = /^(0|[1-9][0-9]?|1[01][0-9]|120)$/.test(t) || /^\d{2}\/\d{2}\/\d{4}$/.test(t);
  if (!ok) throw new Error("validade inválida");
  return t;
}

function asSubdominio(v: unknown): string {
  const t = asString(v, "subdomain").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(t)) throw new Error("subdomínio inválido");
  return t;
}

function asJob(v: unknown): Job {
  if (!v || typeof v !== "object") throw new Error("job inválido");
  const j = v as Record<string, unknown>;
  switch (j.kind) {
    case "deploy":
      return {
        kind: "deploy",
        siteId: asString(j.siteId, "siteId"),
        dryRun: j.dryRun === true,
        ...(j.expires === undefined ? {} : { expires: asExpires(j.expires) }),
        ...(j.subdomain === undefined ? {} : { subdomain: asSubdominio(j.subdomain) }),
        ...(j.guestsFile === undefined ? {} : { guestsFile: asString(j.guestsFile, "guestsFile") }),
      };
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
    case "deps":
      return { kind: "deps" };
    default:
      throw new Error("job desconhecido");
  }
}

function asPatch(v: unknown): Patch {
  if (!v || typeof v !== "object") throw new Error("patch inválido");
  const p = v as Record<string, unknown>;
  if (!Array.isArray(p.caminho) || p.caminho.length === 0) throw new Error("caminho inválido");
  for (const parte of p.caminho) {
    const ok = (typeof parte === "string" && parte.length <= 64) || typeof parte === "number";
    if (!ok) throw new Error("caminho inválido");
  }
  return { caminho: p.caminho as (string | number)[], valor: p.valor };
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
  handle("convite:write", (_e, id: unknown, data: unknown, marca: unknown) =>
    writeConvite(asString(id, "id"), data, typeof marca === "number" ? marca : undefined),
  );
  handle("convite:watch", (_e, id: unknown) =>
    vigiarConvite(id === null ? null : asString(id, "id")),
  );

  handle("sites:duplicate", (_e, id: unknown, categoria: unknown, slug: unknown) =>
    duplicarSite(asString(id, "id"), asString(categoria, "categoria"), asString(slug, "nome")),
  );

  handle("sites:rename", (_e, id: unknown, slug: unknown) =>
    renomearSite(asString(id, "id"), asString(slug, "nome")),
  );

  handle("sites:salvarSessao", (_e, categoria: unknown, slug: unknown, doc: unknown) =>
    salvarSessaoComoNovo(asString(categoria, "categoria"), asString(slug, "nome"), doc),
  );

  handle("assets:import", (_e, id: unknown, origens: unknown) => {
    if (!Array.isArray(origens)) throw new Error("seleção inválida");
    return importAssets(asString(id, "id"), origens.map((o) => asString(o, "caminho")));
  });

  handle("assets:webp", (_e, id: unknown) => trocarPorWebp(asString(id, "id")));

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

  // Como convidado o banco que vale é o do anfitrião: é ele quem grava o convite
  // e quem tem o ficheiro. O banco local aqui não diria nada sobre aquele site.
  handle("fontes:listar", () => fontesDaSessao() ?? listarFontes());

  handle("fontes:instalar", async (event) => {
    if (fontesDaSessao()) throw new Error("quem instala fontes é o anfitrião");
    const escolha = await abrir(event, {
      title: "Escolha o ficheiro da fonte",
      properties: ["openFile"],
      filters: [{ name: "Fonte", extensions: ["ttf", "otf", "woff2", "woff"] }],
    });
    return escolha ? instalarFonte(escolha) : null;
  });

  handle("preview:start", (_e, id: unknown) => iniciarServidor(asString(id, "id")));
  handle("preview:stop", () => pararServidor());
  handle("preview:state", () => estadoPreview());
  handle("preview:scroll", (event, ancora: unknown) =>
    rolarPreview(event.sender, asString(ancora, "âncora")),
  );

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

  handle("coop:abrir", (_e, id: unknown) => abrirSessao(asString(id, "id")));
  handle("coop:entrar", (_e, endereco: unknown, codigo: unknown, nome: unknown) =>
    entrarSessao(asString(endereco, "endereço"), asString(codigo, "código"), asString(nome, "nome")),
  );
  handle("coop:fechar", () => fecharSessao());
  handle("coop:estado", () => estadoCoop());
  handle("coop:patch", (_e, patch: unknown) => enviarPatch(asPatch(patch)));
  // O convidado não tem a pasta do site: o ficheiro dele viaja pela sessão e é o
  // anfitrião que grava. Como anfitrião, cai no mesmo `importAssets` de sempre.
  handle("coop:asset", (_e, origens: unknown) => {
    if (!Array.isArray(origens)) throw new Error("seleção inválida");
    return enviarAssets(origens.map((o) => asString(o, "caminho")));
  });

  handle("coop:pickAsset", async (event, pasta: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const opcoes: Electron.OpenDialogOptions =
      pasta === true
        ? { title: "Escolha uma pasta de assets", properties: ["openDirectory"] }
        : { title: "Escolha os arquivos", properties: ["openFile", "multiSelections"], filters: FILTROS };
    const escolha = win
      ? await dialog.showOpenDialog(win, opcoes)
      : await dialog.showOpenDialog(opcoes);
    if (escolha.canceled || escolha.filePaths.length === 0) return [];
    return enviarAssets(escolha.filePaths);
  });

  handle("coop:tranca", (_e, secao: unknown, soltar: unknown) =>
    pedirTranca(asString(secao, "secção"), soltar === true),
  );

  handle("deps:estado", () => estadoDeps());

  handle("deploy:destino", (_e, id: unknown) => destinoPublicacao(asString(id, "id")));

  // O ficheiro entra por diálogo nativo, nunca por caminho digitado no
  // renderer: quem escolhe é o Heatz, no Finder, e o main só repassa o que ele
  // apontou.
  handle("deploy:pickGuests", (event) =>
    abrir(event, {
      title: "Lista de convidados (.txt)",
      properties: ["openFile"],
      filters: [{ name: "Lista de convidados", extensions: ["txt"] }],
    }),
  );

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
