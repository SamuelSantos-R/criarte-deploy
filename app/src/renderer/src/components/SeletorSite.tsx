import { type ReactElement } from "react";
import { ChevronDown } from "lucide-react";
import type { Site } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Agrupa preservando a ordem de chegada — a lista já vem por data de alteração. */
function porCategoria(sites: Site[]): [string, Site[]][] {
  const mapa = new Map<string, Site[]>();
  for (const s of sites) {
    const atual = mapa.get(s.categoria);
    if (atual) atual.push(s);
    else mapa.set(s.categoria, [s]);
  }
  return [...mapa];
}

export function SeletorSite({
  sites,
  valor,
  onChange,
  disabled,
  label,
  somenteConvite,
  className,
}: {
  sites: Site[];
  valor: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
  label?: string;
  somenteConvite?: boolean;
  className?: string;
}): ReactElement {
  const grupos = porCategoria(sites);

  const select = (
    <div className={cn("relative", className)}>
      <select
        value={valor ?? ""}
        disabled={disabled}
        aria-label={label ?? "Site"}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "no-drag h-[32px] w-full appearance-none bg-surface pl-3 pr-8 text-[13px] text-text",
          "border border-rule focus:border-focus focus:outline-none disabled:opacity-40",
        )}
      >
        <option value="" disabled>
          Escolha um site
        </option>
        {grupos.map(([categoria, doGrupo]) => (
          <optgroup key={categoria} label={categoria}>
            {doGrupo.map((s) => (
              <option key={s.id} value={s.id} disabled={somenteConvite && !s.temConvite}>
                {s.slug}
                {somenteConvite && !s.temConvite ? " · sem convite.json" : ""}
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

  if (!label) return select;
  return (
    <label className="block">
      <span className="mb-1.5 block font-narrow font-semibold text-label uppercase text-muted">{label}</span>
      {select}
    </label>
  );
}
