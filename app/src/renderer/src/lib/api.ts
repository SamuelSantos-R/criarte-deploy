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
  | { kind: "doctor" };

const api = window.criarte;

export const getSettings = () => call(api.getSettings());
export const pickRoot = () => call(api.pickRoot());
export const listSites = () => call(api.listSites()) as Promise<Site[]>;
export const readConvite = (id: string) => call(api.readConvite(id)) as Promise<Record<string, unknown>>;
export const writeConvite = (id: string, data: unknown) => call(api.writeConvite(id, data));

export type Copia = { id: string; siteId: string; envTrocado: boolean };
export const duplicarSite = (id: string, categoria: string, slug: string) =>
  call(api.duplicarSite(id, categoria, slug)) as Promise<Copia>;

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

export const startJob = (job: Job) => call(api.startJob(job));
export const cancelJob = (runId: string) => call(api.cancelJob(runId));
export const reveal = (id: string) => call(api.reveal(id));
export const openExternal = (url: string) => call(api.openExternal(url));
export const onOutput = api.onOutput;
export const onDone = api.onDone;
