import { useId, type ReactElement, type ReactNode } from "react";
import { motion } from "framer-motion";
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
  const pilula = useId();
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
            "relative flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-[12px] font-semibold transition-colors duration-150 disabled:opacity-40",
            valor === o.valor ? "text-text" : "text-muted hover:text-text",
          )}
        >
          {/* A opção ativa é um botão claro que desliza até à escolhida. */}
          {valor === o.valor && (
            <motion.span
              layoutId={pilula}
              className="absolute inset-0 rounded-md bg-surface shadow-sm"
              transition={{ type: "spring", stiffness: 520, damping: 38 }}
            />
          )}
          <span className="relative flex items-center gap-1.5">{o.rotulo}</span>
        </button>
      ))}
    </div>
  );
}
