import { type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Escolha entre poucas opções à vista, no feitio das abas do shadcn: trilho
 * rebaixado e a opção ativa sobe num botão claro.
 */
export function Segmentado<T extends string>({
  valor,
  opcoes,
  onChange,
  rotulo,
  className,
}: {
  valor: T;
  opcoes: { valor: T; rotulo: ReactNode; disabled?: boolean }[];
  onChange: (v: T) => void;
  rotulo: string;
  className?: string;
}): ReactElement {
  return (
    <div role="radiogroup" aria-label={rotulo} className={cn("no-drag inline-flex rounded-lg bg-surface-2 p-0.5", className)}>
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          disabled={o.disabled}
          onClick={() => onChange(o.valor)}
          className={cn(
            "flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-[12px] font-semibold transition-[background-color,color,box-shadow] duration-150 disabled:opacity-40",
            valor === o.valor ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text",
          )}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}
