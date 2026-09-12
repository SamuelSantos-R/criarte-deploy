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
  | {
      kind: "deploy";
      siteId: string;
      dryRun: boolean;
      expires?: string;
      subdomain?: string;
      guestsFile?: string;
    }
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

export type Copia = { id: string; siteId: string | null; faltam: string[] };
export const duplicarSite = (id: string, categoria: string, slug: string) =>
  call(api.duplicarSite(id, categoria, slug)) as Promise<Copia>;
export type EstadoToken = { tokenizado: boolean; faltam: string[]; impedimento: string | null };
export const tokenEstado = (id: string) => call(api.tokenEstado(id)) as Promise<EstadoToken>;
export const tokenInjetar = (id: string) => call(api.tokenInjetar(id)) as Promise<EstadoToken>;

export const renomearSite = (id: string, slug: string) =>
  call(api.renomearSite(id, slug)) as Promise<{ id: string }>;

export type EstadoSlug = { slug: string; registado: boolean; temPasta: boolean; recados: number };
/** O que já existe com este nome — antes de apagar seja o que for. */
export const estadoSlug = (categoria: string, slug: string) =>
  call(api.estadoSlug(categoria, slug)) as Promise<EstadoSlug>;
/** Solta um nome preso no Supabase sem mexer em pasta nenhuma. */
export const liberarSlug = (slug: string) =>
  call(api.liberarSlug(slug)) as Promise<{ recados: number }>;
/** Apaga o convite inteiro: registo no Supabase e pasta em disco. */
export const apagarSite = (id: string) =>
  call(api.apagarSite(id)) as Promise<{ recados: number }>;
export const salvarSessaoComoNovo = (categoria: string, slug: string, doc: unknown) =>
  call(api.salvarSessaoComoNovo(categoria, slug, doc)) as Promise<Copia>;

export const importAssets = (id: string, origens: string[]) =>
  call(api.importAssets(id, origens)) as Promise<AssetImportado[]>;
export const pickAssets = (id: string, pasta: boolean) =>
  call(api.pickAssets(id, pasta)) as Promise<AssetImportado[]>;
export const semearAsset = (id: string, secao: string) =>
  call(api.semearAsset(id, secao)) as Promise<AssetImportado | null>;

/** O componente da secção, posto dentro do convite e ligado na página. */
export type Plantio = {
  ficheiros: string[];
  ligada: boolean;
  impedimento: string | null;
  desatualizada: boolean;
};
export const plantarSecao = (id: string, secao: string) =>
  call(api.plantarSecao(id, secao)) as Promise<Plantio>;
/** O mesmo diagnóstico do plantio, sem tocar em nada. */
export const estadoPlantio = (id: string, secao: string) =>
  call(api.estadoPlantio(id, secao)) as Promise<Plantio>;
/** Troca o componente plantado pelo molde deste Studio. */
export const atualizarSecao = (id: string, secao: string) =>
  call(api.atualizarSecao(id, secao)) as Promise<Plantio>;
/** Devolve o `/formResponse` do Google Form, venha o link curto ou o longo. */
export const resolverFormulario = (url: string) =>
  call(api.resolverFormulario(url)) as Promise<string>;
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
export const previewRepintar = (doc?: unknown) =>
  call(api.previewRepintar(doc)) as Promise<boolean>;
export const previewRecarregar = () => call(api.previewRecarregar()) as Promise<boolean>;
/** Cor e medida no quadro, no mesmo instante. Devolve quantas vars entraram. */
export const previewPintar = (doc: unknown) => call(api.previewPintar(doc)) as Promise<number>;

/**
 * A cópia construída que o telemóvel lê pelo QR. O `next dev` entrega ~12 MB de
 * JavaScript e recompila a cada gravação — o separador aberto no telemóvel perde
 * o fio dos chunks e o Safari mata-o. Esta cópia não recompila e pesa ~850 KB.
 */
export type Espelho = { siteId: string; lan: string | null; url: string; feito: number };
export const telemovelConstruir = (id: string) =>
  call(api.telemovelConstruir(id)) as Promise<Espelho>;
export const telemovelParar = () => call(api.telemovelParar());
export const telemovelEstado = () => call(api.telemovelEstado()) as Promise<Espelho | null>;
export const onTelemovelPasso = api.onTelemovelPasso;

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
/** Anfitrião a gritar na rede local. O código vem no grito: clicar entra. */
export type Vizinho = { endereco: string; nome: string; siteId: string; codigo: string | null };
/** `vivo: false` = a difusão não sai desta máquina; a lista vazia não é culpa de ninguém. */
export type Perto = { lista: Vizinho[]; vivo: boolean };
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
export const coopVizinhos = () => call(api.coopVizinhos()) as Promise<Perto>;
export const onCoopVizinhos = api.onCoopVizinhos;
export const onCoopEstado = api.onCoopEstado;
export const onCoopPatch = api.onCoopPatch;
export const onCoopCheio = api.onCoopCheio;
export const onCoopTrancas = api.onCoopTrancas;
export const onCoopCaiu = api.onCoopCaiu;

export const estadoDeps = () => call(api.estadoDeps()) as Promise<EstadoDeps>;

/** O que esta máquina consegue fazer com o `~/.criarte-deploy/config.json` que tem. */
export type EstadoCredenciais = {
  temFicheiro: boolean;
  podePublicar: boolean;
  podeRegistar: boolean;
  nome: string | null;
};
export const credEstado = () => call(api.credEstado()) as Promise<EstadoCredenciais>;
export const credImportar = () => call(api.credImportar()) as Promise<EstadoCredenciais | null>;
export const credExportar = () => call(api.credExportar()) as Promise<string | null>;

export const destinoPublicacao = (id: string) =>
  call(api.destinoPublicacao(id)) as Promise<{ url: string | null }>;
export const pickGuests = () => call(api.pickGuests()) as Promise<string | null>;
export const startJob = (job: Job) => call(api.startJob(job));
export const cancelJob = (runId: string) => call(api.cancelJob(runId));
export const reveal = (id: string) => call(api.reveal(id));
export const openExternal = (url: string) => call(api.openExternal(url));
export const onOutput = api.onOutput;
export const onDone = api.onDone;
