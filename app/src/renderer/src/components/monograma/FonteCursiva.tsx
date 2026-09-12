import { useState, type DragEvent, type ReactElement } from "react";
import { Type } from "lucide-react";
import { caminhoDe, type FonteMonograma } from "@/lib/api";
import { FONTE_PADRAO } from "@/lib/monograma/composicao";
import { cn } from "@/lib/utils";

type Props = {
  atual: string;
  /** Nome da fonte em uso, pra quando ela veio de um monograma salvo noutra máquina. */
  atualNome: string;
  recentes: FonteMonograma[];
  ocupado: boolean;
  onEscolher: (chave: string) => void;
  onSoltar: (caminho: string) => void;
};

/** A cursiva é a única que troca. Arrastar o arquivo aqui ou pegar uma que já passou por esta máquina. */
export function FonteCursiva({ atual, atualNome, recentes, ocupado, onEscolher, onSoltar }: Props): ReactElement {
  const [sobre, setSobre] = useState(false);

  const soltar = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setSobre(false);
    const caminho = [...e.dataTransfer.files].map(caminhoDe).find(Boolean);
    if (caminho) onSoltar(caminho);
  };

  const opcoes: FonteMonograma[] = [{ chave: FONTE_PADRAO, nome: "Milton One Bold" }, ...recentes];
  if (!opcoes.some((f) => f.chave === atual)) opcoes.push({ chave: atual, nome: `${atualNome} (não está nesta máquina)` });

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setSobre(true);
        }}
        onDragLeave={() => setSobre(false)}
        onDrop={soltar}
        className={cn(
          "no-drag flex items-center gap-2 border border-dashed px-2.5 py-3 transition-colors",
          sobre ? "border-focus bg-focus/10" : "border-rule bg-surface",
          ocupado && "opacity-50",
        )}
      >
        <Type size={13} className="shrink-0 text-muted" aria-hidden />
        <span className="text-[12px] text-muted">
          {ocupado ? "Lendo a fonte…" : "Arraste um .otf, .ttf ou .woff aqui"}
        </span>
      </div>

      <ul className="mt-2 flex flex-col">
        {opcoes.map((f) => (
          <li key={f.chave}>
            <button
              type="button"
              onClick={() => onEscolher(f.chave)}
              aria-pressed={f.chave === atual}
              className={cn(
                "no-drag flex w-full items-center gap-2 px-2 py-1.5 text-left text-[12px]",
                f.chave === atual ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              <span className={cn("h-1.5 w-1.5 shrink-0", f.chave === atual ? "bg-cyan" : "bg-transparent")} />
              <span className="truncate">{f.nome}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
