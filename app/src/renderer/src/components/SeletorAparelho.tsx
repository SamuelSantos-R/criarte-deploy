import { type ReactElement } from "react";
import { ChevronDown } from "lucide-react";
import { APARELHOS, acharAparelho, type Aparelho } from "@/components/Palco";
import { cn } from "@/lib/utils";

const GRUPOS: [string, (a: Aparelho) => boolean][] = [
  ["Telefone", (a) => a.movel && a.l < 700],
  ["Tablet", (a) => a.movel && a.l >= 700],
  ["Computador", (a) => !a.movel],
];

export function SeletorAparelho({
  valor,
  onChange,
  className,
}: {
  valor: Aparelho;
  onChange: (a: Aparelho) => void;
  className?: string;
}): ReactElement {
  return (
    <div className={cn("relative", className)}>
      <select
        value={valor.id}
        aria-label="Aparelho"
        onChange={(e) => onChange(acharAparelho(e.target.value))}
        className={cn(
          "no-drag h-[30px] w-full appearance-none bg-surface pl-3 pr-8 text-[13px] text-text",
          "border border-rule focus:border-focus focus:outline-none",
        )}
      >
        {GRUPOS.map(([nome, filtro]) => (
          <optgroup key={nome} label={nome}>
            {APARELHOS.filter(filtro).map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome} · {a.l}×{a.a}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown
        size={13}
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"
      />
    </div>
  );
}
