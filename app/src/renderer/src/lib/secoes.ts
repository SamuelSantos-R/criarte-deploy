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
  Milestone,
  Music,
  Palette,
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
