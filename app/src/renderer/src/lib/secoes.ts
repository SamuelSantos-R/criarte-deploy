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
  Shirt,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";

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
