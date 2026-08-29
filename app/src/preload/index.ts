import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from "electron";

type Result<T> = { ok: true; data: T } | { ok: false; erro: string };
type AssetImportado = { nome: string; web: string; bytes: number };
type Servidor = { siteId: string; url: string; lan: string | null };
type SaidaCli = { runId: string; stream: "out" | "err"; text: string };
type FimCli = { runId: string; code: number; erro: string | null };

const invoke = <T>(canal: string, ...args: unknown[]): Promise<Result<T>> =>
  ipcRenderer.invoke(canal, ...args);

/**
 * Superfície fechada: o renderer só enxerga estas funções. Nada de expor
 * `ipcRenderer` inteiro — isso deixaria qualquer canal do main alcançável.
 */
const api = {
  getSettings: () => invoke<{ sitesRoot: string | null }>("settings:get"),
  pickRoot: () => invoke<{ sitesRoot: string | null }>("settings:pickRoot"),

  listSites: () => invoke<unknown[]>("sites:list"),
  readConvite: (id: string) => invoke<unknown>("convite:read", id),
  writeConvite: (id: string, data: unknown) => invoke<void>("convite:write", id, data),

  importAssets: (id: string, origens: string[]) =>
    invoke<AssetImportado[]>("assets:import", id, origens),
  pickAssets: (id: string, pasta: boolean) => invoke<AssetImportado[]>("assets:pick", id, pasta),
  trocarPorWebp: (id: string) => invoke<unknown>("assets:webp", id),
  // O File do drag-and-drop não carrega mais o caminho no renderer isolado.
  caminhoDe: (file: File) => webUtils.getPathForFile(file),

  previewStart: (id: string) => invoke<Servidor>("preview:start", id),
  previewStop: () => invoke<void>("preview:stop"),
  previewState: () => invoke<Servidor | null>("preview:state"),
  previewScroll: (ancora: string) => invoke<boolean>("preview:scroll", ancora),

  envelopeModelo: () => invoke<unknown>("envelope:modelo"),
  envelopeLista: () => invoke<unknown>("envelope:lista"),
  envelopePasta: () => invoke<string | null>("envelope:pasta"),
  envelopeGerar: (opcoes: unknown) => invoke<unknown>("envelope:gerar", opcoes),
  envelopeAbrirSaida: () => invoke<void>("envelope:abrirSaida"),

  startJob: (job: unknown) => invoke<string>("job:start", job),
  cancelJob: (runId: string) => invoke<boolean>("job:cancel", runId),

  reveal: (id: string) => invoke<void>("shell:reveal", id),
  openExternal: (url: string) => invoke<void>("shell:openExternal", url),

  onOutput: (cb: (p: SaidaCli) => void) => {
    const listener = (_e: IpcRendererEvent, payload: SaidaCli): void => cb(payload);
    ipcRenderer.on("cli:output", listener);
    return () => ipcRenderer.off("cli:output", listener);
  },
  onDone: (cb: (p: FimCli) => void) => {
    const listener = (_e: IpcRendererEvent, payload: FimCli): void => cb(payload);
    ipcRenderer.on("cli:done", listener);
    return () => ipcRenderer.off("cli:done", listener);
  },
};

contextBridge.exposeInMainWorld("criarte", api);

export type CriarteApi = typeof api;
