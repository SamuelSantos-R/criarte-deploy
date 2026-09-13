import { useCallback, useEffect, useState, type ReactElement } from "react";
import { Download, RefreshCw } from "lucide-react";
import {
  atualizacaoInstalar,
  atualizacaoVerificar,
  onAtualizacaoProgresso,
  type EstadoAtualizacao,
  type ProgressoAtualizacao,
} from "@/lib/api";
import { Button, Rule } from "@/components/ui/primitives";

const FASE: Record<ProgressoAtualizacao["fase"], string> = {
  baixar: "A baixar",
  verificar: "A conferir o ficheiro",
  preparar: "A preparar a troca",
  reiniciar: "A reabrir o Studio",
};

const mb = (bytes: number): string => `${Math.round(bytes / 1024 / 1024)} MB`;

/** Troca o Studio pela versão publicada no R2, sem instalador passado de mão em mão. */
export function AtualizacaoStudio(): ReactElement {
  const [estado, setEstado] = useState<EstadoAtualizacao | null>(null);
  const [procurando, setProcurando] = useState(false);
  const [progresso, setProgresso] = useState<ProgressoAtualizacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const procurar = useCallback(async (): Promise<void> => {
    setProcurando(true);
    setErro(null);
    try {
      setEstado(await atualizacaoVerificar());
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setProcurando(false);
    }
  }, []);

  useEffect(() => {
    void procurar();
  }, [procurar]);

  useEffect(() => onAtualizacaoProgresso(setProgresso), []);

  const instalar = async (): Promise<void> => {
    setErro(null);
    setProgresso({ fase: "baixar", feito: 0, total: estado?.bytes ?? 0 });
    try {
      await atualizacaoInstalar();
    } catch (e) {
      setProgresso(null);
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  const pct = progresso && progresso.total > 0 ? Math.min(100, Math.round((progresso.feito / progresso.total) * 100)) : 0;

  return (
    <>
      <Rule>Atualização do Studio</Rule>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-muted">
            {estado === null ? (
              procurando ? "A procurar versão nova…" : "Não deu pra ver se há versão nova."
            ) : estado.nova ? (
              <>
                Versão <span className="font-mono text-text">{estado.nova}</span> disponível — esta é a{" "}
                <span className="font-mono">{estado.atual}</span>. O Studio fecha, troca-se e abre de novo sozinho.
              </>
            ) : (
              <>
                Está na versão mais nova (<span className="font-mono text-text">{estado.atual}</span>).
              </>
            )}
          </p>
          {estado?.nova && estado.notas && (
            <p className="mt-2 whitespace-pre-line rounded-lg bg-surface px-3 py-2 text-[12px] text-text">{estado.notas}</p>
          )}
          {progresso && (
            <div className="mt-3" role="status" aria-live="polite">
              <div className="h-1.5 overflow-hidden rounded-full bg-rule">
                <div className="h-full bg-cyan transition-[width] duration-150" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 font-mono text-[11px] text-muted">
                {FASE[progresso.fase]}
                {progresso.fase === "baixar" && progresso.total > 0 && ` — ${mb(progresso.feito)} de ${mb(progresso.total)}`}
              </p>
            </div>
          )}
          {estado?.nova && estado.impedimento && (
            <p className="mt-2 text-[12px] text-pencil">Não dá pra instalar daqui: {estado.impedimento}.</p>
          )}
          {erro && <p className="mt-2 font-mono text-[11px] text-pencil">{erro}</p>}
        </div>
        {estado?.nova ? (
          <Button
            variant="outline"
            size="md"
            disabled={progresso !== null || estado.impedimento !== null}
            onClick={() => void instalar()}
          >
            <Download size={13} /> Atualizar ({mb(estado.bytes)})
          </Button>
        ) : (
          <Button variant="outline" size="md" disabled={procurando} onClick={() => void procurar()}>
            <RefreshCw size={13} /> Procurar
          </Button>
        )}
      </div>
    </>
  );
}
