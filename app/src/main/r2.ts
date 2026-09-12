import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ============================================================================
// R2 — o mínimo de S3 que o Studio precisa, assinado à mão (SigV4).
// ============================================================================
// O `@aws-sdk/client-s3` do CLI são megabytes que teriam de entrar no app.asar
// para quatro chamadas. As credenciais são as mesmas do `crd login`.

export type ConfigR2 = {
  endpoint: string;
  bucket: string;
  publicUrl: string;
  accessKeyId: string;
  secretAccessKey: string;
};

const TEMPO_MAX_MS = 30_000;

export async function configR2(): Promise<ConfigR2 & { autor: string | null }> {
  const ficheiro = join(homedir(), ".criarte-deploy", "config.json");
  if (!existsSync(ficheiro)) throw new Error("esta máquina não tem credenciais — importa em Config");
  const doc = JSON.parse(await readFile(ficheiro, "utf8")) as Record<string, unknown>;
  const r2 = doc["r2"] as Record<string, unknown> | undefined;
  const campos = ["endpoint", "bucket", "publicUrl", "accessKeyId", "secretAccessKey"] as const;
  if (!r2 || campos.some((k) => typeof r2[k] !== "string" || !(r2[k] as string))) {
    throw new Error("as credenciais desta máquina não têm o R2 configurado");
  }
  const endpoint = new URL(r2.endpoint as string);
  if (endpoint.protocol !== "https:") throw new Error("endpoint do R2 tem de ser https");
  return {
    endpoint: endpoint.origin,
    bucket: r2.bucket as string,
    publicUrl: (r2.publicUrl as string).replace(/\/$/, ""),
    accessKeyId: r2.accessKeyId as string,
    secretAccessKey: r2.secretAccessKey as string,
    autor: typeof doc["name"] === "string" ? doc["name"] : null,
  };
}

/** RFC 3986 estrito: o `encodeURIComponent` deixa passar `!'()*`, e a assinatura não. */
const codificar = (s: string): string =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

const sha256 = (dados: string | Buffer): string => createHash("sha256").update(dados).digest("hex");
const hmac = (chave: string | Buffer, dados: string): Buffer => createHmac("sha256", chave).update(dados).digest();

async function pedir(
  cfg: ConfigR2,
  metodo: "GET" | "PUT" | "DELETE",
  chave: string,
  opcoes: { query?: Record<string, string>; corpo?: Buffer; tipo?: string } = {},
): Promise<Response> {
  const url = new URL(cfg.endpoint);
  // Sem chave é operação no bucket (listar): a URL canónica acaba no nome dele.
  const caminho = chave
    ? `/${codificar(cfg.bucket)}/${chave.split("/").map(codificar).join("/")}`
    : `/${codificar(cfg.bucket)}`;
  const query = Object.entries(opcoes.query ?? {})
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${codificar(k)}=${codificar(v)}`)
    .join("&");

  const agora = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dia = agora.slice(0, 8);
  const corpo = opcoes.corpo ?? Buffer.alloc(0);
  const hashCorpo = sha256(corpo);
  const cabecalhos: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": hashCorpo,
    "x-amz-date": agora,
  };
  const assinados = Object.keys(cabecalhos).sort();
  const canonico = [
    metodo,
    caminho,
    query,
    assinados.map((h) => `${h}:${cabecalhos[h]}\n`).join(""),
    assinados.join(";"),
    hashCorpo,
  ].join("\n");
  const escopo = `${dia}/auto/s3/aws4_request`;
  const aAssinar = ["AWS4-HMAC-SHA256", agora, escopo, sha256(canonico)].join("\n");
  const chaveAssinatura = hmac(hmac(hmac(hmac(`AWS4${cfg.secretAccessKey}`, dia), "auto"), "s3"), "aws4_request");
  const assinatura = createHmac("sha256", chaveAssinatura).update(aAssinar).digest("hex");

  const { host: _host, ...enviados } = cabecalhos;
  return fetch(`${cfg.endpoint}${caminho}${query ? `?${query}` : ""}`, {
    method: metodo,
    headers: {
      ...enviados,
      ...(opcoes.tipo ? { "content-type": opcoes.tipo } : {}),
      authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${escopo}, SignedHeaders=${assinados.join(";")}, Signature=${assinatura}`,
    },
    body: metodo === "PUT" ? new Uint8Array(corpo) : undefined,
    signal: AbortSignal.timeout(TEMPO_MAX_MS),
  });
}

async function falhou(r: Response, oQue: string): Promise<never> {
  // O corpo do erro do S3 é XML com Code; o resto (RequestId, etc.) não interessa ao operador.
  const codigo = (await r.text().catch(() => "")).match(/<Code>([^<]+)<\/Code>/)?.[1];
  throw new Error(`R2 recusou ${oQue} (${r.status}${codigo ? ` ${codigo}` : ""})`);
}

export async function r2Put(cfg: ConfigR2, chave: string, corpo: Buffer, tipo: string): Promise<void> {
  const r = await pedir(cfg, "PUT", chave, { corpo, tipo });
  if (!r.ok) await falhou(r, "a gravação");
}

export async function r2Get(cfg: ConfigR2, chave: string): Promise<Buffer | null> {
  const r = await pedir(cfg, "GET", chave);
  if (r.status === 404) return null;
  if (!r.ok) await falhou(r, "a leitura");
  return Buffer.from(await r.arrayBuffer());
}

export async function r2Delete(cfg: ConfigR2, chave: string): Promise<void> {
  const r = await pedir(cfg, "DELETE", chave);
  if (!r.ok && r.status !== 404) await falhou(r, "a remoção");
}

const desescapar = (s: string): string =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** ListObjectsV2 inteiro, página a página. Com `delimitador`, devolve as "pastas". */
export async function r2Listar(
  cfg: ConfigR2,
  prefixo: string,
  delimitador?: string,
): Promise<{ chaves: string[]; pastas: string[] }> {
  const chaves: string[] = [];
  const pastas: string[] = [];
  let continuacao: string | undefined;
  for (let pagina = 0; pagina < 50; pagina++) {
    const query: Record<string, string> = { "list-type": "2", prefix: prefixo };
    if (delimitador) query.delimiter = delimitador;
    if (continuacao) query["continuation-token"] = continuacao;
    const r = await pedir(cfg, "GET", "", { query });
    if (!r.ok) await falhou(r, "a listagem");
    const xml = await r.text();
    for (const m of xml.matchAll(/<Contents>[\s\S]*?<Key>([^<]+)<\/Key>/g)) chaves.push(desescapar(m[1]));
    for (const m of xml.matchAll(/<CommonPrefixes>\s*<Prefix>([^<]+)<\/Prefix>/g)) pastas.push(desescapar(m[1]));
    continuacao = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1];
    if (!/<IsTruncated>true<\/IsTruncated>/.test(xml) || !continuacao) break;
    continuacao = desescapar(continuacao);
  }
  return { chaves, pastas };
}
