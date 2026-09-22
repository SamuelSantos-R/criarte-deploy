import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { app } from "electron";
import { containedPath, requireSitesRoot } from "./paths";

// PAINEL RSVP — o Studio deixou de fazer só convites. O painel é um site como
// os outros (`<categoria>/<slug>` com `convite.json`), e por isso ele entra nos
// mesmos trilhos: formulário, preview, coop e deploy não sabem que é outra
// coisa. O que muda é a origem: nasce do molde que viaja dentro do app, não da
// cópia de um painel que já exista na máquina — senão a primeira vez não dá.
const CATEGORIA = "rsvp";

function molde(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "painel-rsvp")
    : resolve(app.getAppPath(), "resources", "painel-rsvp");
}

/** `leodalena-mauro` → `Leodalena & Mauro`, que é como o molde escreve o par. */
function nomeDoSlug(slug: string): string {
  const partes = slug.split("-").filter(Boolean);
  const bonito = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
  if (partes.length >= 2) {
    const meio = Math.ceil(partes.length / 2);
    return `${partes.slice(0, meio).map(bonito).join(" ")} & ${partes.slice(meio).map(bonito).join(" ")}`;
  }
  return partes.map(bonito).join(" ");
}

export async function criarPainel(slug: string): Promise<{ id: string }> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error("nome inválido: minúsculas, números e hífen");
  const origem = molde();
  if (!existsSync(origem)) throw new Error("o molde do painel não veio no app");

  const root = requireSitesRoot();
  const destino = await containedPath(root, CATEGORIA, slug);
  if (existsSync(destino)) throw new Error(`já existe um painel chamado ${slug}`);

  await mkdir(join(root, CATEGORIA), { recursive: true });
  await cp(origem, destino, { recursive: true });

  // O nome do par entra logo: abrir um painel novo e ver o casal do molde é o
  // tipo de coisa que passa despercebida até ao ar.
  const ficheiro = await containedPath(destino, "convite.json");
  const doc = JSON.parse(await readFile(ficheiro, "utf8")) as Record<string, unknown>;
  const noivos = nomeDoSlug(slug);
  const evento = { ...(doc.evento as Record<string, unknown>), noivos };
  const header = doc.header as Record<string, Record<string, unknown>>;
  doc.evento = evento;
  doc.header = { ...header, coupleName: { ...header.coupleName, text: noivos } };
  await writeFile(ficheiro, `${JSON.stringify(doc, null, 2)}\n`, "utf8");

  return { id: `${CATEGORIA}/${slug}` };
}
