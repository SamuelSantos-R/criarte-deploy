import { useEffect, useRef, useState, type ReactElement } from "react";
import { Ticket } from "lucide-react";
import { tokenEstado, tokenInjetar, type EstadoToken } from "@/lib/api";
import { Button } from "@/components/ui/primitives";

/**
 * Ligar a tokenização a um convite que não nasceu com ela. Opt-in por decisão:
 * ligar isto sozinho já partiu convites de base diferente, então o Studio
 * mostra primeiro o que vai mexer e recusa quando não reconhece o layout.
 */
export function Tokenizar({
  id,
  onFechar,
  onPronto,
}: {
  id: string;
  onFechar: () => void;
  onPronto: () => void;
}): ReactElement {
  const [estado, setEstado] = useState<EstadoToken | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);
  const cancelarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let vivo = true;
    tokenEstado(id)
      .then((e) => vivo && setEstado(e))
      .catch((e: Error) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [id]);

  useEffect(() => {
    cancelarRef.current?.focus();
  }, [estado]);

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

  const injetar = async (): Promise<void> => {
    setIndo(true);
    setErro(null);
    try {
      const novo = await tokenInjetar(id);
      setEstado(novo);
      if (novo.tokenizado) onPronto();
      else setErro("injetei o que dava, mas o convite ainda não ficou completo");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falhou");
    }
    setIndo(false);
  };

  const podeInjetar = estado !== null && !estado.tokenizado && estado.impedimento === null;

  return (
    <div
      className="no-drag fixed inset-0 z-50 flex items-center justify-center bg-ground/85 p-8"
      onMouseDown={(e) => e.target === e.currentTarget && onFechar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="token-titulo"
        className="w-[520px] bg-surface rounded-2xl border border-rule shadow-flutua"
      >
        <div className="border-b border-rule px-7 py-4">
          <h2 id="token-titulo" className="font-narrow font-semibold text-label text-text">
            Tokenizar convite
          </h2>
        </div>

        <div className="px-7 py-6">
          {estado === null && !erro && <p className="text-[12px] text-muted">A ver o convite…</p>}

          {estado?.tokenizado && (
            <p className="text-[12px] leading-[1.7] text-text">
              Este convite já está tokenizado. Falta só a lista de convidados: um
              <span className="font-mono"> .txt </span>
              com um nome por linha, escolhido no ecrã de publicar.
            </p>
          )}

          {estado && !estado.tokenizado && (
            <>
              <span className="font-narrow font-semibold text-label text-muted">Vai acrescentar</span>
              <ul className="mt-3 space-y-1.5">
                {estado.faltam.map((f) => (
                  <li key={f} className="border-l-[3px] border-cyan bg-surface-2 px-4 py-2 font-mono text-[12px] text-text">
                    {f}
                  </li>
                ))}
              </ul>

              {estado.impedimento ? (
                <p className="mt-5 text-[12px] leading-[1.6] text-pencil">{estado.impedimento}</p>
              ) : (
                <p className="mt-5 text-[12px] leading-[1.7] text-muted">
                  Nenhum ficheiro existente é substituído, e o layout só é tocado
                  por ter um <span className="font-mono">{"{children}"}</span> e um
                  só. A saudação pelo nome no topo do convite não entra aqui — o
                  Hero é diferente em cada convite e mexer nele às cegas foi o que
                  já partiu outros.
                </p>
              )}
            </>
          )}

          {erro && <p className="mt-4 text-[12px] leading-[1.6] text-pencil">{erro}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-rule px-7 py-3">
          <Button ref={cancelarRef} variant="ghost" onClick={onFechar} disabled={indo}>
            {estado?.tokenizado ? "Fechar" : "Cancelar"}
          </Button>
          {podeInjetar && (
            <Button variant="primary" onClick={() => void injetar()} disabled={indo}>
              <Ticket size={13} /> {indo ? "A injetar…" : "Injetar"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
