import { type ReactElement } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, FolderOpen, MoreHorizontal, PenLine, Ticket, Trash2, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NumeroAnimado } from "@/components/ui/NumeroAnimado";
import { cn } from "@/lib/utils";

/**
 * O coop mora num ícone. Fechado é só o bonequinho; aberto veste a tinta magenta
 * e cresce com a contagem de quem está do outro lado — sem ninguém, um ponto a
 * pulsar diz que a sessão está à espera.
 */
export function BotaoCoop({
  ligado,
  outros,
  aberto,
  onClick,
}: {
  ligado: boolean;
  outros: number;
  aberto: boolean;
  onClick: () => void;
}): ReactElement {
  const rotulo = ligado
    ? outros > 0
      ? `Coop — ${outros} ${outros === 1 ? "pessoa conectada" : "pessoas conectadas"}`
      : "Coop aberta — à espera de alguém"
    : "Abrir sessão coop";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          type="button"
          layout
          aria-pressed={aberto}
          aria-label={rotulo}
          onClick={onClick}
          whileTap={{ scale: 0.92 }}
          transition={{ type: "spring", stiffness: 500, damping: 34 }}
          className={cn(
            "no-drag relative flex h-9 shrink-0 items-center gap-1.5 overflow-hidden rounded-full px-2.5 text-[12px] font-semibold transition-colors",
            ligado
              ? "bg-magenta text-on-magenta shadow-sm"
              : aberto
                ? "bg-surface-2 text-text"
                : "text-muted hover:bg-surface-2 hover:text-text",
          )}
        >
          <motion.span layout="position" className="flex">
            <Users size={16} strokeWidth={1.9} aria-hidden />
          </motion.span>
          <AnimatePresence initial={false}>
            {ligado && (
              <motion.span
                key="contagem"
                layout="position"
                initial={{ opacity: 0, width: 0, filter: "blur(4px)" }}
                animate={{ opacity: 1, width: "auto", filter: "blur(0px)" }}
                exit={{ opacity: 0, width: 0, filter: "blur(4px)" }}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                className="flex items-center"
              >
                {outros > 0 ? (
                  <NumeroAnimado valor={outros} className="min-w-[1ch] justify-center" />
                ) : (
                  <span className="relative flex h-2 w-2" aria-hidden>
                    <span className="absolute inset-0 animate-ping rounded-full bg-on-magenta/70" />
                    <span className="relative h-2 w-2 rounded-full bg-on-magenta" />
                  </span>
                )}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {rotulo}
      </TooltipContent>
    </Tooltip>
  );
}

type Acoes = {
  convidado: boolean;
  podeSalvarComoNovo: boolean;
  temSite: boolean;
  onSalvarComoNovo: () => void;
  onRenomear: () => void;
  onTokenizar: () => void;
  onAbrirPasta: () => void;
  onApagar: () => void;
};

const item = "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-text focus:bg-surface-2";

/** O que se faz de vez em quando fica guardado atrás dos três pontos. */
export function MenuConvite(a: Acoes): ReactElement | null {
  const donoDoSite = a.temSite && !a.convidado;
  if (!a.podeSalvarComoNovo && !donoDoSite) return null;
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger
            aria-label="Mais ações do convite"
            className="no-drag flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-text data-[state=open]:bg-surface-2 data-[state=open]:text-text"
          >
            <MoreHorizontal size={17} />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          Mais ações
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" sideOffset={8} className="w-56 rounded-xl border-rule bg-surface p-1.5 text-text shadow-flutua">
        {a.podeSalvarComoNovo && (
          <DropdownMenuItem className={item} onSelect={a.onSalvarComoNovo}>
            <Copy size={15} className="text-muted" /> {a.convidado ? "Salvar aqui" : "Salvar como novo"}
          </DropdownMenuItem>
        )}
        {donoDoSite && (
          <>
            <DropdownMenuItem className={item} onSelect={a.onRenomear}>
              <PenLine size={15} className="text-muted" /> Renomear
            </DropdownMenuItem>
            <DropdownMenuItem className={item} onSelect={a.onTokenizar}>
              <Ticket size={15} className="text-muted" /> Tokenizar
            </DropdownMenuItem>
            <DropdownMenuItem className={item} onSelect={a.onAbrirPasta}>
              <FolderOpen size={15} className="text-muted" /> Abrir pasta
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-1 h-px bg-rule" />
            <DropdownMenuItem className={cn(item, "text-pencil focus:bg-pencil/10 focus:text-pencil")} onSelect={a.onApagar}>
              <Trash2 size={15} /> Apagar convite
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
