import { useEffect, useState, type ReactElement } from "react";
import { Loader2, Mail, RefreshCw, Trash2, X } from "lucide-react";
import { apagarRecado, lerRecados, type Recado } from "@/lib/api";
import { Button } from "@/components/ui/primitives";

// O mural é público: qualquer convidado escreve. Faltava o outro lado — apagar
// o recado de teste que a noiva deixou, ou o que não devia estar lá. Até aqui
// isso só se fazia no SQL à mão.

function quando(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function CorreioDoAmor({ siteId, onFechar }: { siteId: string; onFechar: () => void }): ReactElement {
  const [recados, setRecados] = useState<Recado[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [apagando, setApagando] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);

  const carregar = (): void => {
    setErro(null);
    setRecados(null);
    void lerRecados(siteId)
      .then(setRecados)
      .catch((e: Error) => {
        setErro(e.message);
        setRecados([]);
      });
  };

  useEffect(carregar, [siteId]);

  const apagar = async (id: string): Promise<void> => {
    setApagando(id);
    setErro(null);
    try {
      await apagarRecado(siteId, id);
      setRecados((r) => (r ?? []).filter((x) => x.id !== id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setApagando(null);
      setConfirmar(null);
    }
  };

  return (
    <div
      className="no-drag fixed inset-0 z-50 flex items-start justify-center bg-ground/80 pt-[10vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onFechar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Correio do amor"
        className="flex max-h-[76vh] w-[560px] flex-col rounded-2xl border border-rule bg-surface shadow-flutua"
      >
        <div className="flex items-center gap-2 border-b border-rule px-5 py-4">
          <Mail size={15} className="text-muted" />
          <h2 className="font-narrow font-semibold text-label text-text">Correio do amor</h2>
          <span className="truncate font-mono text-[11px] text-muted">{siteId}</span>
          <button onClick={carregar} aria-label="Recarregar" className="ml-auto p-1 text-muted hover:text-text">
            <RefreshCw size={13} />
          </button>
          <button onClick={onFechar} aria-label="Fechar" className="p-1 text-muted hover:text-text">
            <X size={14} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {recados === null ? (
            <p className="flex items-center gap-2 text-[12px] text-muted">
              <Loader2 size={13} className="animate-spin" /> a ler o mural…
            </p>
          ) : recados.length === 0 ? (
            <p className="text-[12px] text-muted">
              {erro ? erro : "Nenhum recado ainda — o mural deste convite está vazio."}
            </p>
          ) : (
            <ul className="space-y-2">
              {recados.map((r) => (
                <li key={r.id} className="rounded-xl border border-rule px-3 py-2.5">
                  <div className="flex items-baseline gap-2">
                    <span className="font-narrow font-semibold text-label text-text">{r.nome || "sem nome"}</span>
                    <span className="font-mono text-[10px] text-muted">{quando(r.quando)}</span>
                    {confirmar === r.id ? (
                      <span className="ml-auto flex items-center gap-2">
                        <span className="text-[11px] text-pencil">apagar de vez?</span>
                        <Button size="sm" variant="danger" disabled={apagando === r.id} onClick={() => void apagar(r.id)}>
                          {apagando === r.id ? "…" : "Sim"}
                        </Button>
                        <button onClick={() => setConfirmar(null)} className="text-[11px] text-muted hover:text-text">
                          não
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmar(r.id)}
                        aria-label={`Apagar recado de ${r.nome || "sem nome"}`}
                        className="ml-auto p-1 text-muted transition-colors hover:text-pencil"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-text">{r.texto}</p>
                </li>
              ))}
            </ul>
          )}
          {erro && recados !== null && recados.length > 0 && (
            <p className="mt-3 rounded-lg bg-pencil/10 px-3 py-2 text-[12px] text-pencil">{erro}</p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-rule px-5 py-3">
          <span className="text-[11px] text-muted">
            {recados === null ? "" : `${recados.length} recado(s) · apagar é definitivo`}
          </span>
          <Button variant="ghost" className="ml-auto" onClick={onFechar}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
