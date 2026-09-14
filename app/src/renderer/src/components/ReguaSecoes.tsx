import { type ReactElement } from "react";
import { Plus, type Undo2 } from "lucide-react";
import { iconeDe, rotulo } from "@/lib/secoes";
import { cn } from "@/lib/utils";

export function Regua({
  chaves,
  atual,
  desligadas,
  faltando,
  onEscolher,
  onSemear,
}: {
  chaves: string[];
  atual: string | null;
  desligadas: Set<string>;
  faltando: string[];
  onEscolher: (chave: string) => void;
  onSemear: (chave: string) => void;
}): ReactElement {
  return (
    <nav aria-label="Seções do convite" className="w-[156px] shrink-0 overflow-y-auto border-r border-rule px-2 py-3">
      {chaves.map((chave) => {
        const Icone = iconeDe(chave);
        const ativo = chave === atual;
        const fora = desligadas.has(chave);
        return (
          <button
            key={chave}
            onClick={() => onEscolher(chave)}
            aria-current={ativo ? "true" : undefined}
            title={fora ? `${rotulo(chave)} — fora da página` : undefined}
            className={cn(
              "no-drag relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors",
              ativo ? "bg-surface-2 font-semibold text-text" : "text-muted hover:bg-surface-2/60 hover:text-text",
            )}
          >
            <Icone size={15} strokeWidth={ativo ? 2.1 : 1.8} aria-hidden className={cn(ativo && "text-cyan")} />
            {/* Risca, não só cinza: quem enxerga mal a cor ainda vê que saiu da página. */}
            <span className={cn("truncate", fora && "line-through decoration-1")}>{rotulo(chave)}</span>
          </button>
        );
      })}

      {/* Seção que o template aceita e este convite ainda não tem: vem depois de
          uma régua e com um "+" no lugar do ícone — criar, não abrir. */}
      {faltando.length > 0 && (
        <div className="mt-2 border-t border-rule pt-2">
          {faltando.map((chave) => {
            return (
              <button
                key={chave}
                onClick={() => onSemear(chave)}
                title={`Criar ${rotulo(chave)} neste convite`}
                className={cn(
                  "no-drag flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors",
                  "text-muted hover:bg-surface-2/60 hover:text-text",
                )}
              >
                <Plus size={15} strokeWidth={1.8} aria-hidden />
                <span className="truncate">{rotulo(chave)}</span>
              </button>
            );
          })}
        </div>
      )}
    </nav>
  );
}

/** Interruptor com o estado escrito ao lado — cor sozinha não conta. */
export function ChaveSecao({
  ligada,
  nome,
  onAlternar,
}: {
  ligada: boolean;
  nome: string;
  onAlternar: (proxima: boolean) => void;
}): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligada}
      onClick={() => onAlternar(!ligada)}
      title={ligada ? `Tirar ${nome} da página` : `Devolver ${nome} à página`}
      className={cn(
        "no-drag flex h-8 shrink-0 items-center gap-2 rounded-lg px-1.5 transition-colors",
        ligada ? "text-text" : "text-muted hover:text-text",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "relative h-[18px] w-[32px] rounded-full transition-colors duration-200",
          ligada ? "bg-cyan" : "bg-rule-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] h-[14px] w-[14px] rounded-full bg-surface shadow-sm transition-[left] duration-200 ease-out",
            ligada ? "left-[16px]" : "left-[2px]",
          )}
        />
      </span>
      <span className="text-[12px] font-semibold">
        {ligada ? "na página" : "fora"}
      </span>
    </button>
  );
}

export function BotaoTrilha({
  rotuloAcao,
  atalho,
  Icone,
  disabled,
  onClick,
}: {
  rotuloAcao: string;
  atalho: string;
  Icone: typeof Undo2;
  disabled: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={`${rotuloAcao} (${atalho})`}
      aria-label={`${rotuloAcao} — ${atalho}`}
      aria-keyshortcuts={atalho === "⌘Z" ? "Meta+Z" : "Shift+Meta+Z"}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
        "text-muted hover:bg-surface-2 hover:text-text",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      <Icone size={15} strokeWidth={1.9} aria-hidden />
    </button>
  );
}
