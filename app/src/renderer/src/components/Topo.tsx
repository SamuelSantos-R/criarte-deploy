import { type ReactElement, type ReactNode } from "react";

/**
 * Faixa de arrastar da janela. O pl-9 não é estética: com o trilho em 44px os
 * semáforos do macOS terminam por volta de x=76, então os primeiros 36px
 * depois do trilho têm que ficar vazios.
 */
export function Topo({ children }: { children: ReactNode }): ReactElement {
  return (
    <header className="drag-region flex h-[52px] shrink-0 items-center gap-3 border-b border-rule pl-9 pr-5">
      {children}
    </header>
  );
}
