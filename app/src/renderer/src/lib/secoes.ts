import {
  BookOpen,
  Calendar,
  Circle,
  Clock,
  Cloud,
  Gift,
  HeartHandshake,
  Image,
  ListChecks,
  MailCheck,
  MailOpen,
  MapPin,
  MessageSquare,
  Images,
  Milestone,
  Music,
  Palette,
  Ruler,
  Flower2,
  Shirt,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";
import { MEDIDAS_PADRAO } from "@/components/PainelMedidas";
import { ORNAMENTOS_PADRAO } from "@/components/PainelOrnamentos";
import { TEMA_PADRAO } from "@/components/PainelTema";

const APELIDOS: Record<string, string> = {
  r2: "CDN (R2)",
  rsvp: "RSVP",
  iban: "IBAN",
  url: "URL",
  cta: "CTA",
  meta: "Navegador",
  pais: "Pais",
  manual: "Perguntas",
  recados: "Mural",
  dresscode: "Dress code",
  eyebrow: "Chapéu",
  pretoEBranco: "Foto em preto e branco",
  centrarNomes: "Centrar nomes com a divisória",
};

export function rotulo(chave: string): string {
  if (APELIDOS[chave]) return APELIDOS[chave];
  const legivel = chave.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");
  return legivel.charAt(0).toUpperCase() + legivel.slice(1);
}

const ICONES: Record<string, LucideIcon> = {
  noivos: Users,
  meta: Tags,
  data: Calendar,
  tema: Palette,
  medidas: Ruler,
  ornamentos: Flower2,
  assets: Cloud,
  hero: Image,
  galeria: Images,
  dresscode: Shirt,
  envelope: MailOpen,
  musica: Music,
  versiculo: BookOpen,
  pais: HeartHandshake,
  historia: Milestone,
  eventos: MapPin,
  cronograma: Clock,
  presentes: Gift,
  manual: ListChecks,
  rsvp: MailCheck,
  recados: MessageSquare,
};

export function iconeDe(chave: string): LucideIcon {
  return ICONES[chave] ?? Circle;
}

/** Onde cada chave do convite.json aparece na página. Mais de uma pode cair no mesmo bloco. */
const ANCORAS: Record<string, string> = {
  noivos: "hero",
  hero: "hero",
  envelope: "hero",
  data: "countdown",
  galeria: "galeria",
  versiculo: "versiculo",
  pais: "versiculo",
  // Mexe no hero e no versículo. Aponta pro versículo porque é lá que estão duas
  // das medidas; o nome dos noivos já está à vista no topo.
  medidas: "versiculo",
  // Aparece no canto de todas as seccoes; o versiculo e a primeira que tem uma.
  ornamentos: "versiculo",
  historia: "historia",
  eventos: "evento",
  cronograma: "nosso-dia",
  presentes: "presentes",
  manual: "manual",
  dresscode: "dresscode",
  recados: "mensagens",
};

export function ancoraDe(chave: string): string | null {
  return ANCORAS[chave] ?? null;
}

/**
 * Os blocos da página na ordem em que aparecem, com a folga de origem de cada um
 * e se tem arte no canto. `topo`/`base` são os mesmos números que o componente
 * passa como fallback — o Studio só grava o que for diferente disto, então uma
 * secção nunca tocada continua exatamente como foi desenhada.
 */
export const BLOCOS: {
  id: string;
  rotulo: string;
  topo: number;
  base: number;
  ornamento: boolean;
}[] = [
  { id: "countdown", rotulo: "contagem", topo: 50, base: 50, ornamento: false },
  { id: "galeria", rotulo: "galeria", topo: 80, base: 120, ornamento: true },
  { id: "versiculo", rotulo: "versículo", topo: 32, base: 32, ornamento: true },
  { id: "historia", rotulo: "história", topo: 100, base: 100, ornamento: true },
  { id: "evento", rotulo: "evento", topo: 100, base: 100, ornamento: true },
  { id: "nosso-dia", rotulo: "nosso dia", topo: 60, base: 60, ornamento: true },
  { id: "presentes", rotulo: "presentes", topo: 100, base: 100, ornamento: true },
  { id: "manual", rotulo: "manual", topo: 100, base: 100, ornamento: true },
  { id: "dresscode", rotulo: "dress code", topo: 100, base: 100, ornamento: true },
  { id: "mensagens", rotulo: "mural", topo: 70, base: 90, ornamento: true },
];

/**
 * O lado com que cada arte foi desenhada, alternando pela página abaixo. É o que
 * o componente passa como `side`, então enquanto ninguém escolher no Studio a
 * página sai igual ao que sempre foi.
 */
const LADO_DESENHO: Record<string, "left" | "right"> = {
  galeria: "right",
  versiculo: "left",
  historia: "right",
  evento: "left",
  "nosso-dia": "right",
  presentes: "left",
  manual: "right",
  dresscode: "left",
  mensagens: "right",
  footer: "left",
};

/** O rodapé não tem folga configurável, mas tem slot de arte como as outras. */
export const ANCORAS_ORNAMENTO: { id: string; rotulo: string; lado: "left" | "right" }[] = [
  ...BLOCOS.filter((b) => b.ornamento).map((b) => ({ id: b.id, rotulo: b.rotulo })),
  { id: "footer", rotulo: "rodapé" },
].map((a) => ({ ...a, lado: LADO_DESENHO[a.id] ?? "right" }));

/**
 * Só o que é um bloco inteiro da página. `noivos`, `hero`, `meta` e `tema` ficam
 * de fora: sem eles não sobra convite, é o mesmo que apagar o site.
 */
const DESLIGAVEIS = new Set([
  "data",
  "envelope",
  "musica",
  "galeria",
  "versiculo",
  "historia",
  "eventos",
  "cronograma",
  "presentes",
  "manual",
  "dresscode",
  "recados",
]);

export const CHAVE_SECOES = "secoes";

/**
 * O editor só desenha chave que já existe no convite.json, então uma seção que o
 * template aceita mas o arquivo não tem some da tela — foi assim que o painel de
 * medidas sumiu num convite feito por "Salvar como novo". Aqui ficam as seções
 * que o Studio sabe criar sozinho, com o conteúdo de partida.
 *
 * Só entra o que é configuração pura. Bloco de conteúdo (história, galeria) fica
 * de fora de propósito: semear um vazio poria uma seção oca no ar.
 */
const SEMENTES: Record<string, () => Record<string, unknown>> = {
  medidas: () => ({ ...MEDIDAS_PADRAO }),
  ornamentos: () => ({ ...ORNAMENTOS_PADRAO }),
  tema: () => ({ ...TEMA_PADRAO }),
};

export function ausentes(dados: Record<string, unknown>): string[] {
  return Object.keys(SEMENTES).filter((k) => !(k in dados));
}

export function semearSecao(
  dados: Record<string, unknown>,
  chave: string,
): Record<string, unknown> {
  const semente = SEMENTES[chave];
  if (!semente) return dados;
  // Antes de `tema`, que é sempre o último bloco de configuração do arquivo.
  const proximo: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(dados)) {
    if (k === "tema") proximo[chave] = semente();
    proximo[k] = v;
  }
  if (!(chave in proximo)) proximo[chave] = semente();
  return proximo;
}

export function podeDesligar(chave: string): boolean {
  return DESLIGAVEIS.has(chave);
}

export function estaLigada(dados: Record<string, unknown>, chave: string): boolean {
  const mapa = dados[CHAVE_SECOES];
  if (!mapa || typeof mapa !== "object") return true;
  return (mapa as Record<string, unknown>)[chave] !== false;
}

/**
 * Ligar apaga a chave em vez de gravar `true`: o convite.json é lido a olho nu,
 * e um mapa só com o que está desligado diz mais que um com tudo dentro.
 */
export function alternarSecao(
  dados: Record<string, unknown>,
  chave: string,
  ligada: boolean,
): Record<string, unknown> {
  const atual = { ...((dados[CHAVE_SECOES] as Record<string, unknown>) ?? {}) };
  if (ligada) delete atual[chave];
  else atual[chave] = false;
  const proximo = { ...dados };
  if (Object.keys(atual).length === 0) delete proximo[CHAVE_SECOES];
  else proximo[CHAVE_SECOES] = atual;
  return proximo;
}
