import { useEffect, useRef, useState, type ReactElement } from "react";
import { apagarSite, estadoSlug, type EstadoSlug } from "@/lib/api";
import { Button, Field, Input } from "@/components/ui/primitives";

/**
 * Apagar um convite: a pasta em disco e o registo no Supabase, de uma vez.
 *
 * Antes só existia criar e renomear, e o registo ficava para trás sempre que a
 * pasta era apagada pelo Finder — o nome continuava reservado e o Studio
 * recusava-o com um 409 que ninguém sabia desfazer sem ir ao SQL.
 *
 * A contagem de recados é lida antes de perguntar seja o que for, porque é ela
 * que decide o peso do aviso: um convite de teste apaga-se sem drama, um com
 * recados de convidados leva a escrever o nome à mão para confirmar.
 */
export function ApagarSite({
  id,
  onFechar,
  onPronto,
}: {
  id: string;
  onFechar: () => void;
  onPronto: () => void;
}): ReactElement {
  const [categoria, slug] = [id.split("/")[0] ?? "", id.split("/")[1] ?? ""];
  const [estado, setEstado] = useState<EstadoSlug | null>(null);
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);
  const campoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelado = false;
    void estadoSlug(categoria, slug)
      .then((e) => !cancelado && setEstado(e))
      .catch(() => !cancelado && setEstado({ slug, registado: false, temPasta: true, recados: 0 }));
    return () => {
      cancelado = true;
    };
  }, [categoria, slug]);

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

  // Só se exige escrever o nome quando há recados a perder. Pedir confirmação
  // para tudo ensina a escrever sem ler, e aí o aviso deixa de valer nas vezes
  // em que era mesmo preciso.
  const perigoso = (estado?.recados ?? 0) > 0;
  const pronto = estado !== null && !indo;
  const valido = pronto && (!perigoso || confirmacao.trim().toLowerCase() === slug);

  const confirmar = async (): Promise<void> => {
    if (!valido) return;
    setIndo(true);
    setErro(null);
    try {
      await apagarSite(id);
      onPronto();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não foi possível apagar");
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
        aria-labelledby="apagar-titulo"
        onSubmit={(e) => {
          e.preventDefault();
          void confirmar();
        }}
        className="w-[480px] bg-surface rounded-2xl border border-rule shadow-flutua"
      >
        <div className="border-b border-rule px-7 py-4">
          <h2
            id="apagar-titulo"
            className="font-narrow font-semibold text-label text-text"
          >
            Apagar convite
          </h2>
        </div>

        <div className="px-7 py-6">
          <p className="font-mono text-[12px] text-text">
            {categoria}/{slug}
          </p>

          {estado === null ? (
            <p className="mt-4 text-[12px] text-muted">A ver o que existe com este nome…</p>
          ) : (
            <>
              <ul className="mt-4 space-y-1.5 text-[12px] leading-[1.7] text-muted">
                <li>
                  <span className="text-text">A pasta</span> deste convite sai do disco.
                </li>
                {estado.registado && (
                  <li>
                    <span className="text-text">O nome</span> deixa de estar reservado no
                    Supabase e pode voltar a ser usado.
                  </li>
                )}
                <li>
                  {estado.recados > 0 ? (
                    <>
                      <span className="text-text">
                        {estado.recados} recado{estado.recados === 1 ? "" : "s"}
                      </span>{" "}
                      do mural {estado.recados === 1 ? "é apagado" : "são apagados"} — escritos
                      por convidados, e isto não se desfaz.
                    </>
                  ) : (
                    <>O mural está vazio, não se perde nenhum recado.</>
                  )}
                </li>
              </ul>

              <p className="mt-4 text-[12px] leading-[1.7] text-muted">
                O que já está publicado continua no ar: apagar aqui não mexe na VPS.
              </p>

              {perigoso && (
                <div className="mt-5">
                  <Field label={`Escreve ${slug} para confirmar`}>
                    <Input
                      ref={campoRef}
                      value={confirmacao}
                      disabled={indo}
                      spellCheck={false}
                      autoCapitalize="off"
                      onChange={(e) => setConfirmacao(e.target.value)}
                      className="font-mono"
                    />
                  </Field>
                </div>
              )}
            </>
          )}

          {erro && <p className="mt-3 text-[12px] text-pencil">{erro}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-rule px-7 py-3">
          <Button type="button" variant="ghost" onClick={onFechar} disabled={indo}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={!valido}>
            {indo ? "Apagando…" : "Apagar convite"}
          </Button>
        </div>
      </form>
    </div>
  );
}
