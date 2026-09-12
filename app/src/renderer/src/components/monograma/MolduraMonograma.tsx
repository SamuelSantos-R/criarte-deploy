import { useState, type DragEvent, type ReactElement } from "react";
import { Frame } from "lucide-react";
import { caminhoDe, type FonteMonograma } from "@/lib/api";
import type { Moldura } from "@/lib/monograma/composicao";
import { cn } from "@/lib/utils";

type Props = {
  moldura: Moldura;
  recentes: FonteMonograma[];
  ocupado: boolean;
  onEscolher: (m: Pick<Moldura, "tipo" | "chave" | "nome">) => void;
  onSoltar: (caminho: string) => void;
};

/** Mesmo gesto da fonte da cursiva: nenhuma por padrão, a guirlanda da casa, ou arrastar a de hoje. */
export function MolduraMonograma({ moldura, recentes, ocupado, onEscolher, onSoltar }: Props): ReactElement {
  const [sobre, setSobre] = useState(false);

  const soltar = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setSobre(false);
    const caminho = [...e.dataTransfer.files].map(caminhoDe).find(Boolean);
    if (caminho) onSoltar(caminho);
  };

  const opcoes: { id: string; nome: string; valor: Pick<Moldura, "tipo" | "chave" | "nome"> }[] = [
    { id: "nenhuma", nome: "Nenhuma", valor: { tipo: "nenhuma" } },
    { id: "guirlanda", nome: "Guirlanda", valor: { tipo: "guirlanda" } },
    ...recentes.map((f) => ({ id: f.chave, nome: f.nome, valor: { tipo: "arquivo" as const, chave: f.chave, nome: f.nome } })),
  ];
  const atual = moldura.tipo === "arquivo" ? (moldura.chave ?? "") : moldura.tipo;
  if (moldura.tipo === "arquivo" && !opcoes.some((o) => o.id === atual)) {
    opcoes.push({ id: atual, nome: `${moldura.nome ?? "moldura"} (não está nesta máquina)`, valor: moldura });
  }

  return (
    <div>
      <ul className="flex flex-col">
        {opcoes.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => onEscolher(o.valor)}
              aria-pressed={o.id === atual}
              className={cn(
                "no-drag flex w-full items-center gap-2 px-2 py-1.5 text-left text-[12px]",
                o.id === atual ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              <span className={cn("h-1.5 w-1.5 shrink-0", o.id === atual ? "bg-cyan" : "bg-transparent")} />
              <span className="truncate">{o.nome}</span>
            </button>
          </li>
        ))}
      </ul>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setSobre(true);
        }}
        onDragLeave={() => setSobre(false)}
        onDrop={soltar}
        className={cn(
          "no-drag mt-2 flex items-center gap-2 border border-dashed px-2.5 py-3 transition-colors",
          sobre ? "border-focus bg-focus/10" : "border-rule bg-surface",
          ocupado && "opacity-50",
        )}
      >
        <Frame size={13} className="shrink-0 text-muted" aria-hidden />
        <span className="text-[12px] text-muted">{ocupado ? "Lendo a moldura…" : "Arraste uma moldura aqui (.svg ou .png)"}</span>
      </div>
    </div>
  );
}
