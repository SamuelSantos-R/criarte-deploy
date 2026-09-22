import painel from "../../convite.json";

/**
 * PAINEL RSVP — tudo o que se vê vem do `convite.json`, como nos convites. O
 * Studio escreve o ficheiro, o painel só o lê: quem edita não abre código.
 */
export const conteudo = painel;

export const NOIVOS = painel.evento.noivos;
export const DATA_EVENTO = painel.evento.data;
export const DATA_EVENTO_ISO = painel.evento.dataISO;
/** Versão segura pra usar dentro de HTML (escapa o "&"). */
export const NOIVOS_HTML = NOIVOS.replace(/&/g, "&amp;");

export const rsvpContent = painel;

/** `NOME DO ACOMPANHANTE 2` sai do molde com `{n}`, pra ela poder reescrever a frase. */
export function rotuloAcompanhante(n: number, total: number): string {
  if (total <= 1) return painel.card.labelAcompanhanteUnico;
  return painel.card.labelAcompanhanteNumerado.replace("{n}", String(n));
}

export type Canto = "superior-esquerdo" | "superior-direito" | "inferior-esquerdo" | "inferior-direito";

export type Moldura = {
  arquivo: string;
  canto: Canto;
  /** Folga até ao canto, em % da largura (X) e da altura (Y) do ecrã. */
  folgaX: number;
  folgaY: number;
  /** Largura em % da largura do ecrã. */
  largura: number;
  espelhoX: boolean;
  espelhoY: boolean;
};

// A prancheta do Studio tem 452×786 — o retrato de telemóvel em que a moldura
// foi desenhada. Guardar tudo em percentagem dela é o que faz o desenho chegar
// igual a um ecrã maior ou menor.
export const PRANCHETA = { largura: 452, altura: 786 };

// O painel nasceu com `clamp(132px, 37vw, 315px)`: o piso e o teto vêm daí, por
// regra de três, pra quem não mexer na largura ver exactamente o que já via.
const PISO_POR_VW = 132 / 37;
const TETO_POR_VW = 315 / 37;

/** O estilo de uma moldura: canto, folga, largura e espelho, prontos pro `style`. */
export function estiloDaMoldura(m: Moldura): React.CSSProperties {
  const vertical = m.canto.startsWith("superior") ? "top" : "bottom";
  const horizontal = m.canto.endsWith("esquerdo") ? "left" : "right";
  const espelho = `scale(${m.espelhoX ? -1 : 1}, ${m.espelhoY ? -1 : 1})`;
  return {
    [vertical]: `${m.folgaY}%`,
    [horizontal]: `${m.folgaX}%`,
    width: `clamp(${(m.largura * PISO_POR_VW).toFixed(1)}px, ${m.largura}vw, ${(m.largura * TETO_POR_VW).toFixed(1)}px)`,
    height: "auto",
    transform: espelho,
  } as React.CSSProperties;
}

export const molduras = painel.molduras as Moldura[];

/**
 * As cores do painel viram custom properties no `<html>`: o componente passa a
 * pedir `var(--p-destaque)` em vez de ter o dourado do primeiro casal cravado,
 * e o painel seguinte só precisa de outro `tema` no json.
 */
export function varsDoPainel(): React.CSSProperties {
  const t = painel.tema;
  return {
    "--p-fundo": t.fundo,
    "--p-card": t.card,
    "--p-card-borda": t.cardBorda,
    "--p-destaque": t.destaque,
    "--p-texto": t.texto,
    "--p-sucesso": t.sucesso,
  } as React.CSSProperties;
}

/** Tons do confete. Sem lista no json, cai no dourado do molde. */
export const coresDoConfete: string[] =
  Array.isArray(painel.tema.confete) && painel.tema.confete.length > 0
    ? painel.tema.confete
    : ["#A2824E", "#C6A46A", "#D9BE8B", "#8A6C3C", "#EBD9B8"];
