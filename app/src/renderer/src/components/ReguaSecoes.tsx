import { type ReactElement } from "react";
import type { Undo2 } from "lucide-react";
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
    <nav aria-label="Seções do convite" className="w-[136px] shrink-0 overflow-y-auto border-r border-rule py-2">
      {chaves.map((chave, i) => {
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
              "no-drag relative flex w-full items-center gap-2 px-3 py-[7px] text-left text-[12px] transition-colors",
              ativo ? "bg-surface-2 text-text" : "text-muted hover:text-text",
            )}
          >
            <span className={cn("absolute left-0 top-0 h-full w-[2px]", ativo ? "bg-sage" : "bg-transparent")} />
            <span className="w-[15px] shrink-0 font-mono text-serial text-muted/70">
              {String(i + 1).padStart(2, "0")}
            </span>
            <Icone size={14} strokeWidth={1.6} aria-hidden />
            {/* Risca, não só cinza: quem enxerga mal a cor ainda vê que saiu da página. */}
            <span className={cn("truncate", fora && "line-through decoration-1")}>{rotulo(chave)}</span>
          </button>
        );
      })}

      {/* Seção que o template aceita e este convite ainda não tem. Fica fora da
          numeração de propósito: o buraco na contagem é que diz "não existe no
          arquivo" — não é só um item mais claro na mesma lista. */}
      {faltando.length > 0 && (
        <div className="mt-2 border-t border-dashed border-rule pt-2">
          {faltando.map((chave) => {
            const Icone = iconeDe(chave);
            return (
              <button
                key={chave}
                onClick={() => onSemear(chave)}
                title={`Criar ${rotulo(chave)} neste convite`}
                className={cn(
                  "no-drag flex w-full items-center gap-2 px-3 py-[7px] text-left text-[12px] transition-colors",
                  "text-muted/60 hover:bg-surface-2/40 hover:text-text",
                  "focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-accent",
                )}
              >
                <span className="w-[15px] shrink-0 text-center font-mono text-serial text-muted/50">+</span>
                <Icone size={14} strokeWidth={1.6} aria-hidden />
                <span className="truncate">{rotulo(chave)}</span>
              </button>
            );
          })}
        </div>
      )}
    </nav>
  );
}

/**
 * Trilho reto, não pílula: a chave herda a mesma linguagem do par desfazer/refazer
 * do topo. O rótulo diz o estado por escrito — cor sozinha não conta.
 */
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
        "no-drag flex h-[28px] shrink-0 items-center gap-2 px-1 transition-colors",
        "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-sage",
        ligada ? "text-text hover:text-accent" : "text-muted hover:text-text",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex h-[15px] w-[28px] items-center border px-[2px]",
          ligada ? "justify-end border-accent/70" : "justify-start border-rule-strong",
        )}
      >
        <span className={cn("h-[9px] w-[9px]", ligada ? "bg-accent" : "bg-muted")} />
      </span>
      <span className="font-mono text-label uppercase tracking-[0.14em]">
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
        "flex h-[28px] w-[32px] items-center justify-center transition-colors",
        "text-muted hover:bg-surface-2 hover:text-text",
        "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-sage",
        "disabled:pointer-events-none disabled:text-muted/30",
      )}
    >
      <Icone size={13} strokeWidth={1.8} aria-hidden />
    </button>
  );
}
