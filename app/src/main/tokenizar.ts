import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { app } from "electron";
import { join, resolve } from "node:path";
import { siteDirExistente } from "./sites";

/** As peças viajam no app: injetar não pode depender de haver outro convite ao lado. */
function molde(nome: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, "token", nome)
    : resolve(app.getAppPath(), "resources", "token", nome);
}

export type EstadoToken = {
  tokenizado: boolean;
  /** O que falta, por nome de ficheiro, para o painel dizer o que vai fazer. */
  faltam: string[];
  /** Motivo pelo qual não dá para injetar automaticamente, se houver. */
  impedimento: string | null;
};

const PECAS = ["src/lib/guest.tsx", "public/guests.example.json", "criarte.config.json"];

async function envolveChildren(layout: string): Promise<string | null> {
  return layout.includes("<GuestProvider>") ? null : layout;
}

/**
 * O que este convite tem e o que lhe falta. O `impedimento` é o que trava a
 * injeção antes de ela começar: mexer no layout às cegas foi o que, no passado,
 * partiu convites de base diferente.
 */
export async function estadoToken(siteId: string): Promise<EstadoToken> {
  const raiz = await siteDirExistente(siteId);
  const faltam = PECAS.filter((p) => !existsSync(join(raiz, p)));

  const base = join(raiz, "criarte.config.json");
  let baseOk = false;
  if (existsSync(base)) {
    try {
      baseOk = (JSON.parse(await readFile(base, "utf8")) as { base?: unknown }).base === "convite-token";
    } catch {
      baseOk = false;
    }
  }

  const layoutPath = join(raiz, "src/app/layout.tsx");
  const layout = existsSync(layoutPath) ? await readFile(layoutPath, "utf8") : null;
  const jaEnvolve = layout?.includes("<GuestProvider>") === true;

  const tokenizado = faltam.length === 0 && baseOk && jaEnvolve;

  let impedimento: string | null = null;
  if (!tokenizado) {
    if (layout === null) impedimento = "não encontrei src/app/layout.tsx neste convite";
    else if (!jaEnvolve && (layout.match(/\{children\}/g) ?? []).length !== 1) {
      impedimento =
        "o layout.tsx não tem exatamente um {children} — não dá para envolver sem adivinhar; este convite tem de ser ligado à mão";
    }
  }

  return { tokenizado, faltam: [...faltam, ...(baseOk ? [] : ["base convite-token"]), ...(jaEnvolve ? [] : ["<GuestProvider> no layout"])], impedimento };
}

/**
 * Copia as peças e liga o `GuestProvider` no layout. Nunca escreve por cima de
 * um ficheiro que já exista, e o layout só é tocado quando tem um `{children}`
 * e um só — na dúvida recusa e diz porquê, em vez de deixar um convite partido.
 */
export async function tokenizar(siteId: string): Promise<EstadoToken> {
  const raiz = await siteDirExistente(siteId);
  const estado = await estadoToken(siteId);
  if (estado.tokenizado) return estado;
  if (estado.impedimento) throw new Error(estado.impedimento);

  const guest = join(raiz, "src/lib/guest.tsx");
  if (!existsSync(guest)) {
    await mkdir(join(raiz, "src/lib"), { recursive: true });
    await copyFile(molde("guest.tsx"), guest);
  }

  const exemplo = join(raiz, "public/guests.example.json");
  if (!existsSync(exemplo)) {
    await mkdir(join(raiz, "public"), { recursive: true });
    const bruto = JSON.parse(await readFile(molde("guests.example.json"), "utf8")) as Record<string, unknown>;
    bruto.site = siteId;
    bruto.generatedAt = new Date().toISOString();
    await writeFile(exemplo, `${JSON.stringify(bruto, null, 2)}\n`, "utf8");
  }

  // O config pode já existir com outras chaves: acrescenta a base, não substitui.
  const config = join(raiz, "criarte.config.json");
  const atual = existsSync(config)
    ? ((JSON.parse(await readFile(config, "utf8")) as Record<string, unknown>) ?? {})
    : {};
  atual.base = "convite-token";
  await writeFile(config, `${JSON.stringify(atual, null, 2)}\n`, "utf8");

  const layoutPath = join(raiz, "src/app/layout.tsx");
  let layout = await readFile(layoutPath, "utf8");
  if (!(await envolveChildren(layout))) {
    return estadoToken(siteId);
  }
  if (!layout.includes('from "@/lib/guest"')) {
    // A seguir ao último import, para não cair antes de um "use client".
    const fim = layout.lastIndexOf("\nimport ");
    const quebra = layout.indexOf("\n", layout.indexOf(";", fim));
    layout = `${layout.slice(0, quebra)}\nimport { GuestProvider } from "@/lib/guest";${layout.slice(quebra)}`;
  }
  layout = layout.replace("{children}", "<GuestProvider>{children}</GuestProvider>");
  await writeFile(layoutPath, layout, "utf8");

  return estadoToken(siteId);
}
