import { useEffect, useRef, useState, type ReactElement } from "react";
import { Rocket } from "lucide-react";
import { destinoPublicacao } from "@/lib/api";
import { Button } from "@/components/ui/primitives";

/**
 * O último sítio onde dá para desistir. O CLI corre com `--yes` porque a tela de
 * deploy é log a correr e não tem onde responder a pergunta; então a pergunta
 * mudou de sítio e passou a ser esta. Só aparece na publicação a sério — o
 * ensaio não mexe no que está no ar e não tem de pedir licença a ninguém.
 */
export function ConfirmarPublicacao({
  siteId,
  validade,
  convidados,
  onCancelar,
  onPublicar,
}: {
  siteId: string;
  validade: string;
  convidados: string | null;
  onCancelar: () => void;
  onPublicar: () => void;
}): ReactElement {
  const [url, setUrl] = useState<string | null>(null);
  const [lendo, setLendo] = useState(true);
  const cancelarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let vivo = true;
    destinoPublicacao(siteId)
      .then((d) => vivo && setUrl(d.url))
      .catch(() => vivo && setUrl(null))
      .finally(() => {
        if (vivo) setLendo(false);
      });
    return () => {
      vivo = false;
    };
  }, [siteId]);

  // O foco começa no Cancelar: quem chegou aqui com o Enter engatilhado não
  // publica sem querer.
  useEffect(() => {
    cancelarRef.current?.focus();
  }, []);

  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancelar();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onCancelar]);

  return (
    <div
      className="no-drag fixed inset-0 z-50 flex items-center justify-center bg-ground/85 p-8"
      onMouseDown={(e) => e.target === e.currentTarget && onCancelar()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="publicar-titulo"
        className="w-[520px] border-l-2 border-pencil bg-surface shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)]"
      >
        <div className="border-b border-rule px-7 py-4">
          <h2
            id="publicar-titulo"
            className="font-narrow font-semibold text-label uppercase tracking-[0.18em] text-text"
          >
            Publicar a sério
          </h2>
        </div>

        <div className="px-7 py-6">
          <span className="font-narrow font-semibold text-label uppercase text-muted">Vai substituir</span>
          <p className="mt-3 border-l-[3px] border-pencil bg-surface-2 px-4 py-3 font-mono text-[15px] leading-[1.4] text-text">
            {lendo ? "…" : (url ?? `${siteId} — destino desconhecido`)}
          </p>

          {!lendo && !url && (
            <p className="mt-3 text-[12px] leading-[1.6] text-pencil">
              O endereço do painel não está no config do CLI, então não dá para
              mostrar onde isto aterra. Confere antes de seguir.
            </p>
          )}

          <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[12px]">
            <dt className="font-narrow font-semibold text-label uppercase text-muted">Validade</dt>
            <dd className="text-text">{validade}</dd>
            <dt className="font-narrow font-semibold text-label uppercase text-muted">Convidados</dt>
            <dd className="text-text">
              {convidados ? convidados.split("/").pop() : "sem lista — sobe em prévia"}
            </dd>
          </dl>

          <p className="mt-5 text-[12px] leading-[1.7] text-muted">
            O convite que está no ar é apagado e reconstruído na VPS. Quem já tem
            o link vê a versão nova na recarga seguinte — não há como voltar
            atrás sem publicar outra vez.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-rule px-7 py-3">
          <Button ref={cancelarRef} variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={onPublicar}>
            <Rocket size={13} /> Publicar agora
          </Button>
        </div>
      </div>
    </div>
  );
}
