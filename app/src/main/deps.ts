import { existsSync, readdirSync, realpathSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { requireSitesRoot } from "./paths";

/**
 * Um `node_modules` só, na raiz de sites, servindo todos os convites: o Node
 * sobe as pastas até achar, então um convite recém-criado já abre no preview
 * sem ninguém instalar nada dentro dele.
 *
 * O manifesto vive aqui, não num ficheiro do repo, porque quem prepara a pasta
 * é o app — na máquina de quem só edita convites não existe repo nenhum.
 */
const MANIFESTO = {
  name: "criarte-sites-deps",
  version: "1.0.0",
  private: true,
  description:
    "Dependências partilhadas por todos os convites. Escrito pelo Criarte Studio; não edite à mão.",
  dependencies: {
    "@supabase/supabase-js": "^2.109.0",
    // A chuva de pétalas do RSVP. Entra na lista partilhada porque o molde que o
    // Studio planta importa-a: sem ela o convite deixa de compilar.
    "canvas-confetti": "^1.9.4",
    "framer-motion": "^11.1.7",
    "lucide-react": "^0.378.0",
    next: "14.2.3",
    react: "^18.3.1",
    "react-dom": "^18.3.1",
  },
  devDependencies: {
    "@types/canvas-confetti": "^1.9.0",
    "@types/node": "20.19.41",
    "@types/react": "18.3.29",
    "@types/react-dom": "^18.3.0",
    autoprefixer: "^10.4.19",
    postcss: "^8.4.38",
    tailwindcss: "^3.4.3",
    typescript: "5.9.3",
  },
};

export type EstadoDeps = {
  raiz: string | null;
  temManifesto: boolean;
  temNext: boolean;
  /** Caminho do `npm-cli.js`. Nulo quer dizer: não há Node nesta máquina. */
  npm: string | null;
};

/**
 * O PATH de um app aberto pelo Finder não é o do terminal — vem do launchd e
 * quase nunca tem o Node. Por isso os caminhos são procurados à mão.
 */
function candidatosUnix(): string[] {
  const fixos = ["/opt/homebrew/bin/npm", "/usr/local/bin/npm", "/usr/bin/npm"];
  const nvm = join(homedir(), ".nvm", "versions", "node");
  if (existsSync(nvm)) {
    try {
      // Mais recente primeiro: a versão velha do sistema costuma ser a quebrada.
      for (const v of readdirSync(nvm).sort().reverse()) fixos.push(join(nvm, v, "bin", "npm"));
    } catch {
      /* pasta ilegível conta como ausente */
    }
  }
  return fixos;
}

/**
 * No Windows o `npm` do PATH é um `.cmd`, não um symlink para o `npm-cli.js` que
 * precisamos — seguir o `.cmd` não leva a lado nenhum. O que serve é a pasta
 * onde o `node.exe` mora: ao lado dele fica sempre
 * `node_modules\npm\bin\npm-cli.js`, seja instalador oficial, nvm, fnm ou scoop.
 *
 * E aqui o PATH pode ser lido: ao contrário do launchd do macOS, o Explorer
 * passa ao app o PATH do sistema, que é onde o instalador do Node se escreve.
 */
function candidatosWindows(): string[] {
  const cli = (base: string): string => join(base, "node_modules", "npm", "bin", "npm-cli.js");
  const bases: string[] = [];
  for (const dir of (process.env.PATH ?? "").split(";")) {
    const limpo = dir.trim().replace(/"/g, "");
    if (limpo && existsSync(join(limpo, "node.exe"))) bases.push(limpo);
  }
  // Rede de segurança para o PATH que ainda não recarregou depois de instalar.
  for (const v of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]) {
    if (v) bases.push(join(v, "nodejs"));
  }
  // Quem correu `npm i -g npm` fica com uma cópia mais nova aqui.
  if (process.env.APPDATA) bases.push(join(process.env.APPDATA, "npm"));
  // nvm-windows: o symlink aponta à versão em uso; senão, a mais recente.
  if (process.env.NVM_SYMLINK) bases.push(process.env.NVM_SYMLINK);
  const nvm = process.env.NVM_HOME;
  if (nvm && existsSync(nvm)) {
    try {
      for (const v of readdirSync(nvm).sort().reverse()) bases.push(join(nvm, v));
    } catch {
      /* pasta ilegível conta como ausente */
    }
  }
  return bases.map(cli);
}

function candidatosNpm(): string[] {
  return process.platform === "win32" ? candidatosWindows() : candidatosUnix();
}

/**
 * Devolve o `npm-cli.js`, não o executável: assim o npm roda pelo Electron em
 * modo Node e não depende de haver `node` no PATH da GUI.
 */
export function acharNpm(): string | null {
  for (const caminho of candidatosNpm()) {
    if (!existsSync(caminho)) continue;
    try {
      const real = realpathSync(caminho);
      if (real.endsWith(".js") && existsSync(real)) return real;
    } catch {
      /* symlink partido conta como ausente */
    }
  }
  return null;
}

export async function estadoDeps(): Promise<EstadoDeps> {
  let raiz: string | null = null;
  try {
    raiz = requireSitesRoot();
  } catch {
    return { raiz: null, temManifesto: false, temNext: false, npm: acharNpm() };
  }
  return {
    raiz,
    temManifesto: existsSync(join(raiz, "package.json")),
    temNext: existsSync(join(raiz, "node_modules", "next", "dist", "bin", "next")),
    npm: acharNpm(),
  };
}

/**
 * Escreve o manifesto sem apagar o que já existir: se a raiz de sites for um
 * repo de verdade, o `package.json` de lá pode ter mais coisa que a nossa lista.
 */
export async function prepararRaiz(): Promise<string> {
  const raiz = requireSitesRoot();
  const arquivo = join(raiz, "package.json");
  let atual: Record<string, unknown> = {};
  if (existsSync(arquivo)) {
    try {
      atual = JSON.parse(await readFile(arquivo, "utf8")) as Record<string, unknown>;
    } catch {
      throw new Error("já existe um package.json ilegível na raiz de sites");
    }
  }
  const fundido = {
    ...MANIFESTO,
    ...atual,
    dependencies: { ...MANIFESTO.dependencies, ...(atual.dependencies as object) },
    devDependencies: { ...MANIFESTO.devDependencies, ...(atual.devDependencies as object) },
  };
  await writeFile(arquivo, `${JSON.stringify(fundido, null, 2)}\n`, "utf8");
  return arquivo;
}
