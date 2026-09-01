import { call } from "./utils";

export type Site = {
  id: string;
  categoria: string;
  slug: string;
  temConvite: boolean;
  temPackage: boolean;
  atualizado: number | null;
};

export type AssetImportado = { nome: string; web: string; bytes: number };

export type Job =
  | { kind: "deploy"; siteId: string; dryRun: boolean }
  | { kind: "check"; siteId: string }
  | { kind: "fotos"; siteId: string; max: number; qualidade: number }
  | { kind: "doctor" }
  | { kind: "deps" };

export type EstadoDeps = {
  raiz: string | null;
  temManifesto: boolean;
  temNext: boolean;
  npm: string | null;
};

const api = window.criarte;

export const getSettings = () => call(api.getSettings());
export const pickRoot = () => call(api.pickRoot());
export const listSites = () => call(api.listSites()) as Promise<Site[]>;
export type Convite = { dados: Record<string, unknown>; marca: number };
export type Gravacao = { conflito: boolean; marca: number };

export const readConvite = (id: string) => call(api.readConvite(id)) as Promise<Convite>;
export const writeConvite = (id: string, data: unknown, marca?: number) =>
  call(api.writeConvite(id, data, marca)) as Promise<Gravacao>;
export const vigiarConvite = (id: string | null) => call(api.vigiarConvite(id));
export const onConviteMudou = api.onConviteMudou;

export type Copia = { id: string; siteId: string; faltam: string[] };
export const duplicarSite = (id: string, categoria: string, slug: string) =>
  call(api.duplicarSite(id, categoria, slug)) as Promise<Copia>;
export const salvarSessaoComoNovo = (categoria: string, slug: string, doc: unknown) =>
  call(api.salvarSessaoComoNovo(categoria, slug, doc)) as Promise<Copia>;

export const importAssets = (id: string, origens: string[]) =>
  call(api.importAssets(id, origens)) as Promise<AssetImportado[]>;
export const pickAssets = (id: string, pasta: boolean) =>
  call(api.pickAssets(id, pasta)) as Promise<AssetImportado[]>;
export const caminhoDe = api.caminhoDe;

export type TrocaWebp = { nome: string; webp: string; bytes: number; bytesWebp: number; refs: number };
export type RelatorioWebp = {
  trocas: TrocaWebp[];
  arquivos: string[];
  semPar: string[];
  parqueadas: number;
};
export const trocarPorWebp = (id: string) => call(api.trocarPorWebp(id)) as Promise<RelatorioWebp>;

export type Fonte = { chave: string; nome: string; ficheiro: string; bytes: number };
export const listarFontes = () => call(api.listarFontes()) as Promise<Fonte[]>;
export const instalarFonte = () => call(api.instalarFonte()) as Promise<Fonte[] | null>;

export type Servidor = { siteId: string; url: string; lan: string | null };

export const previewStart = (id: string) => call(api.previewStart(id)) as Promise<Servidor>;
export const previewStop = () => call(api.previewStop());
export const previewState = () => call(api.previewState()) as Promise<Servidor | null>;
export const previewScroll = (ancora: string) => call(api.previewScroll(ancora)) as Promise<boolean>;

export type Convidado = { url: string; nome: string };
export type Modelo = { nome: string; largura: number; altura: number; dataUrl: string };
export type Lista = {
  caminho: string;
  nome: string;
  total: number;
  unicos: number;
  repetidos: { nome: string; vezes: number }[];
  amostra: Convidado[];
};
export type Saida = { pasta: string; feitos: number; falhas: { nome: string; erro: string }[] };
export type PedidoEnvelope = { rect: number[]; padrao: string; semRepetidos: boolean };

export const envelopeModelo = () => call(api.envelopeModelo()) as Promise<Modelo | null>;
export const envelopeLista = () => call(api.envelopeLista()) as Promise<Lista | null>;
export const envelopePasta = () => call(api.envelopePasta()) as Promise<string | null>;
export const envelopeGerar = (p: PedidoEnvelope) => call(api.envelopeGerar(p)) as Promise<Saida>;
export const envelopeAbrirSaida = () => call(api.envelopeAbrirSaida());

export type Patch = { caminho: (string | number)[]; valor: unknown };
export type Tranca = { secao: string; nome: string };
export type EstadoCoop = {
  papel: "anfitriao" | "convidado" | null;
  siteId: string | null;
  endereco: string | null;
  codigo: string | null;
  pares: string[];
  trancas: Tranca[];
  /** Preview do anfitrião, servido pela LAN. Só o convidado recebe. */
  aoVivo: string | null;
  erro: string | null;
};

export const coopAbrir = (id: string) => call(api.coopAbrir(id)) as Promise<EstadoCoop>;
export const coopEntrar = (endereco: string, codigo: string, nome: string) =>
  call(api.coopEntrar(endereco, codigo, nome)) as Promise<EstadoCoop>;
export const coopFechar = () => call(api.coopFechar()) as Promise<EstadoCoop>;
export const coopEstado = () => call(api.coopEstado()) as Promise<EstadoCoop>;
export const coopPatch = (patch: Patch) =>
  call(api.coopPatch(patch)) as Promise<{ ok: boolean; erro?: string }>;
export const coopAsset = (origens: string[]) =>
  call(api.coopAsset(origens)) as Promise<AssetImportado[]>;
export const coopPickAsset = (pasta: boolean) =>
  call(api.coopPickAsset(pasta)) as Promise<AssetImportado[]>;
export const coopTranca = (secao: string, soltar: boolean) =>
  call(api.coopTranca(secao, soltar)) as Promise<boolean>;
export const onCoopEstado = api.onCoopEstado;
export const onCoopPatch = api.onCoopPatch;
export const onCoopCheio = api.onCoopCheio;
export const onCoopTrancas = api.onCoopTrancas;
export const onCoopCaiu = api.onCoopCaiu;

export const estadoDeps = () => call(api.estadoDeps()) as Promise<EstadoDeps>;

export const destinoPublicacao = (id: string) =>
  call(api.destinoPublicacao(id)) as Promise<{ url: string | null }>;
export const startJob = (job: Job) => call(api.startJob(job));
export const cancelJob = (runId: string) => call(api.cancelJob(runId));
export const reveal = (id: string) => call(api.reveal(id));
export const openExternal = (url: string) => call(api.openExternal(url));
export const onOutput = api.onOutput;
export const onDone = api.onDone;
