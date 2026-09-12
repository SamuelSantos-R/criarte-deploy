import { useEffect, type ReactElement } from "react";
import { X } from "lucide-react";
import type { CartaoMonograma } from "@/lib/api";
import { BibliotecaMonogramas } from "./BibliotecaMonogramas";

/** A biblioteca aberta por cima do convite: clicar num monograma usa o SVG dele no campo. */
export function EscolherMonograma({
  onEscolher,
  onFechar,
}: {
  onEscolher: (c: CartaoMonograma) => void;
  onFechar: () => void;
}): ReactElement {
  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onFechar();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onFechar]);

  return (
    <div
      className="no-drag fixed inset-0 z-50 flex items-center justify-center bg-ground/85 p-8"
      onMouseDown={(e) => e.target === e.currentTarget && onFechar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="escolher-monograma-titulo"
        className="light flex h-[min(720px,90vh)] w-[min(960px,92vw)] flex-col border-l-2 border-cyan bg-ground text-text shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)]"
      >
        <div className="flex items-center border-b border-rule px-6 py-4">
          <h2 id="escolher-monograma-titulo" className="font-narrow text-label font-semibold uppercase tracking-[0.18em] text-text">
            Monograma da biblioteca
          </h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="ml-auto p-1 text-muted hover:text-text">
            <X size={15} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-6 pt-4">
          <BibliotecaMonogramas acao="Usar" onEscolher={onEscolher} />
        </div>
      </div>
    </div>
  );
}
