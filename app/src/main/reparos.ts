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
  for (const [arquivo, consertar] of [
    ["components/Historia.tsx", (c: string) => tracoRegular(tracoDaHistoria(consertarHistoria(c)))],
    ["components/Evento.tsx", (c: string) => tracoRegular(botaoDoEvento(c))],
    ["components/Carrousel.tsx", contornoDaGaleria],
    ["lib/vars.ts", folgaNegativa],
    ["components/NossoDia.tsx", tracoRegular],
    ["components/Manual.tsx", tracoRegular],
    ["lib/numeros.tsx", tracoRegular],
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
