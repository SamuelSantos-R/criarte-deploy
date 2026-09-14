import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { baixarFonte, estadoCoop } from "./coop";
import { copiavel, desempacotar } from "./pacote";
import { containedPath, requireSitesRoot } from "./paths";
import { readConvite, siteDir } from "./sites";

const NOME = /^[a-z0-9][a-z0-9-]*$/;

type Credenciais = { url: string; serviceKey: string };

/**
 * A chave secreta mora no mesmo config do CLI, fora do repo, e é lida só aqui no
 * main. Se ela chegasse ao renderer viraria `NEXT_PUBLIC_` na primeira distração.
 */
const CONFIG_CLI = (): string => join(homedir(), ".criarte-deploy", "config.json");

/**
 * O convidado do co-op costuma estar numa máquina que nunca publicou nada, logo
 * sem o config do CLI. Não ter a chave não pode impedi-lo de ficar com a pasta:
 * publicar é outro passo, e quem publica é quem tem a chave.
 */
function podeRegistrar(): boolean {
  return existsSync(CONFIG_CLI());
}

function credenciais(): Credenciais {
  const arquivo = CONFIG_CLI();
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

/** "naida-fabio" → "Naida Fabio". Sem acentos, mas nunca mente. */
function tituloDoSlug(slug: string): string {
  return slug.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

function tituloDe(convite: unknown, slug: string): string {
  const noivos = (convite as { noivos?: { noiva?: unknown; noivo?: unknown } })?.noivos;
  const noiva = typeof noivos?.noiva === "string" ? noivos.noiva.trim() : "";
  const noivo = typeof noivos?.noivo === "string" ? noivos.noivo.trim() : "";
  if (noiva && noivo) return `${noiva} & ${noivo}`;
  return tituloDoSlug(slug);
}

/**
 * O título no banco acompanha os noivos, mas só depois de eles serem escritos.
 *
 * No momento de registar, o convite novo é uma cópia: os noivos ainda são os do
 * molde. Usar `tituloDe` aqui foi o que encheu a `cr_sites` de nomes trocados —
 * `cremilde-jose` registado como "Isalú & Kaiser" — e nada corrigia depois,
 * porque editar os noivos nunca voltava a tocar no registo.
 *
 * O campo não é lido por código nenhum; o mural anda pelo uuid. Mas é a única
 * coisa legível na tabela, e foi a olhar para ele que se decidiu o que apagar a
 * 2026-09-12. Num sítio onde se tomam decisões destrutivas, um rótulo errado é
 * pior que rótulo nenhum: o vazio faz perguntar, o errado faz decidir.
 *
 * Então o registo nasce com o nome que o Heatz escreveu — que é sempre verdade
 * — e `sincronizarTitulo` troca-o pelos noivos reais assim que existirem.
 */
const tituloSincronizado = new Map<string, string>();

export async function sincronizarTitulo(id: string, doc: unknown): Promise<void> {
  if (!podeRegistrar()) return;
  const slug = id.split("/")[1] ?? "";
  if (!NOME.test(slug)) return;

  const titulo = tituloDe(doc, slug);
  if (tituloSincronizado.get(id) === titulo) return;

  try {
    const { url, serviceKey } = credenciais();
    const r = await fetch(`${url}/rest/v1/cr_sites?slug=eq.${encodeURIComponent(slug)}`, {
      method: "PATCH",
      headers: { ...auth(serviceKey), "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ titulo }),
    });
    if (r.ok) tituloSincronizado.set(id, titulo);
  } catch {
    // Sem rede o título fica para a gravação seguinte. Nunca estraga a gravação:
    // o convite é que importa, isto é rótulo.
  }
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
async function gravarSiteId(destino: string, siteId: string | null): Promise<string[]> {
  const arquivo = join(destino, ".env.local");
  const antes = existsSync(arquivo) ? await readFile(arquivo, "utf8") : "";
  // Sem uuid novo o herdado tem de sair na mesma: deixá-lo era o convite novo a
  // escrever no mural do casal de quem mandou a pasta.
  const limpo = antes.replace(/^NEXT_PUBLIC_SITE_ID=.*\n?/m, "");
  const depois = siteId
    ? `${limpo ? limpo.replace(/\n*$/, "\n") : ""}NEXT_PUBLIC_SITE_ID=${siteId}\n`
    : limpo;
  await writeFile(arquivo, depois, "utf8");
  const exigidas = siteId ? CHAVES_MURAL : [...CHAVES_MURAL, "NEXT_PUBLIC_SITE_ID"];
  return exigidas.filter((c) => !new RegExp(`^${c}=.+$`, "m").test(depois));
}

export type Copia = { id: string; siteId: string | null; faltam: string[] };

async function destinoLivre(categoria: string, slug: string): Promise<string> {
  if (!NOME.test(categoria)) throw new Error("categoria inválida — minúsculas e hífen");
  if (!NOME.test(slug)) throw new Error("nome inválido — minúsculas e hífen");
  const destino = await containedPath(requireSitesRoot(), categoria, slug);
  if (existsSync(destino)) throw new Error(`${categoria}/${slug} já existe`);
  return destino;
}

/**
 * Ordem proposital: registra no Supabase **antes** de escrever os ficheiros. Na
 * ordem inversa sobraria uma pasta carregando o uuid do casal anterior, e o
 * mural de recados do convite novo escreveria em cima do antigo.
 *
 * O preço é a linha órfã quando a cópia falha. Isso já foi descrito aqui como
 * não fazendo "mal a ninguém" — fazia: prendia o nome, e o Studio respondia 409
 * para sempre a quem tentasse reusá-lo. Agora há `libertarSlug` para o soltar.
 */
export async function duplicarSite(origemId: string, categoria: string, slug: string): Promise<Copia> {
  const origem = await siteDir(origemId);
  const destino = await destinoLivre(categoria, slug);
  // Lido para validar que a origem tem um convite legível antes de registar seja
  // o que for; o conteúdo já não serve para o título.
  await readConvite(origemId);
  // O nome que o Heatz escreveu, não os noivos do molde: a cópia ainda traz os
  // do convite de origem. `sincronizarTitulo` põe os certos na primeira gravação.
  const siteId = await registrar(slug, tituloDoSlug(slug));

  try {
    // O `.env.local` da origem viaja na cópia com o uuid do casal anterior lá
    // dentro, e só o `gravarSiteId` a seguir é que o troca. Entre uma coisa e
    // outra existe uma pasta que escreve no mural de outro casal.
    await cp(origem, destino, { recursive: true, filter: (src) => copiavel(src, origem) });
    return { id: `${categoria}/${slug}`, siteId, faltam: await gravarSiteId(destino, siteId) };
  } catch (erro) {
    // Falhando qualquer um dos dois, desfaz-se tudo: a pasta sai (senão fica a
    // apontar ao mural do casal de origem) e o nome é solto (senão fica preso e
    // o Studio recusa-o para sempre). Nenhuma das limpezas pode tapar o erro
    // original — é esse que diz o que correu mal.
    await rm(destino, { recursive: true, force: true }).catch(() => {});
    await libertarSlug(slug).catch(() => {});
    throw erro;
  }
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
  // Com o mesmo nome do convite da sessão, é o mesmo convite a ir para outra
  // máquina, não um casal novo: fica com o registo (e o mural) que já existe.
  // Antes registava sempre, e o 409 barrava quem só queria editar no seu PC.
  const mesmoConvite = estadoCoop().siteId?.split("/")[1] === slug;
  const existente = mesmoConvite && podeRegistrar() ? await uuidDoSlug(slug) : null;
  const siteId = existente ?? (podeRegistrar() ? await registrar(slug, tituloDoSlug(slug)) : null);

  try {
    await mkdir(destino, { recursive: true });
    await desempacotar(pacote, destino);
    await writeFile(join(destino, "convite.json"), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
    return { id: `${categoria}/${slug}`, siteId, faltam: await gravarSiteId(destino, siteId) };
  } catch (erro) {
    // Aqui a fonte vem limpa, sem `.env.local` de ninguém, então o risco é só o
    // nome preso — mas desfaz-se na mesma, para os dois caminhos de criação se
    // comportarem igual. Sem registo (`siteId` nulo) não há nada a soltar.
    await rm(destino, { recursive: true, force: true }).catch(() => {});
    // O registo reaproveitado não é nosso para soltar: é o do convite no ar.
    if (siteId && !existente) await libertarSlug(slug).catch(() => {});
    throw erro;
  }
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

/** Cabeçalhos do PostgREST com a chave de serviço. */
function auth(serviceKey: string): Record<string, string> {
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
}

/** O uuid que o banco deu a este slug, ou null se o nome não está registado. */
async function uuidDoSlug(slug: string): Promise<string | null> {
  const { url, serviceKey } = credenciais();
  const r = await fetch(
    `${url}/rest/v1/cr_sites?slug=eq.${encodeURIComponent(slug)}&select=id`,
    { headers: auth(serviceKey) },
  );
  if (!r.ok) throw new Error(`Supabase recusou a consulta (${r.status})`);
  const id = ((await r.json()) as { id?: unknown }[])[0]?.id;
  return typeof id === "string" ? id : null;
}

/** Quantos recados o mural deste uuid guarda. Conta exacta, via content-range. */
async function contarRecados(uuid: string): Promise<number> {
  const { url, serviceKey } = credenciais();
  const r = await fetch(
    `${url}/rest/v1/cr_mensagens?site_id=eq.${encodeURIComponent(uuid)}&select=id`,
    { headers: { ...auth(serviceKey), Prefer: "count=exact", Range: "0-0" } },
  );
  if (!r.ok) throw new Error(`Supabase recusou a contagem (${r.status})`);
  const total = Number((r.headers.get("content-range") ?? "").split("/")[1]);
  return Number.isFinite(total) ? total : 0;
}

export type EstadoSlug = {
  slug: string;
  registado: boolean;
  temPasta: boolean;
  recados: number;
};

/**
 * O que existe com este nome, antes de apagar seja o que for. A UI precisa de
 * saber três coisas separadas: se o nome está preso no banco, se há pasta em
 * disco, e quantos recados se perdem — porque um convite de teste e um convite
 * com recados de convidados merecem avisos diferentes.
 */
export async function estadoDoSlug(categoria: string, slug: string): Promise<EstadoSlug> {
  if (!NOME.test(slug)) throw new Error("nome inválido — minúsculas e hífen");
  const temPasta = NOME.test(categoria)
    ? existsSync(await containedPath(requireSitesRoot(), categoria, slug))
    : false;
  if (!podeRegistrar()) return { slug, registado: false, temPasta, recados: 0 };

  const uuid = await uuidDoSlug(slug);
  if (!uuid) return { slug, registado: false, temPasta, recados: 0 };
  return { slug, registado: true, temPasta, recados: await contarRecados(uuid) };
}

/**
 * Solta o nome no banco: apaga os recados e depois a linha de `cr_sites`.
 *
 * Existe porque `duplicarSite` regista **antes** de copiar os ficheiros, de
 * propósito — mas isso deixa o nome preso quando a pasta desaparece depois, e
 * até 2026-09-12 não havia forma de o libertar sem ir ao SQL à mão. Era esse o
 * beco: pasta apagada, nome ocupado, e o Studio a responder 409 para sempre.
 *
 * Os recados saem primeiro: se a linha do site saísse antes e a segunda chamada
 * falhasse, ficavam recados apontados a um uuid que já não existe — invisíveis
 * na app e impossíveis de encontrar pelo nome.
 */
export async function libertarSlug(slug: string): Promise<{ recados: number }> {
  if (!NOME.test(slug)) throw new Error("nome inválido — minúsculas e hífen");
  const { url, serviceKey } = credenciais();

  const uuid = await uuidDoSlug(slug);
  if (!uuid) return { recados: 0 };
  const recados = await contarRecados(uuid);

  const apagados = await fetch(
    `${url}/rest/v1/cr_mensagens?site_id=eq.${encodeURIComponent(uuid)}`,
    { method: "DELETE", headers: { ...auth(serviceKey), Prefer: "return=minimal" } },
  );
  if (!apagados.ok) {
    throw new Error(`Supabase recusou apagar os recados (${apagados.status}) — nada foi alterado`);
  }

  const site = await fetch(`${url}/rest/v1/cr_sites?slug=eq.${encodeURIComponent(slug)}`, {
    method: "DELETE",
    headers: { ...auth(serviceKey), Prefer: "return=minimal" },
  });
  if (!site.ok) {
    throw new Error(
      `os recados de "${slug}" foram apagados, mas o Supabase recusou apagar o registo (${site.status}). ` +
        `O nome continua ocupado — tenta outra vez.`,
    );
  }
  return { recados };
}

/**
 * Apaga o convite: a pasta em disco e o registo no banco.
 *
 * A pasta sai **depois** do registo. Falhando a meio, o que sobra é uma pasta
 * sem nome reservado — que se apaga à mão e não impede nada. Na ordem inversa
 * sobraria o nome preso, que é exactamente o problema que isto vem resolver.
 */
export async function apagarSite(id: string): Promise<{ recados: number }> {
  const categoria = id.split("/")[0] ?? "";
  const slug = id.split("/")[1] ?? "";
  if (!NOME.test(categoria) || !NOME.test(slug)) throw new Error("id inválido");

  const pasta = await containedPath(requireSitesRoot(), categoria, slug);
  const { recados } = podeRegistrar() ? await libertarSlug(slug) : { recados: 0 };
  await rm(pasta, { recursive: true, force: true });
  return { recados };
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
  if (r.status === 409) {
    throw new Error(
      `a pasta já se chama "${novo}", mas o Supabase não aceitou: já existe outro convite registado com esse nome. ` +
        `Apaga a linha antiga em cr_sites (ou escolhe outro nome) e renomeia de novo — o convite continua a funcionar entretanto.`,
    );
  }
  if (!r.ok) {
    throw new Error(
      `a pasta já se chama "${novo}", mas o Supabase recusou o slug novo (${r.status}). ` +
        `O convite continua a funcionar: o mural anda pelo uuid, não pelo nome.`,
    );
  }
}
