import { type ReactElement } from "react";
import { useProva } from "@/lib/prova";
import { BarraDeCor } from "@/components/BarraDeCor";
import { SeletorTema } from "@/components/SeletorTema";
import { LogoCriarte } from "./LogoCriarte";

// Os semáforos do macOS flutuam por cima da barra; no Windows não existem e a
// marca tem de encostar à esquerda. PRODUCT.md proíbe assumir um dos dois.
const MAC = navigator.userAgent.includes("Macintosh");

/** A marca, o convite na mesa, os estados e o tema. É também a pega da janela. */
export function BarraTopo({ sites }: { sites: number }): ReactElement {
  const { prova } = useProva();
  return (
    <header
      className="drag-region flex h-14 shrink-0 items-center gap-4 pr-3"
      style={{ paddingLeft: MAC ? 88 : 16 }}
    >
      <div className="flex items-center gap-2.5">
        <LogoCriarte className="h-7 w-7 shrink-0" />
        <span className="text-[14px] font-bold tracking-[-0.01em] text-text">Criarte Studio</span>
      </div>

      <span className="h-5 w-px bg-rule" />

      <div className="min-w-0">
        {prova.site ? (
          <p className="truncate text-[13px] font-semibold text-text" title={prova.site}>
            {prova.site.split("/").pop()}
            <span className="ml-2 font-normal text-muted">{prova.site.split("/")[0]}</span>
          </p>
        ) : (
          <p className="text-[13px] text-muted">Nenhum convite aberto</p>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <BarraDeCor />
        <span className="h-5 w-px bg-rule" />
        <span className="gauge text-[11px] font-medium text-muted" title="Convites na pasta de sites">
          {sites} {sites === 1 ? "convite" : "convites"}
        </span>
        <SeletorTema />
      </div>
    </header>
  );
}
