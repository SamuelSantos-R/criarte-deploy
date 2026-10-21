import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ============================================================================
// IDIOMA — o convite em inglês e francês para os convidados de fora. Não há segundo site
// nem segundo build: o link do convidado leva `&l=en`, e o convite troca o texto
// no próprio browser. O que o casal escreve vem do bloco `en` do convite.json,
// por cima do português; o que vive cravado nos componentes passa pelo `t()`.
//
// Sem nada importado do Electron de propósito: assim os testes correm em Node
// puro contra cópias reais dos convites.
// ============================================================================

/**
 * O ficheiro que o convite recebe em `src/lib/idioma.ts`. Decide o idioma na
 * avaliação do módulo, antes de qualquer componente ler o convite: as constantes
 * de topo (`mes`, `casal`, as frases do RSVP) já nascem no idioma certo.
 *
 * O HTML exportado vem sempre em português. Em inglês o React percebe a
 * diferença ao hidratar e redesenha no cliente — por baixo do envelope, que é a
 * primeira coisa que a pessoa vê, por isso a troca não aparece.
 */
export const IDIOMA_TS = `// Criado pelo Criarte Studio — o convite em inglês e francês para os convidados de fora.
// Não editar à mão: o Studio reescreve este ficheiro quando o dicionário cresce.
export type Idioma = "pt" | "en" | "fr";

const pedido = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("l") : null;
export const idioma: Idioma = pedido === "en" || pedido === "fr" ? pedido : "pt";

// A chave é o próprio texto em português: o componente continua legível e o
// que faltar aqui sai em português em vez de sair vazio.
const EN: Record<string, string> = {
  Janeiro: "January",
  Fevereiro: "February",
  "Março": "March",
  Abril: "April",
  Maio: "May",
  Junho: "June",
  Julho: "July",
  Agosto: "August",
  Setembro: "September",
  Outubro: "October",
  Novembro: "November",
  Dezembro: "December",
  "Deslize para baixo": "Scroll down",
  "Acessar Localização": "View location",
  "Hoje é o grande dia!": "Today is the big day!",
  dias: "days",
  horas: "hours",
  seg: "sec",
  "Correio do Amor": "Love Letters",
  "Seu nome": "Your name",
  "Mensagem de carinho aos noivos ♡": "A loving note for the couple ♡",
  "Deixe uma mensagem especial para este momento.": "Leave a special message for this moment.",
  "Prometemos ler com muito carinho!": "We promise to read it with love!",
  "❌ Não foi possível enviar a tua mensagem. Tenta novamente em instantes.":
    "❌ We couldn't send your message. Please try again in a moment.",
  "✉️ Obrigado, {}! A tua mensagem foi recebida com muito carinho.":
    "✉️ Thank you, {}! Your message was received with love.",
  "Ativar som": "Turn sound on",
  "Silenciar som": "Mute",
  "Desenvolvido com amor por": "Made with love by",
  "Copiar IBAN": "Copy IBAN",
  "IBAN Copiado!": "IBAN copied!",
  "Por favor, confirme a sua presença": "Please confirm your attendance",
  "Por favor, confirme até {}": "Please confirm by {}",
  "Confirmações encerradas": "RSVP closed",
  "Sim, estarei lá!": "Yes, I'll be there!",
  "Não poderei ir": "I can't make it",
  "Nome completo do acompanhante": "Full name of your plus-one",
  "Nome completo do acompanhante {}": "Full name of plus-one {}",
  "Enviando...": "Sending...",
  "Confirmar Presença": "Confirm attendance",
  "Ausência Informada": "Absence noted",
  "Presença Confirmada": "Attendance confirmed",
  "Enviar Mensagem": "Send message",
  pausado: "paused",
  "{} de {} de {}": "{} {} {}",
  " de {} de ": " {} ",
  Domingo: "Sunday",
  "Segunda-feira": "Monday",
  "Terça-feira": "Tuesday",
  "Quarta-feira": "Wednesday",
  "Quinta-feira": "Thursday",
  "Sexta-feira": "Friday",
  "Sábado": "Saturday",
  "às {}h{}": "at {}:{}",
  "Somente eu": "Just me",
  "+1 acompanhante": "+1 guest",
  "Nome completo": "Full name",
  "Você irá comparecer?": "Will you attend?",
  "Nome do acompanhante": "Plus-one's name",
  "Nome do acompanhante {}": "Plus-one's name {}",
  "Enviar Resposta": "Send reply",
  "Sentiremos sua falta!": "We'll miss you!",
  "Obrigado por nos avisar.": "Thank you for letting us know.",
  "Sua presença foi confirmada!": "Your attendance is confirmed!",
  "Mal esperamos para celebrar juntos!": "We can't wait to celebrate together!",
  "Por favor, confirmar até o dia": "Please confirm by",
  "Manual do": "The good",
  "Bom Convidado": "Guest Guide",
  "SUA PRESENÇA\\nÉ ESSENCIAL": "YOUR PRESENCE\\nMATTERS",
  "POR FAVOR,\\nSEJA PONTUAL": "PLEASE\\nBE ON TIME",
  "CONVIDADO\\nNÃO CONVIDA": "NO EXTRA\\nGUESTS, PLEASE",
  "COMEMORE\\nA NOSSA UNIÃO": "CELEBRATE\\nOUR UNION",
  "REGISTE OS\\nBONS MOMENTOS": "CAPTURE THE\\nGOOD MOMENTS",
  "SORRIA E SEJA\\nMUITO FELIZ": "SMILE AND BE\\nVERY HAPPY",
  "DESPEÇA-SE\\nDOS NOIVOS": "SAY GOODBYE\\nTO THE COUPLE",
  "POR FAVOR, NÃO\\nLEVAR CRIANÇAS": "PLEASE, NO\\nCHILDREN",
  "AGRADECEMOS A COMPREENSÃO": "THANK YOU FOR YOUR UNDERSTANDING",
  "E O VOSSO CARINHO!": "AND YOUR LOVE!",
  Voltar: "Back",
};

const FR: Record<string, string> = {
  Janeiro: "Janvier",
  Fevereiro: "Février",
  "Março": "Mars",
  Abril: "Avril",
  Maio: "Mai",
  Junho: "Juin",
  Julho: "Juillet",
  Agosto: "Août",
  Setembro: "Septembre",
  Outubro: "Octobre",
  Novembro: "Novembre",
  Dezembro: "Décembre",
  "Deslize para baixo": "Faites défiler",
  "Acessar Localização": "Voir l'adresse",
  "Hoje é o grande dia!": "C'est le grand jour !",
  dias: "jours",
  horas: "heures",
  seg: "sec",
  "Correio do Amor": "Mots d'amour",
  "Seu nome": "Votre nom",
  "Mensagem de carinho aos noivos ♡": "Un mot doux pour les mariés ♡",
  "Deixe uma mensagem especial para este momento.": "Laissez un message spécial pour ce moment.",
  "Prometemos ler com muito carinho!": "Nous promettons de le lire avec tendresse !",
  "❌ Não foi possível enviar a tua mensagem. Tenta novamente em instantes.":
    "❌ Votre message n'a pas pu être envoyé. Réessayez dans un instant.",
  "✉️ Obrigado, {}! A tua mensagem foi recebida com muito carinho.":
    "✉️ Merci, {} ! Votre message a été reçu avec tendresse.",
  "Ativar som": "Activer le son",
  "Silenciar som": "Couper le son",
  "Desenvolvido com amor por": "Réalisé avec amour par",
  "Copiar IBAN": "Copier l'IBAN",
  "IBAN Copiado!": "IBAN copié !",
  "Por favor, confirme a sua presença": "Merci de confirmer votre présence",
  "Por favor, confirme até {}": "Merci de confirmer avant le {}",
  "Confirmações encerradas": "Confirmations closes",
  "Sim, estarei lá!": "Oui, je serai là !",
  "Não poderei ir": "Je ne pourrai pas venir",
  "Nome completo do acompanhante": "Nom complet de votre accompagnant",
  "Nome completo do acompanhante {}": "Nom complet de l'accompagnant {}",
  "Enviando...": "Envoi...",
  "Confirmar Presença": "Confirmer ma présence",
  "Ausência Informada": "Absence signalée",
  "Presença Confirmada": "Présence confirmée",
  "Enviar Mensagem": "Envoyer le message",
  pausado: "en pause",
  "{} de {} de {}": "{} {} {}",
  " de {} de ": " {} ",
  Domingo: "Dimanche",
  "Segunda-feira": "Lundi",
  "Terça-feira": "Mardi",
  "Quarta-feira": "Mercredi",
  "Quinta-feira": "Jeudi",
  "Sexta-feira": "Vendredi",
  "Sábado": "Samedi",
  "às {}h{}": "à {}h{}",
  "Somente eu": "Seulement moi",
  "+1 acompanhante": "+1 accompagnant",
  "Nome completo": "Nom complet",
  "Você irá comparecer?": "Serez-vous présent(e) ?",
  "Nome do acompanhante": "Nom de l'accompagnant",
  "Nome do acompanhante {}": "Nom de l'accompagnant {}",
  "Enviar Resposta": "Envoyer la réponse",
  "Sentiremos sua falta!": "Vous allez nous manquer !",
  "Obrigado por nos avisar.": "Merci de nous avoir prévenus.",
  "Sua presença foi confirmada!": "Votre présence est confirmée !",
  "Mal esperamos para celebrar juntos!": "Nous avons hâte de célébrer ensemble !",
  "Por favor, confirmar até o dia": "Merci de confirmer avant le",
  "Manual do": "Le guide du",
  "Bom Convidado": "Bon Invité",
  "SUA PRESENÇA\\nÉ ESSENCIAL": "VOTRE PRÉSENCE\\nEST ESSENTIELLE",
  "POR FAVOR,\\nSEJA PONTUAL": "MERCI D'ÊTRE\\nPONCTUEL",
  "CONVIDADO\\nNÃO CONVIDA": "UN INVITÉ\\nN'INVITE PAS",
  "COMEMORE\\nA NOSSA UNIÃO": "CÉLÉBREZ\\nNOTRE UNION",
  "REGISTE OS\\nBONS MOMENTOS": "IMMORTALISEZ\\nLES BEAUX MOMENTS",
  "SORRIA E SEJA\\nMUITO FELIZ": "SOURIEZ ET SOYEZ\\nHEUREUX",
  "DESPEÇA-SE\\nDOS NOIVOS": "DITES AU REVOIR\\nAUX FIANCÉS",
  "POR FAVOR, NÃO\\nLEVAR CRIANÇAS": "MERCI DE NE PAS\\nVENIR AVEC DES ENFANTS",
  "AGRADECEMOS A COMPREENSÃO": "MERCI POUR VOTRE COMPRÉHENSION",
  "E O VOSSO CARINHO!": "ET VOTRE AFFECTION !",
  Voltar: "Retour",
};

const DICIONARIO: Record<Idioma, Record<string, string>> = { pt: {}, en: EN, fr: FR };

export function t(pt: string): string {
  return DICIONARIO[idioma][pt] ?? pt;
}

/** Para frase com um valor no meio: \`tf("Por favor, confirme até {}", prazo)\`. */
export function tf(pt: string, ...valores: unknown[]): string {
  let i = 0;
  return t(pt).replace(/\\{\\}/g, () => String(valores[i++] ?? ""));
}

const objeto = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

// Só o que foi traduzido sobe por cima: campo vazio ou ausente no bloco da
// língua fica em português. Listas de objetos (eventos, história) casam posição
// a posição para a hora e o local não precisarem de ser escritos duas vezes;
// listas de texto (linhas de uma chamada) trocam inteiras, porque a tradução
// raramente tem o mesmo número de linhas. O vídeo do envelope entra igual: é um
// texto (o caminho) no bloco da língua.
function fundir(pt: unknown, tr: unknown): unknown {
  if (tr === null || tr === undefined) return pt;
  // Formato diferente do português (lista contra objeto, texto contra lista):
  // tradução estragada não pode partir a página, fica o original.
  if (Array.isArray(pt) !== Array.isArray(tr) || objeto(pt) !== objeto(tr)) return pt;
  if (Array.isArray(pt) && Array.isArray(tr)) {
    if (pt.some(objeto)) return pt.map((item, i) => (i < tr.length ? fundir(item, tr[i]) : item));
    const linhas = tr.filter((l) => typeof l === "string" && l.trim() !== "");
    return linhas.length > 0 ? linhas : pt;
  }
  if (objeto(pt) && objeto(tr)) {
    const junto: Record<string, unknown> = { ...pt };
    for (const k of Object.keys(tr)) junto[k] = k in pt ? fundir(pt[k], tr[k]) : tr[k];
    return junto;
  }
  if (typeof tr === "string") return tr.trim() === "" ? pt : tr;
  return tr ?? pt;
}

export function emIdioma<T>(convite: T): T {
  if (idioma === "pt") return convite;
  const bloco = (convite as Record<string, unknown>)[idioma];
  return objeto(bloco) ? (fundir(convite, bloco) as T) : convite;
}
`;

