import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from "electron";

type Result<T> = { ok: true; data: T } | { ok: false; erro: string };
type AssetImportado = { nome: string; web: string; bytes: number };
type Servidor = { siteId: string; url: string; lan: string | null };
type Copia = { id: string; siteId: string; faltam: string[] };
type SaidaCli = { runId: string; stream: "out" | "err"; text: string };
type FimCli = { runId: string; code: number; erro: string | null };
type Fonte = { chave: string; nome: string; ficheiro: string; bytes: number };
type EstadoToken = { tokenizado: boolean; faltam: string[]; impedimento: string | null };
type Convite = { dados: unknown; marca: number };
type Gravacao = { conflito: boolean; marca: number };
type ConviteMudou = { id: string; marca: number };
type Patch = { caminho: (string | number)[]; valor: unknown };
type Tranca = { secao: string; nome: string };
type Vizinho = { endereco: string; nome: string; siteId: string };
type Perto = { lista: Vizinho[]; vivo: boolean };
type EstadoDeps = {
  raiz: string | null;
  temManifesto: boolean;
  temNext: boolean;
  npm: string | null;
};
type EstadoCoop = {
  papel: "anfitriao" | "convidado" | null;
  siteId: string | null;
  endereco: string | null;
  codigo: string | null;
  pares: string[];
  trancas: Tranca[];
  aoVivo: string | null;
  erro: string | null;
};

/** Um `on*` por canal, cada um devolvendo o seu próprio desligar. */
function ouvir<T>(canal: string) {
  return (cb: (p: T) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload);
    ipcRenderer.on(canal, listener);
    return (): void => {
      ipcRenderer.off(canal, listener);
    };
  };
}

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
  readConvite: (id: string) => invoke<Convite>("convite:read", id),
  writeConvite: (id: string, data: unknown, marca?: number) =>
    invoke<Gravacao>("convite:write", id, data, marca),
  vigiarConvite: (id: string | null) => invoke<void>("convite:watch", id),
  duplicarSite: (id: string, categoria: string, slug: string) =>
    invoke<Copia>("sites:duplicate", id, categoria, slug),
  tokenEstado: (id: string) => invoke<EstadoToken>("token:estado", id),
  tokenInjetar: (id: string) => invoke<EstadoToken>("token:injetar", id),
  renomearSite: (id: string, slug: string) => invoke<{ id: string }>("sites:rename", id, slug),
  salvarSessaoComoNovo: (categoria: string, slug: string, doc: unknown) =>
    invoke<Copia>("sites:salvarSessao", categoria, slug, doc),

  importAssets: (id: string, origens: string[]) =>
    invoke<AssetImportado[]>("assets:import", id, origens),
  pickAssets: (id: string, pasta: boolean) => invoke<AssetImportado[]>("assets:pick", id, pasta),
  trocarPorWebp: (id: string) => invoke<unknown>("assets:webp", id),

  listarFontes: () => invoke<Fonte[]>("fontes:listar"),
  instalarFonte: () => invoke<Fonte[] | null>("fontes:instalar"),

  // O File do drag-and-drop não carrega mais o caminho no renderer isolado.
  caminhoDe: (file: File) => webUtils.getPathForFile(file),

  previewStart: (id: string) => invoke<Servidor>("preview:start", id),
  previewStop: () => invoke<void>("preview:stop"),
  previewState: () => invoke<Servidor | null>("preview:state"),
  previewScroll: (ancora: string) => invoke<boolean>("preview:scroll", ancora),
  previewRepintar: (doc: unknown) => invoke<boolean>("preview:repintar", doc),
  previewRecarregar: () => invoke<boolean>("preview:recarregar"),
  previewPintar: (doc: unknown) => invoke<number>("preview:pintar", doc),

  envelopeModelo: () => invoke<unknown>("envelope:modelo"),
  envelopeLista: () => invoke<unknown>("envelope:lista"),
  envelopePasta: () => invoke<string | null>("envelope:pasta"),
  envelopeGerar: (opcoes: unknown) => invoke<unknown>("envelope:gerar", opcoes),
  envelopeAbrirSaida: () => invoke<void>("envelope:abrirSaida"),

  estadoDeps: () => invoke<EstadoDeps>("deps:estado"),

  destinoPublicacao: (id: string) => invoke<{ url: string | null }>("deploy:destino", id),
  pickGuests: () => invoke<string | null>("deploy:pickGuests"),
  startJob: (job: unknown) => invoke<string>("job:start", job),
  cancelJob: (runId: string) => invoke<boolean>("job:cancel", runId),

  coopAbrir: (id: string) => invoke<EstadoCoop>("coop:abrir", id),
  coopEntrar: (endereco: string, codigo: string, nome: string) =>
    invoke<EstadoCoop>("coop:entrar", endereco, codigo, nome),
  coopFechar: () => invoke<EstadoCoop>("coop:fechar"),
  coopEstado: () => invoke<EstadoCoop>("coop:estado"),
  coopPatch: (patch: Patch) => invoke<{ ok: boolean; erro?: string }>("coop:patch", patch),
  coopAsset: (origens: string[]) => invoke<AssetImportado[]>("coop:asset", origens),
  coopPickAsset: (pasta: boolean) => invoke<AssetImportado[]>("coop:pickAsset", pasta),
  coopTranca: (secao: string, soltar: boolean) => invoke<boolean>("coop:tranca", secao, soltar),
  coopVizinhos: () => invoke<Perto>("coop:vizinhos"),
  onCoopVizinhos: ouvir<Perto>("coop:vizinhos"),
  onCoopEstado: ouvir<EstadoCoop>("coop:estado"),
  onCoopPatch: ouvir<Patch>("coop:patch"),
  onCoopCheio: ouvir<{ doc: Record<string, unknown> }>("coop:cheio"),
  onCoopTrancas: ouvir<{ trancas: Tranca[] }>("coop:trancas"),
  onCoopCaiu: ouvir<{ motivo: string }>("coop:caiu"),

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
  onConviteMudou: (cb: (p: ConviteMudou) => void) => {
    const listener = (_e: IpcRendererEvent, payload: ConviteMudou): void => cb(payload);
    ipcRenderer.on("convite:mudou", listener);
    return (): void => {
      ipcRenderer.off("convite:mudou", listener);
    };
  },
};

contextBridge.exposeInMainWorld("criarte", api);

export type CriarteApi = typeof api;
