/**
 * Os tipos de convite que o Studio sabe criar. Cada um tem a sua biblioteca de
 * modelos no R2 e a sua pasta em `sites/<id>/`, que vira o endereço no ar
 * (`/<id>/<slug>`). Um tipo novo entra aqui e mais nada: o "+ convite", o
 * "Salvar como modelo" e a validação do main leem esta lista.
 *
 * Partilhado pelo main e pela tela de propósito — duas listas desencontravam
 * no primeiro tipo novo, e a tela oferecia o que o main recusava.
 */
export const CATEGORIAS = [
  { id: "casamento", rotulo: "Casamento", exemplo: "joana-ricardo" },
  { id: "noivado", rotulo: "Noivado", exemplo: "carolina-daniel" },
  { id: "save-the-date", rotulo: "Save the date", exemplo: "ana-pedro" },
] as const;

export type Categoria = (typeof CATEGORIAS)[number]["id"];

export function ehCategoria(v: unknown): v is Categoria {
  return CATEGORIAS.some((c) => c.id === v);
}

/** A categoria de um site pelo id ("noivado/ana-pedro"), ou null se não for uma conhecida. */
export function categoriaDoSite(siteId: string): Categoria | null {
  const cat = siteId.split("/")[0];
  return ehCategoria(cat) ? cat : null;
}