/** Texto com valor no meio, escrito como template literal nos componentes. */
const MOLDES = Object.keys(chavesDoDicionario()).filter((k) => k.includes("{}"));

function chavesDoDicionario(): Record<string, true> {
  const chaves: Record<string, true> = {};
  for (const m of IDIOMA_TS.matchAll(/^ {2}(?:"((?:[^"\\]|\\.)*)"|([A-Za-zÀ-ú]+)):/gm)) {
    chaves[m[1] ?? m[2]] = true;
  }
  return chaves;
}

const CHAVES = Object.keys(chavesDoDicionario()).filter((k) => !k.includes("{}"));

const escapar = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Embrulha no `t()` o texto cravado que o dicionário conhece. Só casa a frase
 * inteira, nunca um pedaço: `"min"` dentro de uma classe ou um nome de chave
 * não se parece com nenhuma entrada. Palavras soltas e curtas (dias, horas, os
 * meses) só no `label=` e no array dos meses, onde não há como confundir.
 */
export function embrulhar(codigo: string): string {
  // Linha a linha, e nunca dentro de comentário: a explicação do componente
  // fala das frases ("Somente eu") e não é para o convidado ler.
  const comentario = /^\s*(\*|\/\/|\/\*)/;
  let novo = codigo
    .split("\n")
    .map((linha) => (comentario.test(linha) ? linha : trocarFrases(linha)))
    .join("\n");
  if (novo === codigo) return novo;
  // Contador com `const t = { d, h, m, s }`: o `t()` importado ficava tapado e a
  // página partia. Aí a tradução entra com outro nome.
  const semImports = codigo.replace(/^import [\s\S]*?;\r?\n/gm, "");
  const tapado = /\b(?:const|let|var)\s+t\s*=|(?<![\w.])t\.[a-zA-Z]/.test(semImports);
  if (tapado) novo = novo.replace(/(?<![\w.])t\("/g, 'tr("');
  // Só o que o ficheiro usa: um import a sobrar acende o lint do build.
  const usados = (tapado ? ["tr", "tf"] : ["t", "tf"])
    .filter((n) => new RegExp(`\\b${n}\\("`).test(novo))
    .map((n) => (n === "tr" ? "t as tr" : n));
  const imp = /^import \{ ([^}]*) \} from "@\/lib\/idioma";$/m.exec(novo);
  if (!imp) return importar(novo, `import { ${usados.join(", ")} } from "@/lib/idioma";`);
  const juntos = [...new Set([...imp[1].split(",").map((s) => s.trim()), ...usados])].sort();
  return novo.replace(imp[0], `import { ${juntos.join(", ")} } from "@/lib/idioma";`);
}

function trocarFrases(linha: string): string {
  // O que vai para o Google Form tem de ser a opção do formulário, em português,
  // seja qual for a língua de quem responde. Aspas simples ficam fora do t().
  let novo = /^[ \t]*const \w*Opcao = /.test(linha) ? linha.replace(/"/g, "'") : linha;
  for (const pt of CHAVES) {
    const lit = escapar(pt);
    const curta = /^[A-Za-zÀ-ú]+$/.test(pt) && pt.length < 12;
    if (curta) {
      novo = novo.replace(new RegExp(`(\\b(?:label|l)=)"${lit}"`, "g"), `$1{t("${pt}")}`);
      novo = novo.replace(new RegExp(`(\\blabel:\\s*)"${lit}"`, "g"), `$1t("${pt}")`);
      continue;
    }
    // Atributo JSX: placeholder="Seu nome" → placeholder={t("Seu nome")}
    novo = novo.replace(new RegExp(`(\\s[a-zA-Z-]+=)"${lit}"`, "g"), `$1{t("${pt}")}`);
    // Literal em expressão, que ainda não esteja dentro de um t(
    novo = novo.replace(new RegExp(`(?<!\\bt\\()(?<!\\btr\\()(?<![=\\w])"${lit}"`, "g"), `t("${pt}")`);
    // Texto JSX entre tags na mesma linha: >Hoje é o grande dia!<
    novo = novo.replace(new RegExp(`>(\\s*)${lit}(\\s*)<`, "g"), `>$1{t("${pt}")}$2<`);
    // Texto JSX sozinho numa linha
    novo = novo.replace(new RegExp(`^(\\s+)${lit}(\\s*)$`, "gm"), `$1{t("${pt}")}$2`);
  }
  for (const molde of MOLDES) {
    // Molde que começa ou acaba em espaço é pedaço de JSX, tratado à parte.
    if (molde !== molde.trim()) continue;
    const partes = molde.split("{}").map(escapar);
    novo = novo.replace(
      new RegExp("`" + partes.join("\\$\\{([^}`]+)\\}") + "`", "g"),
      (_m, ...grupos: unknown[]) => {
        const exprs = grupos.slice(0, partes.length - 1).map((g) => String(g).trim());
        return `tf("${molde}", ${exprs.join(", ")})`;
      },
    );
  }
  // A data no cronograma: `<span>{dia}</span> de {mes} de <span>{ano}</span>`.
  novo = novo.replace(/<\/span> de \{mes\} de <span/g, '</span>{tf(" de {} de ", mes)}<span');
  // O prazo do RSVP do noivado: "Por favor, confirmar até o dia <span>01</span> de Novembro de <span>2026</span>".
  novo = novo.replace(/^(\s+)Por favor, confirmar até o dia /gm, '$1{t("Por favor, confirmar até o dia")}{" "}');
  novo = novo.replace(
    /<\/span> de (Janeiro|Fevereiro|Março|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro) de <span/g,
    '</span>{tf(" de {} de ", t("$1"))}<span',
  );
  // O fecho do manual do noivado, partido por um <br />.
  novo = novo.replace(
    /^(\s+)AGRADECEMOS A COMPREENSÃO<br \/>E O VOSSO CARINHO!(\s*)$/,
    '$1{t("AGRADECEMOS A COMPREENSÃO")}<br />{t("E O VOSSO CARINHO!")}$2',
  );
  // "← Voltar" do manual aberto por cima do convite.
  novo = novo.replace(/(<\/span>\s*)Voltar(\s*)$/, '$1{t("Voltar")}$2');
  // O selo do mural parado, sozinho numa linha.
  novo = novo.replace(/^(\s+)pausado(\s*)$/gm, '$1{t("pausado")}$2');
  return novo;
}

/** Depois do último import do ficheiro, que é onde o resto do convite os põe. */
function importar(codigo: string, linha: string): string {
  const imports = [...codigo.matchAll(/^import [\s\S]*?;\r?\n/gm)];
  const ultimo = imports.at(-1);
  if (!ultimo) return codigo;
  const fim = (ultimo.index ?? 0) + ultimo[0].length;
  return codigo.slice(0, fim) + linha + "\n" + codigo.slice(fim);
}

/**
 * `convite.ts`: o JSON importado passa pelo `emIdioma` antes de tudo o resto, e
 * o mês sai do dicionário. O `import convite` muda de nome em vez de ganhar uma
 * linha depois, para nenhuma constante do ficheiro ler o português por engano.
 */
export function conviteEmIdioma(codigo: string): string {
  if (codigo.includes("emIdioma(")) return codigo;
  const imp = /^import convite from "(\.\.\/\.\.\/convite\.json)";\r?\n/m;
  if (!imp.test(codigo)) return codigo;
  return codigo
    .replace(
      imp,
      'import bruto from "$1";\nimport { emIdioma, t } from "./idioma";\n\nconst convite = emIdioma(bruto);\n',
    )
    .replace(/export const mes = MESES\[([^\]]+)\];/, "export const mes = t(MESES[$1]);");
}

/**
 * `guest.tsx`: a entrada do convidado pode vir como `{ name, lang }`, e o idioma
 * do link tem de bater com o da lista. Quem recebeu o link antes de entrar na
 * lista de fora (ou saiu dela) cai no idioma certo sem precisar de link novo.
 */
export function guestComIdioma(codigo: string): string {
  if (codigo.includes("linguaDoConvidado")) return codigo;
  const acerto = (esp: string): string =>
    [
      `${esp}const linguaDoConvidado = (entrada as { lang?: string } | null)?.lang;`,
      `${esp}const lingua = linguaDoConvidado === "en" || linguaDoConvidado === "fr" ? linguaDoConvidado : null;`,
      `${esp}if (name && lingua !== params.get("l")) {`,
      `${esp}  const certo = new URL(window.location.href);`,
      `${esp}  if (lingua) certo.searchParams.set("l", lingua);`,
      `${esp}  else certo.searchParams.delete("l");`,
      `${esp}  window.location.replace(certo.toString());`,
      `${esp}  return;`,
      `${esp}}`,
    ].join("\n");
  // Convite que já recebeu a versão só-inglês (6.6): troca o bloco por inteiro.
  const antigo = /^([ \t]*)const emIngles = [^\n]*\n(?:[^\n]*\n){6}\1\}/m;
  if (antigo.test(codigo)) return codigo.replace(antigo, (_m, esp: string) => acerto(esp));
  return codigo.replace(
    /^([ \t]*)const name = data\.guests\?\.\[token\];/m,
    (_m, esp: string) =>
      [
        `${esp}const entrada = data.guests?.[token] as unknown;`,
        `${esp}const name =`,
        `${esp}  typeof entrada === "string"`,
        `${esp}    ? entrada`,
        `${esp}    : ((entrada as { name?: string } | null)?.name ?? null);`,
        acerto(esp),
      ].join("\n"),
  );
}

