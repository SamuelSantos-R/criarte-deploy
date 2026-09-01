import { cp, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { baixarFonte } from "./coop";
import { copiavel, desempacotar } from "./pacote";
import { containedPath, requireSitesRoot } from "./paths";
import { readConvite, siteDir } from "./sites";

const NOME = /^[a-z0-9][a-z0-9-]*$/;

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

/** Sem uma destas o mural de recados não fala com o Supabase e falha calado. */
const CHAVES_MURAL = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];

/**
 * O uuid do mural é sempre escrito, mesmo que o `.env.local` não tenha vindo na
 * cópia — antes, ficheiro em falta era um `false` que ninguém lia e o convite
 * novo nascia a escrever no mural do casal anterior. As outras duas chaves não
 * dá para inventar (a anon key não está no config do CLI), então voltam como
 * aviso em vez de ficarem em silêncio.
 */
async function gravarSiteId(destino: string, siteId: string): Promise<string[]> {
  const arquivo = join(destino, ".env.local");
  const antes = existsSync(arquivo) ? await readFile(arquivo, "utf8") : "";
  const linha = `NEXT_PUBLIC_SITE_ID=${siteId}`;
  const depois = /^NEXT_PUBLIC_SITE_ID=.*$/m.test(antes)
    ? antes.replace(/^NEXT_PUBLIC_SITE_ID=.*$/m, linha)
    : `${antes ? antes.replace(/\n*$/, "\n") : ""}${linha}\n`;
  await writeFile(arquivo, depois, "utf8");
  return CHAVES_MURAL.filter((c) => !new RegExp(`^${c}=.+$`, "m").test(depois));
}

export type Copia = { id: string; siteId: string; faltam: string[] };

async function destinoLivre(categoria: string, slug: string): Promise<string> {
  if (!NOME.test(categoria)) throw new Error("categoria inválida — minúsculas e hífen");
  if (!NOME.test(slug)) throw new Error("nome inválido — minúsculas e hífen");
  const destino = await containedPath(requireSitesRoot(), categoria, slug);
  if (existsSync(destino)) throw new Error(`${categoria}/${slug} já existe`);
  return destino;
}

/**
 * Ordem proposital: registra no Supabase **antes** de escrever os ficheiros. Se
 * a cópia falhar sobra uma linha órfã no banco, que não faz mal a ninguém; na
 * ordem inversa sobraria uma pasta carregando o uuid do casal anterior, e o
 * mural de recados do convite novo escreveria em cima do antigo.
 */
export async function duplicarSite(origemId: string, categoria: string, slug: string): Promise<Copia> {
  const origem = await siteDir(origemId);
  const destino = await destinoLivre(categoria, slug);
  const { dados } = await readConvite(origemId);
  const siteId = await registrar(slug, tituloDe(dados, slug));

  await cp(origem, destino, { recursive: true, filter: (src) => copiavel(src, origem) });

  return { id: `${categoria}/${slug}`, siteId, faltam: await gravarSiteId(destino, siteId) };
}

/**
 * O convidado do co-op não tem a pasta do site — só o documento na tela. Aqui o
 * source vem do anfitrião pela rede e o `convite.json` gravado é o da sessão,
 * com as edições dos dois, não o que estava no disco de lá.
 */
export async function salvarSessaoComoNovo(
  categoria: string,
  slug: string,
  doc: unknown,
): Promise<Copia> {
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("convite.json tem que ser um objeto");
  }
  const destino = await destinoLivre(categoria, slug);
  const pacote = await baixarFonte();
  const siteId = await registrar(slug, tituloDe(doc, slug));

  await mkdir(destino, { recursive: true });
  await desempacotar(pacote, destino);
  await writeFile(join(destino, "convite.json"), `${JSON.stringify(doc, null, 2)}\n`, "utf8");

  return { id: `${categoria}/${slug}`, siteId, faltam: await gravarSiteId(destino, siteId) };
}

/**
 * Renomear é mover a pasta e avisar o Supabase — o uuid do mural não muda, então
 * os recados já deixados continuam a aparecer no convite renomeado. O que fica
 * para trás é o que já está publicado no endereço antigo: a VPS não sabe deste
 * rename e continua a servir o slug velho até alguém o apagar no painel.
 */
export async function renomearSite(origemId: string, slug: string): Promise<{ id: string }> {
  const origem = await siteDir(origemId);
  const categoria = origemId.split("/")[0] ?? "";
  if (!NOME.test(slug)) throw new Error("nome inválido — minúsculas e hífen");
  if (slug === origemId.split("/")[1]) return { id: origemId };
  const destino = await destinoLivre(categoria, slug);

  await rename(origem, destino);

  // A pasta já mudou; daqui para a frente uma falha é cosmética e não pode
  // desfazer a mudança, por isso o aviso vai em erro só se o rename falhar.
  await renomearNoSupabase(origemId.split("/")[1] ?? "", slug);
  await gravarSlugLocal(destino, slug);
  return { id: `${categoria}/${slug}` };
}

/** O `site.json` guarda o slug com que o CLI publica; sem isto o deploy subiria
 * outra vez com o nome antigo mesmo depois de a pasta mudar. */
async function gravarSlugLocal(destino: string, slug: string): Promise<void> {
  const arquivo = join(destino, "site.json");
  if (!existsSync(arquivo)) return;
  try {
    const meta = JSON.parse(await readFile(arquivo, "utf8")) as Record<string, unknown>;
    meta.slug = slug;
    await writeFile(arquivo, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  } catch {
    // site.json ilegível não impede o rename — o CLI regrava-o no próximo deploy.
  }
}

async function renomearNoSupabase(antigo: string, novo: string): Promise<void> {
  if (!antigo) return;
  const { url, serviceKey } = credenciais();
  const r = await fetch(`${url}/rest/v1/cr_sites?slug=eq.${encodeURIComponent(antigo)}`, {
    method: "PATCH",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ slug: novo }),
  });
  if (!r.ok) {
    throw new Error(`pasta renomeada, mas o Supabase recusou o slug novo (${r.status})`);
  }
}
