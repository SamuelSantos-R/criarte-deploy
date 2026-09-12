import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { loadSettings, saveSettings } from "./paths";
import { estadoCredenciais, exportarCredenciais, importarCredenciais } from "./credenciais";
import { listSites, readConvite, siteDir, writeConvite } from "./sites";
import { cancelJob, destinoPublicacao, startJob, type Job } from "./cli";
import { estadoDeps } from "./deps";
import {
  apagarSite,
  duplicarSite,
  estadoDoSlug,
  libertarSlug,
  renomearSite,
  salvarSessaoComoNovo,
  sincronizarTitulo,
} from "./duplicar";
import { FILTROS, importAssets, semearAsset } from "./assets";
import { instalarFonte, listarFontes } from "./fontes";
import { carregarLista, carregarModelo, definirPasta, gerar, pastaDaSaida } from "./envelope";
import { exportar, fontesRecentes, importarFonte, lerFonte, recursosMonograma, ultimaPasta } from "./monograma";
import { abrirDaBiblioteca, apagarDaBiblioteca, baixarSvg, listarBiblioteca, salvarNaBiblioteca } from "./biblioteca";
import { estadoPreview, forcarRepinte, iniciarServidor, pararServidor, pintarPreview, repintarPreview, rolarPreview } from "./preview";
import { construirEspelho, estadoEspelho, pararEspelho } from "./telemovel";
import { atualizarSecao, estadoPlantio, plantarSecao } from "./plantar";
import { resolverFormulario } from "./formulario";
import { estadoToken, tokenizar } from "./tokenizar";
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
import { aoMudarVizinhos, farolVivo, vizinhos } from "./vizinhos";

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
  // Vizinho que entra ou sai não pode depender de o painel estar a perguntar: a
  // lista é empurrada, senão só aparece quando alguém reabre o separador.
  aoMudarVizinhos(() => {
    const perto = { lista: vizinhos(), vivo: farolVivo() };
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send("coop:vizinhos", perto);
  });

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
  handle("convite:write", async (_e, id: unknown, data: unknown, marca: unknown) => {
    const alvo = asString(id, "id");
    const r = await writeConvite(alvo, data, typeof marca === "number" ? marca : undefined);
    // O título do banco segue os noivos, mas sem nunca atrasar nem estragar a
    // gravação: sai sem `await`, e a própria função engole a falha. Gravação em
    // conflito não conta — o disco não é o que está no ecrã.
    if (!r.conflito) void sincronizarTitulo(alvo, data);
    return r;
  });
  handle("convite:watch", (_e, id: unknown) =>
    vigiarConvite(id === null ? null : asString(id, "id")),
  );

  handle("sites:duplicate", (_e, id: unknown, categoria: unknown, slug: unknown) =>
    duplicarSite(asString(id, "id"), asString(categoria, "categoria"), asString(slug, "nome")),
  );

  handle("token:estado", (_e, id: unknown) => estadoToken(asString(id, "id")));
  handle("token:injetar", (_e, id: unknown) => tokenizar(asString(id, "id")));

  handle("sites:rename", (_e, id: unknown, slug: unknown) =>
    renomearSite(asString(id, "id"), asString(slug, "nome")),
  );

  handle("sites:estadoSlug", (_e, categoria: unknown, slug: unknown) =>
    estadoDoSlug(asString(categoria, "categoria"), asString(slug, "nome")),
  );
  handle("sites:liberar", (_e, slug: unknown) => libertarSlug(asString(slug, "nome")));
  handle("sites:apagar", (_e, id: unknown) => apagarSite(asString(id, "id")));

  handle("sites:salvarSessao", (_e, categoria: unknown, slug: unknown, doc: unknown) =>
    salvarSessaoComoNovo(asString(categoria, "categoria"), asString(slug, "nome"), doc),
  );

  handle("assets:import", (_e, id: unknown, origens: unknown) => {
    if (!Array.isArray(origens)) throw new Error("seleção inválida");
    return importAssets(asString(id, "id"), origens.map((o) => asString(o, "caminho")));
  });

  handle("assets:semente", (_e, id: unknown, secao: unknown) =>
    semearAsset(asString(id, "id"), asString(secao, "secao")),
  );

  handle("secao:plantar", (_e, id: unknown, secao: unknown) =>
    plantarSecao(asString(id, "id"), asString(secao, "secao")),
  );

  handle("secao:estado", (_e, id: unknown, secao: unknown) =>
    estadoPlantio(asString(id, "id"), asString(secao, "secao")),
  );

  handle("secao:atualizar", (_e, id: unknown, secao: unknown) =>
    atualizarSecao(asString(id, "id"), asString(secao, "secao")),
  );

  handle("form:resolver", (_e, url: unknown) => resolverFormulario(asString(url, "url")));

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

  // O build fala durante ~35 a 80 segundos; as linhas vão saindo para a janela
  // em vez de ficarem presas até ao fim, senão o botão parece pendurado.
  handle("telemovel:construir", (event, id: unknown) =>
    construirEspelho(asString(id, "id"), (linha) => {
      if (!event.sender.isDestroyed()) event.sender.send("telemovel:passo", linha);
    }),
  );
  handle("telemovel:parar", () => pararEspelho());
  handle("telemovel:estado", () => estadoEspelho());

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

  handle("monograma:recursos", () => recursosMonograma());
  handle("monograma:fontes", () => fontesRecentes());
  handle("monograma:lerFonte", (_e, chave: unknown) => lerFonte(chave));
  handle("monograma:importarFonte", (_e, caminho: unknown) => importarFonte(asString(caminho, "caminho")));

  // A pasta sai sempre do diálogo do main; o renderer só manda o conteúdo.
  handle("monograma:exportar", async (event, carga: unknown) => {
    const pasta = await abrir(event, {
      title: "Onde salvar o monograma",
      defaultPath: ultimaPasta() ?? undefined,
      properties: ["openDirectory", "createDirectory"],
    });
    return pasta ? exportar(pasta, carga) : null;
  });

  handle("biblioteca:listar", () => listarBiblioteca());
  handle("biblioteca:salvar", (_e, carga: unknown) => salvarNaBiblioteca(carga));
  handle("biblioteca:abrir", (_e, id: unknown) => abrirDaBiblioteca(id));
  handle("biblioteca:apagar", (_e, id: unknown) => apagarDaBiblioteca(id));
  handle("biblioteca:baixarSvg", (_e, id: unknown) => baixarSvg(id));

  handle("monograma:abrirPasta", async () => {
    const pasta = ultimaPasta();
    if (!pasta) throw new Error("nenhum monograma exportado ainda");
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
  handle("coop:vizinhos", () => ({ lista: vizinhos(), vivo: farolVivo() }));

  handle("deps:estado", () => estadoDeps());

  handle("preview:repintar", (event, doc: unknown) => repintarPreview(event.sender, doc));
  handle("preview:recarregar", (event) => forcarRepinte(event.sender));
  handle("preview:pintar", (event, doc: unknown) => pintarPreview(event.sender, doc));

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

  handle("cred:estado", () => estadoCredenciais());

  // Mesma regra do pickGuests: caminho vem sempre de diálogo nativo. Aqui pesa
  // mais — é o ficheiro com os segredos todos da equipa.
  handle("cred:importar", async (event) => {
    const origem = await abrir(event, {
      title: "Credenciais do Criarte (config.json)",
      properties: ["openFile"],
      filters: [{ name: "Credenciais", extensions: ["json"] }],
    });
    return origem ? await importarCredenciais(origem) : null;
  });

  handle("cred:exportar", async (event) => {
    const conteudo = await exportarCredenciais();
    const win = BrowserWindow.fromWebContents(event.sender);
    const opcoes: Electron.SaveDialogOptions = {
      title: "Guardar credenciais para a equipa",
      defaultPath: "criarte-credenciais.json",
      filters: [{ name: "Credenciais", extensions: ["json"] }],
    };
    const r = win ? await dialog.showSaveDialog(win, opcoes) : await dialog.showSaveDialog(opcoes);
    if (r.canceled || !r.filePath) return null;
    await writeFile(r.filePath, conteudo, { encoding: "utf8", mode: 0o600 });
    return r.filePath;
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