/**
 * O envelope só ganha o vídeo no browser. O HTML exportado é sempre o português,
 * e com o \`src\` já lá o convidado de fora baixava — e chegava a ver — o envelope
 * PT antes de o React pôr o da língua dele. Sem \`src\` no HTML, o primeiro vídeo
 * que o browser pede já é o certo. Convite com o vídeo cravado (sem ler o
 * convite.json) não tem língua para escolher e fica como está.
 */
export function envelopeNaLingua(codigo: string): string {
  if (codigo.includes("setIntroVideo")) return codigo;
  const linha = /^[ \t]*const introVideo = (.*convite\.envelope\.video.*);\r?\n/m.exec(codigo);
  const ref = /^([ \t]*)const videoRef = useRef<HTMLVideoElement>\(null\);\r?\n/m.exec(codigo);
  if (!linha || !ref) return codigo;
  const esp = ref[1];
  let novo = codigo.replace(linha[0], "");
  novo = novo.replace(
    ref[0],
    `${ref[0]}${esp}// Sem src no HTML exportado: o vídeo pedido já é o da língua do convidado.\n` +
      `${esp}const [introVideo, setIntroVideo] = useState<string | undefined>(undefined);\n` +
      `${esp}useEffect(() => setIntroVideo(${linha[1]}), []);\n`,
  );
  const guarda = novo.indexOf("if (!video) return;");
  if (guarda < 0) return codigo;
  novo = novo.slice(0, guarda) + "if (!video || !introVideo) return;" + novo.slice(guarda + "if (!video) return;".length);
  const fim = novo.indexOf("\n  }, []);", guarda);
  if (fim < 0) return codigo;
  return novo.slice(0, fim) + "\n  }, [introVideo]);" + novo.slice(fim + "\n  }, []);".length);
}

