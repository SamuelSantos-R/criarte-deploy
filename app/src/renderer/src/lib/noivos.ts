// O nome dos noivos é escrito uma vez só. O rodapé e o hero já o leem de
// `noivos`; o título da aba (`meta.titulo`) é texto solto e ficava esquecido —
// convite publicado com o nome do casal anterior no separador do navegador.

type Doc = Record<string, unknown>;

function noivosDe(doc: Doc): { noiva: string; noivo: string } | null {
  const n = doc.noivos;
  if (!n || typeof n !== "object") return null;
  const { noiva, noivo } = n as Record<string, unknown>;
  return { noiva: String(noiva ?? "").trim(), noivo: String(noivo ?? "").trim() };
}

/**
 * Se `noivos` mudou entre `antes` e `depois`, reescreve a parte do título depois
 * do último " | " com o casal novo ("Convite de Noivado | Ana & Rui").
 * Recalcula a partir dos nomes, não troca texto — assim apagar o nome inteiro
 * a meio da digitação não perde o rasto. Título sem " | " fica como está.
 */
export function propagarNoivos(antes: Doc, depois: Doc): Doc {
  const a = noivosDe(antes);
  const d = noivosDe(depois);
  if (!d || (a && a.noiva === d.noiva && a.noivo === d.noivo)) return depois;

  const meta = depois.meta;
  if (!meta || typeof meta !== "object") return depois;
  const titulo = (meta as Record<string, unknown>).titulo;
  if (typeof titulo !== "string") return depois;

  const corte = titulo.lastIndexOf(" | ");
  if (corte < 0) return depois;
  const casal = [d.noiva, d.noivo].filter(Boolean).join(" & ");
  const novo = casal ? `${titulo.slice(0, corte)} | ${casal}` : titulo.slice(0, corte + 3);
  if (novo === titulo) return depois;
  return { ...depois, meta: { ...(meta as Record<string, unknown>), titulo: novo } };
}
