import { auth, credenciais, podeRegistrar, uuidDoSlug } from "./duplicar";
import { assertSiteId } from "./paths";

// ============================================================================
// CORREIO DO AMOR — os recados que os convidados deixam no convite. O mural é
// público e qualquer um escreve; até agora, apagar um recado de teste (ou um
// impróprio) só dava indo ao SQL à mão, e quem faz os convites não tem de
// abrir banco de dados nenhum.
// ============================================================================

export type Recado = { id: string; nome: string; texto: string; quando: string };

function slugDe(siteId: string): string {
  const slug = assertSiteId(siteId).split("/")[1] ?? "";
  if (!slug) throw new Error("não descobri o nome do convite");
  return slug;
}

/** Os recados deste convite, do mais novo para o mais velho. */
export async function lerRecados(siteId: string): Promise<Recado[]> {
  if (!podeRegistrar()) throw new Error("esta máquina não tem credenciais — importa em Config");
  const uuid = await uuidDoSlug(slugDe(siteId));
  if (!uuid) return [];
  const { url, serviceKey } = credenciais();
  const r = await fetch(
    `${url}/rest/v1/cr_mensagens?site_id=eq.${encodeURIComponent(uuid)}` +
      `&select=id,nome,texto,created_at&order=created_at.desc&limit=500`,
    { headers: auth(serviceKey) },
  );
  if (!r.ok) throw new Error(`Supabase recusou a consulta (${r.status})`);
  const linhas = (await r.json()) as { id: unknown; nome: unknown; texto: unknown; created_at: unknown }[];
  return linhas.map((l) => ({
    id: String(l.id),
    nome: typeof l.nome === "string" ? l.nome : "",
    texto: typeof l.texto === "string" ? l.texto : "",
    quando: typeof l.created_at === "string" ? l.created_at : "",
  }));
}

/**
 * Apaga um recado — um, pelo id, e só dentro deste convite. O `site_id` entra
 * no filtro de propósito: id trocado não apaga o recado de outro casal.
 */
export async function apagarRecado(siteId: string, recadoId: unknown): Promise<{ apagados: number }> {
  if (typeof recadoId !== "string" || !/^[\w-]{1,64}$/.test(recadoId)) {
    throw new Error("id de recado inválido");
  }
  if (!podeRegistrar()) throw new Error("esta máquina não tem credenciais — importa em Config");
  const uuid = await uuidDoSlug(slugDe(siteId));
  if (!uuid) throw new Error("este convite não está registado no banco");
  const { url, serviceKey } = credenciais();
  const r = await fetch(
    `${url}/rest/v1/cr_mensagens?id=eq.${encodeURIComponent(recadoId)}` +
      `&site_id=eq.${encodeURIComponent(uuid)}&select=id`,
    { method: "DELETE", headers: { ...auth(serviceKey), Prefer: "return=representation" } },
  );
  if (!r.ok) throw new Error(`Supabase recusou apagar (${r.status})`);
  const apagados = ((await r.json()) as unknown[]).length;
  if (apagados === 0) throw new Error("esse recado já não estava lá");
  return { apagados };
}