/**
 * Componente de servidor (o Footer) é desenhado uma vez no build, em português,
 * e o browser nunca o volta a correr: o `t()` lá dentro não servia de nada. Com
 * `"use client"` ele corre também no browser e sai na língua do convidado.
 */
export function noCliente(codigo: string): string {
  if (/^\s*["']use client["']/.test(codigo)) return codigo;
  if (!/\bt\("|\btf\("/.test(codigo)) return codigo;
  return `"use client";\n\n${codigo}`;
}

/**
 * O <title> do HTML exportado é o português (vem do `metadata` do layout). Na
 * língua do convidado troca no browser, assim que o convite é lido.
 */
export function tituloNaLingua(codigo: string): string {
  if (codigo.includes("tituloDaLingua")) return codigo;
  if (!codigo.includes("emIdioma(")) return codigo;
  // O Next volta a pôr o título do metadata sempre que redesenha o <head>; o
  // observador devolve o da língua de cada vez. Em português `emIdioma` devolve
  // o próprio JSON e nada disto corre.
  const bloco = [
    'if (typeof window !== "undefined" && convite !== bruto && convite.meta?.titulo) {',
    "  const tituloDaLingua = (): void => {",
    "    if (document.title !== convite.meta.titulo) document.title = convite.meta.titulo;",
    "  };",
    "  tituloDaLingua();",
    "  new MutationObserver(tituloDaLingua).observe(document.head, { subtree: true, childList: true, characterData: true });",
    "}",
    "",
  ].join("\n");
  // Versões de teste anteriores, só na máquina do Heatz.
  const antigo = /^if \(typeof (?:document|window) !== "undefined" && convite\.meta\?\.titulo\)[\s\S]*?\n(?:\}\n|(?=\n))/m;
  if (antigo.test(codigo)) return codigo.replace(antigo, bloco);
  return codigo.replace(/^(const convite = emIdioma\(bruto\);\r?\n)/m, `$1${bloco}`);
}

/**
 * A data montada no `convite.ts` do modelo de noivado: "20 de Novembro de
 * 2026", o dia da semana e "às 20h00".
 */
export function dataNaLingua(codigo: string): string {
  const imp = /^import \{ emIdioma, t(?:, tf)? \} from "\.\/idioma";$/m;
  if (!imp.test(codigo)) return codigo;
  const novo = codigo
    .replace(/`\$\{([^}`]+)\} de \$\{mes\} de \$\{ano\}`/, (_m, dia: string) => `tf("{} de {} de {}", ${dia.trim()}, mes, ano)`)
    .replace(/= SEMANA\[([^\]]+)\];/, "= t(SEMANA[$1]);")
    .replace(/`às \$\{([^}`]+)\}h\$\{([^}`]+)\}`/, (_m, h: string, m: string) => `tf("às {}h{}", ${h.trim()}, ${m.trim()})`);
  if (novo === codigo) return codigo;
  return novo.replace(imp, 'import { emIdioma, t, tf } from "./idioma";');
}

/** Ficheiros com texto cravado que o dicionário cobre. */
const COM_TEXTO = [
  "Hero.tsx",
  "Evento.tsx",
  "Countdown.tsx",
  "Mensagens.tsx",
  "MuteButton.tsx",
  "Footer.tsx",
  "Presentes.tsx",
  "RSVP.tsx",
  "NossoDia.tsx",
  "Versiculo.tsx",
  // Modelo de noivado
  "RSVPModal.tsx",
  "ManualBlocos.tsx",
  "ManualModal.tsx",
];

/** Idempotente: só escreve o que mudou e devolve o nome do que mexeu. */
export async function idiomaNoConvite(dir: string): Promise<string[]> {
  const lib = join(dir, "src", "lib");
  const conviteTs = join(lib, "convite.ts");
  // Sem o convite.ts que lê o JSON não há onde ligar a troca — convite de outra base.
  if (!existsSync(conviteTs)) return [];
  const feitos: string[] = [];

  const idiomaTs = join(lib, "idioma.ts");
  const atual = existsSync(idiomaTs) ? await readFile(idiomaTs, "utf8") : null;
  if (atual !== IDIOMA_TS) {
    await writeFile(idiomaTs, IDIOMA_TS, "utf8");
    feitos.push("idioma.ts");
  }

  const alvos: [string, (c: string) => string][] = [
    [conviteTs, (c) => dataNaLingua(tituloNaLingua(conviteEmIdioma(c)))],
    [join(lib, "guest.tsx"), guestComIdioma],
    [join(dir, "src", "components", "EnvelopeLoader.tsx"), envelopeNaLingua],
    ...COM_TEXTO.map((f): [string, (c: string) => string] => [
      join(dir, "src", "components", f),
      (c) => noCliente(embrulhar(c)),
    ]),
  ];
  for (const [alvo, consertar] of alvos) {
    if (!existsSync(alvo)) continue;
    const codigo = await readFile(alvo, "utf8");
    const novo = consertar(codigo);
    if (novo === codigo) continue;
    await writeFile(alvo, novo, "utf8");
    feitos.push(alvo.split("/").pop() ?? alvo);
  }
  return feitos;
}
