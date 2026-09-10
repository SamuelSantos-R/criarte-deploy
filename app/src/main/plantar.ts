import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { app } from "electron";
import { siteDirExistente } from "./sites";

/** As peças viajam no app, como as da tokenização: plantar não pode depender de haver outro convite ao lado. */
function molde(secao: string, nome: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, "secoes", secao, nome)
    : resolve(app.getAppPath(), "resources", "secoes", secao, nome);
}

type Planta = {
  /** Onde o componente fica no convite, e o nome do molde que lhe corresponde. */
  ficheiro: string;
  componente: string;
  /** A linha do `page.tsx` a seguir à qual esta secção entra, por ordem de preferência. */
  depoisDe: string[];
  /** Token de cor que o molde usa. Sem ele o desenho sai sem cor nenhuma. */
  exigeToken: string;
  /**
   * Pacotes que o molde importa, com a versão que vai para o `package.json` do
   * convite. Não chega estarem instalados nesta máquina: o `node_modules` da raiz
   * de sites serve o preview daqui, mas quem compila o convite na VPS instala só
   * o `package.json` dele — e sem a linha lá, o deploy morre em "Module not found".
   */
  exigeDeps: Record<string, string>;
  /** O mesmo, para o `tsc` que corre antes do build. */
  exigeTipos: Record<string, string>;
};

const PLANTAS: Record<string, Planta> = {
  rsvp: {
    ficheiro: "src/components/RSVP.tsx",
    componente: "RSVP",
    depoisDe: ['ligada("manual")', 'ligada("presentes")', 'ligada("cronograma")'],
    exigeToken: "destaque",
    exigeDeps: { "canvas-confetti": "^1.9.4" },
    exigeTipos: { "@types/canvas-confetti": "^1.9.0" },
  },
};

/** O que falta na lista do próprio convite — a que viaja para a VPS. */
async function faltaNoPacote(raiz: string, planta: Planta): Promise<string[]> {
  const arquivo = join(raiz, "package.json");
  if (!existsSync(arquivo)) return [];
  let pkg: { dependencies?: object; devDependencies?: object };
  try {
    pkg = JSON.parse(await readFile(arquivo, "utf8")) as typeof pkg;
  } catch {
    return [];
  }
  const deps = { ...pkg.dependencies } as Record<string, string>;
  const dev = { ...pkg.devDependencies } as Record<string, string>;
  return [
    ...Object.keys(planta.exigeDeps).filter((d) => !(d in deps)),
    ...Object.keys(planta.exigeTipos).filter((d) => !(d in dev)),
  ];
}

