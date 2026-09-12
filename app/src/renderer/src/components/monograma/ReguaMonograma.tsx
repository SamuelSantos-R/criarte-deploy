import { useState, type ReactElement } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  rotulo: string;
  valor: number;
  min: number;
  max: number;
  passo: number;
  unidade?: string;
  onChange: (v: number) => void;
};

const preso = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const arred = (v: number, passo: number): number => {
  const casas = String(passo).split(".")[1]?.length ?? 0;
  return Number((Math.round(v / passo) * passo).toFixed(casas));
};

/** A mesma régua das Medidas: a linha inteira enche e arrastar em qualquer ponto move. */
export function ReguaMonograma({ rotulo, valor, min, max, passo, unidade = "", onChange }: Props): ReactElement {
  const atual = preso(valor, min, max);
  const pct = ((atual - min) / (max - min)) * 100;
  const [rascunho, setRascunho] = useState<string | null>(null);
  const mudar = (v: number): void => onChange(arred(preso(v, min, max), passo));

  const fechar = (): void => {
    const n = rascunho === null ? NaN : Number(rascunho.replace(",", "."));
    if (Number.isFinite(n)) mudar(n);
    setRascunho(null);
  };

  return (
    <div className="relative border-b border-rule focus-within:bg-surface-2/40">
      <div className="pointer-events-none absolute inset-y-0 left-0 bg-cyan/15" style={{ width: `${pct}%` }} aria-hidden />
      <div className="pointer-events-none absolute inset-y-0 w-px bg-cyan" style={{ left: `${pct}%` }} aria-hidden />
      <input
        type="range"
        min={min}
        max={max}
        step={passo}
        value={atual}
        onChange={(e) => mudar(Number(e.target.value))}
        aria-label={rotulo}
        className={cn(
          "no-drag absolute inset-0 h-full w-full cursor-ew-resize appearance-none bg-transparent opacity-0",
          "focus-visible:opacity-100 focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cyan",
        )}
      />
      <div className="pointer-events-none relative flex items-center gap-2 py-2 pl-3 pr-1">
        <span className="min-w-0 flex-1 truncate text-[12px] text-text">{rotulo}</span>
        <div className="pointer-events-auto flex shrink-0 items-center gap-1">
          {[-passo, passo].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => mudar(atual + d)}
              disabled={d < 0 ? atual <= min : atual >= max}
              aria-label={`${d < 0 ? "Diminuir" : "Aumentar"} ${rotulo}`}
              className="no-drag flex h-6 w-6 items-center justify-center border border-rule text-muted hover:border-rule-strong hover:text-text disabled:opacity-30"
            >
              {d < 0 ? <Minus size={12} /> : <Plus size={12} />}
            </button>
          ))}
          <span className="gauge flex w-[52px] items-baseline justify-end gap-0.5 font-narrow text-[12px] font-semibold text-text">
            <input
              value={rascunho ?? String(atual)}
              onChange={(e) => setRascunho(e.target.value)}
              onBlur={fechar}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setRascunho(null);
              }}
              aria-label={`${rotulo}, valor`}
              className="no-drag w-full bg-transparent text-right focus:outline-hidden"
            />
            {unidade && <span className="text-muted">{unidade}</span>}
          </span>
        </div>
      </div>
    </div>
  );
}
