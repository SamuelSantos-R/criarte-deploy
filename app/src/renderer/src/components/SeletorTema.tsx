import { type ReactElement } from "react";
import { Check, Palette } from "lucide-react";
import { TEMAS, useTema } from "@/lib/tema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function Amostra({ cores }: { cores: [string, string] }): ReactElement {
  return (
    <span
      aria-hidden
      className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full border border-rule"
      style={{ background: cores[0] }}
    >
      <span className="absolute inset-y-0 right-0 w-1/2" style={{ background: cores[1] }} />
    </span>
  );
}

export function SeletorTema(): ReactElement {
  const [tema, setTema] = useTema();
  const atual = TEMAS.find((t) => t.id === tema) ?? TEMAS[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="no-drag flex h-9 items-center gap-2 rounded-lg px-2.5 text-[12px] font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-text"
        aria-label={`Tema: ${atual.nome}`}
      >
        <Palette size={15} />
        <Amostra cores={atual.amostra} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-52 rounded-xl border-rule bg-surface p-1.5 text-text shadow-flutua">
        <DropdownMenuLabel className="px-2 pb-1.5 text-[11px] font-semibold text-muted">Tema do Studio</DropdownMenuLabel>
        {TEMAS.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onSelect={() => setTema(t.id)}
            className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] focus:bg-surface-2", t.id === tema && "font-semibold")}
          >
            <Amostra cores={t.amostra} />
            <span className="flex-1">{t.nome}</span>
            {t.id === tema && <Check size={14} className="text-cyan" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
