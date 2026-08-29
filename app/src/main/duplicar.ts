import { cp, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { containedPath, requireSitesRoot } from "./paths";
import { readConvite, siteDir } from "./sites";

const NOME = /^[a-z0-9][a-z0-9-]*$/;

/** Pesado, gerado ou específico da máquina — nada disso define o convite. */
const PULAR = new Set([
  "node_modules",
  ".next",
  "out",
  "dist",
  "build",
  ".turbo",
  ".vercel",
  ".git",
  ".originais",
  ".DS_Store",
  "tsconfig.tsbuildinfo",
]);

type Credenciais = { url: string; serviceKey: string };

/**
 * A chave secreta mora no mesmo config do CLI, fora do repo, e é lida só aqui no
 * main. Se ela chegasse ao renderer viraria `NEXT_PUBLIC_` na primeira distração.
 */
function credenciais(): Credenciais {
  const arquivo = join(homedir(), ".criarte-deploy", "config.json");
  if (!existsSync(arquivo)) throw new Error("~/.criarte-deploy/config.json não existe");
  const bruto = JSON.parse(readFileSync(arquivo, "utf8")) as {
    supabase?: { url?: unknown; serviceKey?: unknown };
  };
  const url = bruto.supabase?.url;
  const serviceKey = bruto.supabase?.serviceKey;
  if (typeof url !== "string" || typeof serviceKey !== "string") {
    throw new Error("falta o bloco supabase (url + serviceKey) no config do CLI");
  }
  return { url: url.replace(/\/+$/, ""), serviceKey };
}

function tituloDe(convite: unknown, slug: string): string {
  const noivos = (convite as { noivos?: { noiva?: unknown; noivo?: unknown } })?.noivos;
  const noiva = typeof noivos?.noiva === "string" ? noivos.noiva.trim() : "";
  const noivo = typeof noivos?.noivo === "string" ? noivos.noivo.trim() : "";
  if (noiva && noivo) return `${noiva} & ${noivo}`;
  return slug.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

/** Registra o site e devolve o uuid que o banco gerou — é ele o NEXT_PUBLIC_SITE_ID. */
async function registrar(slug: string, titulo: string): Promise<string> {
  const { url, serviceKey } = credenciais();
  const r = await fetch(`${url}/rest/v1/cr_sites`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ slug, titulo }),
  });
  const corpo = await r.text();
  if (r.status === 409) throw new Error(`o slug "${slug}" já está registrado no Supabase`);
  if (!r.ok) throw new Error(`Supabase recusou (${r.status}): ${corpo.slice(0, 160)}`);
  const linha = (JSON.parse(corpo) as { id?: unknown }[])[0];
  if (!linha || typeof linha.id !== "string") throw new Error("Supabase não devolveu o id");
  return linha.id;
}

async function trocarSiteId(destino: string, siteId: string): Promise<boolean> {
  const arquivo = join(destino, ".env.local");
  if (!existsSync(arquivo)) return false;
  const antes = await readFile(arquivo, "utf8");
  const linha = `NEXT_PUBLIC_SITE_ID=${siteId}`;
  const depois = /^NEXT_PUBLIC_SITE_ID=.*$/m.test(antes)
    ? antes.replace(/^NEXT_PUBLIC_SITE_ID=.*$/m, linha)
    : `${antes.replace(/\n*$/, "\n")}${linha}\n`;
  await writeFile(arquivo, depois, "utf8");
  return true;
}

export type Copia = { id: string; siteId: string; envTrocado: boolean };

/**
 * Ordem proposital: registra no Supabase **antes** de copiar. Se a cópia falhar
 * sobra uma linha órfã no banco, que não faz mal a ninguém; na ordem inversa
 * sobraria uma pasta carregando o uuid do casal anterior, e o mural de recados
 * do convite novo escreveria em cima do antigo.
 */
export async function duplicarSite(origemId: string, categoria: string, slug: string): Promise<Copia> {
  if (!NOME.test(categoria)) throw new Error("categoria inválida — minúsculas e hífen");
  if (!NOME.test(slug)) throw new Error("nome inválido — minúsculas e hífen");

  const origem = await siteDir(origemId);
  const destino = await containedPath(requireSitesRoot(), categoria, slug);
  if (existsSync(destino)) throw new Error(`${categoria}/${slug} já existe`);

  const titulo = tituloDe(await readConvite(origemId), slug);
  const siteId = await registrar(slug, titulo);

  await cp(origem, destino, {
    recursive: true,
    // Listas de convidados são nome real + link intransferível do casal antigo.
    // Elas vivem na raiz do site; `.txt` dentro de public/ é outra história.
    filter: (src) =>
      !PULAR.has(basename(src)) && !(dirname(src) === origem && extname(src) === ".txt"),
  });

  return { id: `${categoria}/${slug}`, siteId, envTrocado: await trocarSiteId(destino, siteId) };
}
