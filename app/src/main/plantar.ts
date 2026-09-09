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
  /** Pacotes que o molde importa. Plantar sem eles deixa o convite sem compilar. */
  exigeDeps: string[];
};

const PLANTAS: Record<string, Planta> = {
  rsvp: {
    ficheiro: "src/components/RSVP.tsx",
    componente: "RSVP",
    depoisDe: ['ligada("manual")', 'ligada("presentes")', 'ligada("cronograma")'],
    exigeToken: "destaque",
    exigeDeps: ["canvas-confetti"],
  },
};

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

export type Plantio = {
  /** Ficheiros criados agora. Vazio quando já lá estavam. */
  ficheiros: string[];
  /** A secção está ligada no `page.tsx`. */
  ligada: boolean;
  /** Porque é que não deu, se não deu. */
  impedimento: string | null;
};

const NADA: Plantio = { ficheiros: [], ligada: false, impedimento: null };

/**
 * Põe o componente da secção dentro do convite e liga-o na página. Só mexe no
 * `page.tsx` quando reconhece o sítio exato onde a linha entra — mexer às cegas
 * foi o que, na tokenização, partiu convites de base diferente. Recusar deixa o
 * convite como estava e devolve o motivo por escrito.
 */
export async function plantarSecao(siteId: string, secao: string): Promise<Plantio> {
  const planta = PLANTAS[secao];
  if (!planta) return NADA;

  const raiz = await siteDirExistente(siteId);
  const paginaPath = join(raiz, "src/app/page.tsx");
  if (!existsSync(paginaPath)) {
    return { ...NADA, impedimento: "não encontrei src/app/page.tsx neste convite" };
  }

  const pagina = await readFile(paginaPath, "utf8");
  if (pagina.includes(`<${planta.componente} />`)) {
    return { ficheiros: [], ligada: true, impedimento: null };
  }

  // O molde fala a linguagem dos convites com cor por papel. Num template antigo
  // as classes não existiriam e a secção nascia sem cor — melhor não nascer.
  const tw = join(raiz, "tailwind.config.ts");
  const temToken =
    existsSync(tw) && (await readFile(tw, "utf8")).includes(`${planta.exigeToken}:`);
  if (!temToken) {
    return {
      ...NADA,
      impedimento: `este convite não tem a cor "${planta.exigeToken}" no tailwind.config.ts — o ${planta.componente} tem de ser desenhado à mão aqui`,
    };
  }

  const falta = planta.exigeDeps.filter((d) => !temPacote(raiz, d));
  if (falta.length > 0) {
    return {
      ...NADA,
      impedimento: `falta ${falta.join(" e ")} nas dependências — abre a Config e prepara as dependências antes de criar esta secção`,
    };
  }

  const ancora = planta.depoisDe.find((a) => pagina.includes(a));
  if (!ancora) {
    return {
      ...NADA,
      impedimento: `não encontrei onde pendurar o ${planta.componente} no page.tsx — este convite tem de ser ligado à mão`,
    };
  }

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

  await writeFile(paginaPath, linhas.join("\n"), "utf8");
  return { ficheiros, ligada: true, impedimento: null };
}