/** Acrescenta as dependências do molde ao `package.json` do convite. */
async function escreverDeps(raiz: string, planta: Planta): Promise<void> {
  const arquivo = join(raiz, "package.json");
  if (!existsSync(arquivo)) return;
  const pkg = JSON.parse(await readFile(arquivo, "utf8")) as Record<string, unknown>;
  const ordenar = (o: Record<string, string>): Record<string, string> =>
    Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  pkg.dependencies = ordenar({
    ...planta.exigeDeps,
    ...((pkg.dependencies ?? {}) as Record<string, string>),
  });
  pkg.devDependencies = ordenar({
    ...planta.exigeTipos,
    ...((pkg.devDependencies ?? {}) as Record<string, string>),
  });
  await writeFile(arquivo, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}

/** O Node sobe as pastas até achar o `node_modules`; a procura tem de subir também. */
function temPacote(raiz: string, nome: string): boolean {
  let dir = raiz;
  for (;;) {
    if (existsSync(join(dir, "node_modules", nome))) return true;
    const acima = dirname(dir);
    if (acima === dir) return false;
    dir = acima;
  }
}

/**
 * O componente plantado num convite é uma cópia: melhorar o molde não chega a
 * quem já plantou. Comparar byte a byte diz quando a cópia ficou para trás — e
 * também quando alguém a mexeu à mão, que é o caso em que trocar é perder
 * trabalho. Por isso isto só acende um aviso; quem manda trocar é a pessoa.
 */
async function difereDoMolde(raiz: string, secao: string, planta: Planta): Promise<boolean> {
  const destino = join(raiz, planta.ficheiro);
  const fonte = molde(secao, `${planta.componente}.tsx`);
  if (!existsSync(destino) || !existsSync(fonte)) return false;
  const [a, b] = await Promise.all([readFile(destino, "utf8"), readFile(fonte, "utf8")]);
  return a !== b;
}

export type Plantio = {
  /** Ficheiros criados agora. Vazio quando já lá estavam. */
  ficheiros: string[];
  /** A secção está ligada no `page.tsx`. */
  ligada: boolean;
  /** Porque é que não deu, se não deu. */
  impedimento: string | null;
  /** Está na página, mas com um molde mais velho do que o que este Studio traz. */
  desatualizada: boolean;
};

const NADA: Plantio = { ficheiros: [], ligada: false, impedimento: null, desatualizada: false };

/** Já examinado: ou está resolvido, ou dá para plantar e diz-se onde. */
type Exame =
  | { pronto: Plantio }
  | { planta: Planta; raiz: string; paginaPath: string; pagina: string; ancora: string };

/**
 * Todas as recusas, sem escrever nada. Serve o plantio e serve o painel, que
 * precisa de saber se a secção está na página antes de oferecer o botão.
 */
async function examinar(siteId: string, secao: string): Promise<Exame> {
  const planta = PLANTAS[secao];
  if (!planta) return { pronto: NADA };

  const raiz = await siteDirExistente(siteId);
  const paginaPath = join(raiz, "src/app/page.tsx");
  if (!existsSync(paginaPath)) {
    return { pronto: { ...NADA, impedimento: "não encontrei src/app/page.tsx neste convite" } };
  }

  const pagina = await readFile(paginaPath, "utf8");
  if (pagina.includes(`<${planta.componente} />`)) {
    const [difere, semDeps] = await Promise.all([
      difereDoMolde(raiz, secao, planta),
      faltaNoPacote(raiz, planta),
    ]);
    return {
      pronto: { ...NADA, ligada: true, desatualizada: difere || semDeps.length > 0 },
    };
  }

  // O molde fala a linguagem dos convites com cor por papel. Num template antigo
  // as classes não existiriam e a secção nascia sem cor — melhor não nascer.
  const tw = join(raiz, "tailwind.config.ts");
  const temToken =
    existsSync(tw) && (await readFile(tw, "utf8")).includes(`${planta.exigeToken}:`);
  if (!temToken) {
    return {
      pronto: {
        ...NADA,
        impedimento: `este convite não tem a cor "${planta.exigeToken}" no tailwind.config.ts — o ${planta.componente} tem de ser desenhado à mão aqui`,
      },
    };
  }

  const falta = Object.keys(planta.exigeDeps).filter((d) => !temPacote(raiz, d));
  if (falta.length > 0) {
    return {
      pronto: {
        ...NADA,
        impedimento: `falta ${falta.join(" e ")} nas dependências — abre a Config e prepara as dependências antes de criar esta secção`,
      },
    };
  }

  const ancora = planta.depoisDe.find((a) => pagina.includes(a));
  if (!ancora) {
    return {
      pronto: {
        ...NADA,
        impedimento: `não encontrei onde pendurar o ${planta.componente} no page.tsx — este convite tem de ser ligado à mão`,
      },
    };
  }

  return { planta, raiz, paginaPath, pagina, ancora };
}

/**
 * O que se passa com esta secção neste convite, sem lhe tocar. `ligada` é estar
 * na página; sem impedimento e sem estar ligada quer dizer que dá para plantar.
 *
 * Existe porque durante muito tempo o plantio só corria ao criar a secção de
 * raiz: um convite que já tivesse a chave no `convite.json` — herdada de uma
 * cópia, ou semeada por um Studio anterior a haver plantio — ficava sem maneira
 * nenhuma de pôr o componente na página. O editor mostrava os campos todos e a
 * página continuava vazia, sem ninguém perceber porquê.
 */
export async function estadoPlantio(siteId: string, secao: string): Promise<Plantio> {
  const exame = await examinar(siteId, secao);
  return "pronto" in exame ? exame.pronto : NADA;
}

/**
 * Põe o componente da secção dentro do convite e liga-o na página. Só mexe no
 * `page.tsx` quando reconhece o sítio exato onde a linha entra — mexer às cegas
 * foi o que, na tokenização, partiu convites de base diferente. Recusar deixa o
 * convite como estava e devolve o motivo por escrito.
 */
export async function plantarSecao(siteId: string, secao: string): Promise<Plantio> {
  const exame = await examinar(siteId, secao);
  if ("pronto" in exame) return exame.pronto;
  const { planta, raiz, paginaPath, pagina, ancora } = exame;

  const ficheiros: string[] = [];
  const destino = join(raiz, planta.ficheiro);
  if (!existsSync(destino)) {
    await mkdir(join(destino, ".."), { recursive: true });
    await copyFile(molde(secao, `${planta.componente}.tsx`), destino);
    ficheiros.push(planta.ficheiro);
  }

  const linhas = pagina.split("\n");
  const iAncora = linhas.findIndex((l) => l.includes(ancora));
  const recuo = linhas[iAncora].match(/^\s*/)?.[0] ?? "";
  linhas.splice(
    iAncora + 1,
    0,
    `${recuo}{ligada("${secao}") && <${planta.componente} />}`,
  );

  // A seguir ao último import, para não cair antes de um "use client".
  const iUltimoImport = linhas.reduce((ultimo, l, i) => (l.startsWith("import ") ? i : ultimo), -1);
  linhas.splice(
    iUltimoImport + 1,
    0,
    `import ${planta.componente} from "@/components/${planta.componente}";`,
  );

  await escreverDeps(raiz, planta);
  await writeFile(paginaPath, linhas.join("\n"), "utf8");
  return { ...NADA, ficheiros, ligada: true };
}

/**
 * Troca o componente pelo molde deste Studio, mantendo a ligação na página. É a
 * saída para quem plantou a secção antes de o molde ganhar as cores por papel:
 * sem isto, a única maneira era apagar o ficheiro à mão.
 */
export async function atualizarSecao(siteId: string, secao: string): Promise<Plantio> {
  const planta = PLANTAS[secao];
  if (!planta) return NADA;
  const raiz = await siteDirExistente(siteId);
  const destino = join(raiz, planta.ficheiro);
  const fonte = molde(secao, `${planta.componente}.tsx`);
  if (!existsSync(destino) || !existsSync(fonte)) {
    return { ...NADA, impedimento: "não encontrei o componente desta secção neste convite" };
  }
  await copyFile(fonte, destino);
  await escreverDeps(raiz, planta);
  return { ...NADA, ficheiros: [planta.ficheiro], ligada: true };
}
