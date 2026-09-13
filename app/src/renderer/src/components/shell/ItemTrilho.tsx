import { type ReactElement } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Uma ferramenta no trilho, como no Canva: ícone num ladrilho com o nome
 * por baixo. O nome fica sempre à vista — quem entra de vez em quando lê,
 * não decifra. Ativa, o ladrilho ganha a tinta principal do tema.
 */
export function ItemTrilho({
  rotulo,
  Icone,
  ativo,
  bloqueado,
  onClick,
}: {
  rotulo: string;
  Icone: LucideIcon;
  ativo: boolean;
  bloqueado: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      disabled={bloqueado}
      onClick={onClick}
      aria-current={ativo ? "page" : undefined}
      className="no-drag group flex w-full flex-col items-center gap-1 py-1.5 disabled:pointer-events-none disabled:opacity-35"
    >
      <span
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl transition-[background-color,color,transform] duration-200 ease-out group-active:scale-95",
          ativo ? "bg-cyan text-on-cyan shadow-sm" : "text-muted group-hover:bg-surface-2 group-hover:text-text",
        )}
      >
        <Icone size={19} strokeWidth={ativo ? 2.2 : 1.9} />
      </span>
      <span
        className={cn(
          "max-w-[72px] truncate text-[11px] leading-tight transition-colors",
          ativo ? "font-bold text-text" : "font-medium text-muted group-hover:text-text",
        )}
      >
        {rotulo}
      </span>
    </button>
  );
}
