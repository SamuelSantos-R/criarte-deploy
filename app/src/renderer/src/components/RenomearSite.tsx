import { useEffect, useRef, useState, type ReactElement } from "react";
import { renomearSite } from "@/lib/api";
import { Button, Field, Input } from "@/components/ui/primitives";

const NOME = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Trocar o nome de um convite já salvo. A pasta muda, o `site.json` passa a
 * publicar com o nome novo e o Supabase aprende o slug — o uuid do mural fica o
 * mesmo, então os recados já deixados seguem no convite.
 *
 * O que não muda é o que já está no ar: a VPS continua a servir o endereço
 * antigo até alguém o apagar no painel. O aviso diz isso em vez de deixar o
 * Heatz descobrir com o convite duplicado na internet.
 */
export function RenomearSite({
  id,
  onFechar,
  onPronto,
}: {
  id: string;
  onFechar: () => void;
  onPronto: (novoId: string) => void;
}): ReactElement {
  const [categoria, atual] = [id.split("/")[0] ?? "", id.split("/")[1] ?? ""];
  const [slug, setSlug] = useState(atual);
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);
  const campoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    campoRef.current?.select();
  }, []);

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

  const limpo = slug.trim().toLowerCase();
  const valido = NOME.test(limpo) && limpo !== atual;

  const confirmar = async (): Promise<void> => {
    if (!valido || indo) return;
    setIndo(true);
    setErro(null);
    try {
      const { id: novo } = await renomearSite(id, limpo);
      onPronto(novo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falhou");
      setIndo(false);
    }
  };

  return (
    <div
      className="no-drag fixed inset-0 z-50 flex items-center justify-center bg-ground/85 p-8"
      onMouseDown={(e) => e.target === e.currentTarget && onFechar()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="renomear-titulo"
        onSubmit={(e) => {
          e.preventDefault();
          void confirmar();
        }}
        className="w-[480px] border-l-2 border-cyan bg-surface shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)]"
      >
        <div className="border-b border-rule px-7 py-4">
          <h2
            id="renomear-titulo"
            className="font-narrow font-semibold text-label uppercase tracking-[0.18em] text-text"
          >
            Renomear convite
          </h2>
        </div>

        <div className="px-7 py-6">
          <Field label="Nome novo">
            <Input
              ref={campoRef}
              value={slug}
              disabled={indo}
              spellCheck={false}
              autoCapitalize="off"
              onChange={(e) => setSlug(e.target.value)}
              className="font-mono"
            />
          </Field>

          <p className="mt-3 font-mono text-[12px] text-muted">
            {categoria}/{atual} <span className="text-text">→</span>{" "}
            <span className="text-text">
              {categoria}/{NOME.test(limpo) ? limpo : "…"}
            </span>
          </p>

          {slug.trim() !== "" && !NOME.test(limpo) && (
            <p className="mt-2 text-[12px] text-pencil">Só minúsculas, números e hífen.</p>
          )}
          {erro && <p className="mt-2 text-[12px] text-pencil">{erro}</p>}

          <p className="mt-5 text-[12px] leading-[1.7] text-muted">
            Os recados já deixados continuam neste convite — o mural não anda
            pelo nome. Mas o que já foi publicado fica no endereço antigo até
            apagares por lá; renomear aqui não mexe na VPS.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-rule px-7 py-3">
          <Button type="button" variant="ghost" onClick={onFechar} disabled={indo}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={!valido || indo}>
            {indo ? "Renomeando…" : "Renomear"}
          </Button>
        </div>
      </form>
    </div>
  );
}
