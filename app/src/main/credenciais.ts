// ============================================================================
// CREDENCIAIS — mover o ~/.criarte-deploy/config.json de uma máquina pra outra
// ============================================================================
// Até aqui só o `criarte-deploy login` no terminal criava este ficheiro. Quem
// entra na equipa a partir do Studio nunca tem terminal aberto, e sem o ficheiro
// não regista o convite no mural nem publica. Um formulário com as doze chaves
// era pedir pra alguém ditar segredos por WhatsApp e errar um caractere; passar
// o ficheiro inteiro é uma escolha só, e não há como escrever mal.
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const PASTA = (): string => join(homedir(), ".criarte-deploy");
const FICHEIRO = (): string => join(PASTA(), "config.json");

/** Chaves que valem publicação e mural. O resto do ficheiro viaja na mesma. */
const PUBLICAR = ["panel_url", "admin_api_token"] as const;
const MURAL = ["supabase"] as const;

export type EstadoCredenciais = {
  temFicheiro: boolean;
  podePublicar: boolean;
  podeRegistar: boolean;
  nome: string | null;
};

function expandir(caminho: string): string {
  return caminho.startsWith("~") ? join(homedir(), caminho.slice(1)) : caminho;
}

function lido(bruto: string): Record<string, unknown> {
  const doc: unknown = JSON.parse(bruto);
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("o ficheiro de credenciais tem de ser um objeto JSON");
  }
  return doc as Record<string, unknown>;
}

function preenchida(v: unknown): boolean {
  return typeof v === "string" ? v.length > 0 : v !== null && typeof v === "object";
}

function resumir(doc: Record<string, unknown>): EstadoCredenciais {
  const supabase = doc["supabase"];
  return {
    temFicheiro: true,
    podePublicar: PUBLICAR.every((k) => preenchida(doc[k])),
    podeRegistar:
      MURAL.every((k) => preenchida(doc[k])) &&
      typeof supabase === "object" &&
      supabase !== null &&
      preenchida((supabase as Record<string, unknown>)["url"]) &&
      preenchida((supabase as Record<string, unknown>)["serviceKey"]),
    nome: typeof doc["name"] === "string" ? doc["name"] : null,
  };
}

export async function estadoCredenciais(): Promise<EstadoCredenciais> {
  if (!existsSync(FICHEIRO())) {
    return { temFicheiro: false, podePublicar: false, podeRegistar: false, nome: null };
  }
  return resumir(lido(await readFile(FICHEIRO(), "utf8")));
}

/** Devolve o JSON tal e qual, pro renderer o gravar onde o utilizador escolher. */
export async function exportarCredenciais(): Promise<string> {
  if (!existsSync(FICHEIRO())) throw new Error("esta máquina ainda não tem credenciais");
  const doc = lido(await readFile(FICHEIRO(), "utf8"));
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/**
 * Importa e devolve o que a máquina passa a poder fazer. O bloco `rsync` cai
 * fora quando a chave SSH que ele aponta não existe aqui: mantê-lo faria o CLI
 * preferir o rsync e morrer no "Permission denied" em vez de seguir pelo envio
 * por HTTP, que funciona sem chave nenhuma.
 */
export async function importarCredenciais(origem: string): Promise<EstadoCredenciais> {
  const doc = lido(await readFile(origem, "utf8"));

  const rsync = doc["rsync"];
  if (typeof rsync === "object" && rsync !== null) {
    const identity = (rsync as Record<string, unknown>)["identity"];
    // O til vem literal no config e é o `sshIdentity` do cli.mjs que o expande —
    // testar o caminho cru dava sempre "não existe" e deitava fora o rsync até
    // na máquina de quem tem a chave.
    if (typeof identity === "string" && !existsSync(expandir(identity))) delete doc["rsync"];
  }

  await mkdir(PASTA(), { recursive: true, mode: 0o700 });
  const destino = FICHEIRO();
  await writeFile(destino, `${JSON.stringify(doc, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  // O mode do writeFile só vale ao criar; se o ficheiro já existia com outra
  // permissão, ele fica como estava e os segredos ficam legíveis por todos.
  await chmod(destino, 0o600);
  await chmod(dirname(destino), 0o700);

  return resumir(doc);
}
