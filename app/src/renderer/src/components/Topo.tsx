import { type ReactElement, type ReactNode } from "react";

/**
 * Régua de controlo do ecrã. Já não abre folga para os semáforos: a margem de
 * chapa corre por cima dela, e é essa margem que arrasta a janela.
 */
export function Topo({ children }: { children: ReactNode }): ReactElement {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-rule bg-surface px-3">
      {children}
    </header>
  );
}
