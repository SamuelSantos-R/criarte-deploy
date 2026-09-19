import { existsSync } from "node:fs";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { app } from "electron";

// ============================================================================
// REPAROS — correções que os convites já criados precisam receber. Cada site
// tem a sua cópia dos componentes, então um fix feito nos sites do repo não
// chega ao convite que só existe na máquina de outra pessoa. O Studio aplica
// ao abrir o preview; tudo é idempotente e só mexe no que reconhece.
// ============================================================================

function molde(nome: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, "icones", nome)
    : resolve(app.getAppPath(), "resources", "icones", nome);
}

/**
 * Ícone de duas cores (tinta + miolo claro pintado) não segue o tema: a máscara
 * do IconeTinta pinta o miolo junto. O molde é o mesmo desenho com o miolo como
 * buraco de verdade, num path só.
 */
const ICONES = ["danca-dos-noivos.svg", "registe-esse-momento.svg"];

function duasCores(svg: string): boolean {
  const cores = new Set((svg.match(/fill:\s*#[0-9a-f]{3,6}/gi) ?? []).map((c) => c.toLowerCase()));
  return cores.size >= 2;
}

/** A exceção que mandava estes dois ícones pro <Image> cru, com as cores da arte. */
const EXCECOES: { arquivo: string; icone: string }[] = [
  { arquivo: "NossoDia.tsx", icone: "danca-dos-noivos" },
  { arquivo: "Manual.tsx", icone: "registe-esse-momento" },
];

function tirarExcecao(codigo: string, icone: string): string {
  const padrao = new RegExp(
    `\\{item\\.icone\\.includes\\("${icone}"\\)\\s*\\?\\s*\\(\\s*<Image\\b[^>]*/>\\s*\\)\\s*:\\s*\\(\\s*(<IconeTinta\\b[^>]*/>)\\s*\\)\\s*\\}`,
    "g",
  );
  const novo = codigo.replace(padrao, "$1");
  // Sem outro <Image> no ficheiro, o import ficava a sobrar.
  return novo !== codigo && !/<Image\b/.test(novo) ? novo.replace(/import Image from "next\/image";\r?\n/, "") : novo;
}

/**
 * Nossa História: título em `whitespace-nowrap` numa coluna `1fr` alargava a
 * coluna quando não cabia (iPhone 13/14, "Duas famílias, uma só história") e
 * atirava o coração e o texto para cima da linha. `minmax(0,1fr)` segura as
 * metades iguais e o título passa a quebrar em linhas equilibradas.
 */
function consertarHistoria(codigo: string): string {
  return codigo
    .replaceAll("grid grid-cols-[1fr_22px_1fr]", "grid grid-cols-[minmax(0,1fr)_22px_minmax(0,1fr)]")
    .replaceAll("leading-[1.3] mb-1 whitespace-nowrap", "leading-[1.3] mb-1 [text-wrap:balance]");
}

/** Eventos: o texto do botão do mapa vem do convite.json (vazio = o de sempre). */
function botaoDoEvento(codigo: string): string {
  return codigo.replace(
    /(<\/svg>\s*\n\s*)Acessar Localização(\s*\n)/,
    '$1{(event as { botao?: string }).botao?.trim() || "Acessar Localização"}$2',
  );
}

/** O contorno do título da galeria era a cor principal: agora é a do próprio texto. */
function contornoDaGaleria(codigo: string): string {
  return codigo.replaceAll('WebkitTextStroke: "0.2px rgb(var(--c-principal))"', 'WebkitTextStroke: "0.2px currentColor"');
}

/**
 * O traço na Noah herdava o peso do texto (500) e o browser engrossava a fonte,
 * que só tem regular. Fixar 400 é o que a faz sair como ela é.
 */
function tracoRegular(codigo: string): string {
  return codigo.replace(
    /(fontFamily: ["']var\(--font-noah\), Georgia, serif["'], fontStyle: "normal")(?!, fontWeight)/g,
    "$1, fontWeight: 400",
  );
}

/** Nossa História: hífen e números tratados como no resto do convite. */
function tracoDaHistoria(codigo: string): string {
  if (!codigo.includes("comNumeros(")) return codigo;
  return codigo
    .replaceAll('import { comNumeros } from "@/lib/numeros";', 'import { comNumerosETraco } from "@/lib/numeros";')
    .replaceAll("comNumeros(", "comNumerosETraco(");
}

/** A folga acima do monograma passa a aceitar valor negativo, pra ele subir. */
function folgaNegativa(codigo: string): string {
  return codigo.replaceAll(
    '"--t-monograma-topo": px(medidas.monogramaTopo, 0, 120, 0),',
    '"--t-monograma-topo": px(medidas.monogramaTopo, -80, 120, 0),',
  );
}

/** RSVP: a letra das opções ("Sim, estarei lá!", "Somente eu"…) ganha cor própria no tema. */
function letraDasOpcoes(codigo: string): string {
  if (codigo.includes("COR_OPCAO_TEXTO")) return codigo;
  const novo = codigo
    .replace(
      /\{val === "sim" \? "Sim, estarei lá!" : "Não poderei ir"\}/,
      '<span style={COR_OPCAO_TEXTO}>{val === "sim" ? "Sim, estarei lá!" : "Não poderei ir"}</span>',
    )
    .replace(
      /<span>(\s*\{ACOMPANHANTES_OPTIONS\.find)/,
      "<span style={COR_OPCAO_TEXTO}>$1",
    )
    .replace(/(\n\s*)\{opt\.label\}(\s*\n\s*<\/button>)/, "$1<span style={COR_OPCAO_TEXTO}>{opt.label}</span>$2");
  if (novo === codigo || !/\nfunction fireWeddingConfetti/.test(novo)) return codigo;
  // Sem a variável a cor herda o text-text de sempre.
  return novo.replace(
    /\nfunction fireWeddingConfetti/,
    '\nconst COR_OPCAO_TEXTO = { color: "rgb(var(--c-rsvp-opcao-texto))" };\n\nfunction fireWeddingConfetti',
  );
}

/** Os moldes completos dos dois ficheiros pequenos que os reparos abaixo exigem. */
const NUMEROS_TSX = "import { Fragment, type ReactNode } from \"react\";\n\n// A Cormorant Infant desenha os algarismos com o traco que o convite usa nas\n// datas; as palavras a volta ficam na fonte do bloco. Por isso a troca e por\n// pedaco de texto e nao por elemento inteiro.\nconst ALGARISMOS = /(\\d+)/g;\n\nexport function comNumeros(texto: string): ReactNode {\n  const partes = texto.split(ALGARISMOS);\n  if (partes.length === 1) return texto;\n  return partes.map((parte, i) =>\n    i % 2 === 1 ? (\n      <span key={i} className=\"font-infant\">\n        {parte}\n      </span>\n    ) : (\n      <Fragment key={i}>{parte}</Fragment>\n    ),\n  );\n}\n\n// O hifen da Infant e curto e alto demais e, entre dois algarismos, le-se como\n// sujidade. O da Noah e o mesmo tracinho que o corpo do convite ja usa.\nconst ALGARISMOS_E_HIFENES = /(\\d+|-)/g;\n\n/** Igual ao `comNumeros`, mas trata tambem o traco de `4:9-10` ou de uma frase. */\nexport function comNumerosETraco(texto: string): ReactNode {\n  const partes = texto.split(ALGARISMOS_E_HIFENES);\n  if (partes.length === 1) return texto;\n  return partes.map((parte, i) => {\n    if (i % 2 === 0) return <Fragment key={i}>{parte}</Fragment>;\n    return parte === \"-\" ? (\n      <span key={i} style={{ fontFamily: \"var(--font-noah), Georgia, serif\", fontStyle: \"normal\", fontWeight: 400 }}>\n        {parte}\n      </span>\n    ) : (\n      <span key={i} className=\"font-infant\">\n        {parte}\n      </span>\n    );\n  });\n}\n";

const ICONE_TINTA_TSX = "interface IconeTintaProps {\n  src: string;\n  alt: string;\n  width: number | string;\n  height: number | string;\n  token: string;\n  className?: string;\n  /** Encosta a arte num lado da caixa em vez de centrar. */\n  alinhar?: \"left\" | \"right\";\n}\n\n// A mascara recorta o desenho e a cor vem do token, entao o icone segue o tema.\n// O `filter:` de recolor que estava aqui antes nao segue: a receita\n// invert/sepia/hue-rotate e numerica e so vale pra uma cor de destino.\nexport default function IconeTinta({ src, alt, width, height, token, className, alinhar }: IconeTintaProps) {\n  const mascara = {\n    maskImage: `url(${src})`,\n    WebkitMaskImage: `url(${src})`,\n    maskRepeat: \"no-repeat\",\n    WebkitMaskRepeat: \"no-repeat\",\n    maskPosition: alinhar ? `${alinhar} center` : \"center\",\n    WebkitMaskPosition: alinhar ? `${alinhar} center` : \"center\",\n    maskSize: \"contain\",\n    WebkitMaskSize: \"contain\",\n  };\n\n  return (\n    <span\n      role=\"img\"\n      aria-label={alt}\n      className={className}\n      style={{\n        display: \"inline-block\",\n        width,\n        height,\n        backgroundColor: `rgb(var(--c-${token}))`,\n        ...mascara,\n      }}\n    />\n  );\n}\n";

/**
 * Cronograma: a arte encosta no lado da linha e a que tem lado (a dança) espelha
 * na coluna da direita. Convite feito antes disto tinha o ícone solto no meio.
 */
function alinharIconesDoCronograma(codigo: string): string {
  if (codigo.includes("ladoDoIcone(") || !/<IconeTinta\b/.test(codigo)) return codigo;
  if (!/schedule\.map\(\(item, index\)/.test(codigo) || !codigo.includes("const containerVariants")) return codigo;
  const auxiliar = [
    "// Arte com lado: foi desenhada pra coluna da esquerda, virada pra linha do",
    "// meio. Quando a ordem a joga pra direita, espelha — senao fica de costas.",
    'const DIRECIONAIS = ["danca-dos-noivos"];',
    "const ehDirecional = (icone: string) => DIRECIONAIS.some((nome) => icone.includes(nome));",
    "",
    "// A arte encosta no lado da linha, alinhada com a hora. O espelho vira a caixa",
    "// inteira, então o ícone espelhado encosta no lado oposto antes de virar.",
    "function ladoDoIcone(index: number, icone: string) {",
    "  const naDireita = index % 2 === 1;",
    "  const espelhar = naDireita && ehDirecional(icone);",
    '  const alinhar: "left" | "right" = naDireita !== espelhar ? "left" : "right";',
    '  return { alinhar, className: espelhar ? "-scale-x-100" : undefined };',
    "}",
    "",
    "",
  ].join("\n");
  // Versão intermédia só espelhava: sai a helper velha, entra a completa.
  const limpo = codigo.replace(/\/\/ Arte com lado[\s\S]*?\n\n(?=const containerVariants)/, "");
  return limpo
    .replace("const containerVariants", () => `${auxiliar}const containerVariants`)
    .replace(/<IconeTinta\b([^>]*?\bsrc=\{item\.icone\}[^>]*?)\s*\/>/g, (_t, attrs: string) => {
      const semLado = attrs.replace(/\s+(?:className|alinhar)=(?:"[^"]*"|\{[^}]*\})/g, "");
      return `<IconeTinta${semLado} {...ladoDoIcone(index, item.icone)} />`;
    });
}

/** Eventos: os algarismos do título vão pra Infant, como nas datas. */
function numerosDoEvento(codigo: string): string {
  if (codigo.includes("comNumerosETraco(event.local)")) return codigo;
  let novo = codigo.replace(/comNumeros\(event\.local\)/g, "comNumerosETraco(event.local)");
  if (novo === codigo) {
    novo = codigo.replace(/(<h3\b[^>]*>[\s\S]*?)\{event\.local\}([\s\S]*?<\/h3>)/, "$1{comNumerosETraco(event.local)}$2");
  }
  if (novo === codigo) return codigo;
  const importNumeros = /import \{([^}]*)\} from "@\/lib\/numeros";/;
  if (importNumeros.test(novo)) {
    return novo.replace(importNumeros, (t, nomes: string) =>
      /\bcomNumerosETraco\b/.test(nomes) ? t : 'import { comNumerosETraco } from "@/lib/numeros";',
    );
  }
  return novo.replace(/(import convite[^\n]*\n)/, '$1import { comNumerosETraco } from "@/lib/numeros";\n');
}

/** O "&" da capa ganha altura própria (`--y-e`); sem a chave no convite não sai do lugar. */
function alturaDoE(codigo: string): string {
  if (codigo.includes("--y-e") || !codigo.includes("--ls-e")) return codigo;
  return codigo.replace(
    /(\n(\s*)"--ls-e": entreLetras\(medidas\.eEspacamento\),)/,
    (_t, linha: string, recuo: string) => `${linha}\n${recuo}"--y-e": \`${"$"}{num(medidas.eDeslocamento, -1, 1, 0)}em\`,`,
  );
}

function alturaDoENaCapa(codigo: string): string {
  if (codigo.includes("--y-e") || !codigo.includes('paddingLeft: "var(--ls-e)",')) return codigo;
  return codigo.replace(
    'paddingLeft: "var(--ls-e)",',
    'paddingLeft: "var(--ls-e)",\n            position: "relative",\n            top: "var(--y-e, 0em)",',
  );
}

export async function repararConvite(dir: string): Promise<string[]> {
  const feitos: string[] = [];
  for (const nome of ICONES) {
    const alvo = join(dir, "public", "assets", nome);
    if (!existsSync(alvo) || !existsSync(molde(nome))) continue;
    if (!duasCores(await readFile(alvo, "utf8"))) continue;
    await copyFile(molde(nome), alvo);
    feitos.push(nome);
  }
  for (const { arquivo, icone } of EXCECOES) {
    const alvo = join(dir, "src", "components", arquivo);
    if (!existsSync(alvo)) continue;
    const codigo = await readFile(alvo, "utf8");
    const novo = tirarExcecao(codigo, icone);
    if (novo === codigo) continue;
    await writeFile(alvo, novo, "utf8");
    feitos.push(arquivo);
  }
  for (const [arquivo, moldeCompleto, precisa] of [
    ["components/IconeTinta.tsx", ICONE_TINTA_TSX, "alinhar"],
    ["lib/numeros.tsx", NUMEROS_TSX, "comNumerosETraco"],
  ] as const) {
    const alvo = join(dir, "src", arquivo);
    if (!existsSync(alvo) || (await readFile(alvo, "utf8")).includes(precisa)) continue;
    await writeFile(alvo, moldeCompleto, "utf8");
    feitos.push(arquivo.split("/").pop() ?? arquivo);
  }
  for (const [arquivo, consertar] of [
    ["components/Historia.tsx", (c: string) => tracoRegular(tracoDaHistoria(consertarHistoria(c)))],
    ["components/Evento.tsx", (c: string) => tracoRegular(numerosDoEvento(botaoDoEvento(c)))],
    ["components/Carrousel.tsx", contornoDaGaleria],
    ["lib/vars.ts", (c: string) => alturaDoE(folgaNegativa(c))],
    ["components/Hero.tsx", alturaDoENaCapa],
    ["components/NossoDia.tsx", (c: string) => tracoRegular(alinharIconesDoCronograma(c))],
    ["components/Manual.tsx", tracoRegular],
    ["lib/numeros.tsx", tracoRegular],
    ["components/RSVP.tsx", letraDasOpcoes],
  ] as const) {
    const alvo = join(dir, "src", arquivo);
    if (!existsSync(alvo)) continue;
    const codigo = await readFile(alvo, "utf8");
    const novo = consertar(codigo);
    if (novo === codigo) continue;
    await writeFile(alvo, novo, "utf8");
    feitos.push(arquivo.split("/").pop() ?? arquivo);
  }
  return feitos;
}
