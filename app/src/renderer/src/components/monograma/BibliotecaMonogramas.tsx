import { useCallback, useEffect, useState, type ReactElement } from "react";
import { RefreshCw, Search, Trash2 } from "lucide-react";
import { bibliotecaApagar, bibliotecaListar, type CartaoMonograma } from "@/lib/api";
import { Button, Input } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

type Props = {
  /** Rótulo da ação principal do cartão: "Abrir" na tela, "Usar" no convite. */
  acao: string;
  onEscolher: (c: CartaoMonograma) => void;
  /** Só a tela de Monogramas apaga; o seletor do convite não. */
  podeApagar?: boolean;
  /** Muda quando alguém salva, pra grade recarregar sem clicar. */
  versao?: number;
};

const data = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

export function BibliotecaMonogramas({ acao, onEscolher, podeApagar = false, versao = 0 }: Props): ReactElement {
  const [lista, setLista] = useState<CartaoMonograma[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [apagando, setApagando] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setErro(null);
    bibliotecaListar()
      .then(setLista)
      .catch((e: Error) => setErro(e.message));
  }, []);

  useEffect(carregar, [carregar, versao]);

  const apagar = async (id: string): Promise<void> => {
    setApagando(id);
    setErro(null);
    try {
      await bibliotecaApagar(id);
      setLista((l) => l?.filter((c) => c.id !== id) ?? null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setApagando(null);
      setConfirmar(null);
    }
  };

  const termo = busca.trim().toLowerCase();
  const visiveis = (lista ?? []).filter(
    (c) => !termo || c.nome.toLowerCase().includes(termo) || c.iniciais.toLowerCase().includes(termo),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 pb-4">
        <div className="relative w-[260px]">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Casal ou iniciais" className="pl-8" aria-label="Buscar monograma" />
        </div>
        <Button variant="ghost" onClick={carregar} title="Recarregar a biblioteca" aria-label="Recarregar a biblioteca">
          <RefreshCw size={13} />
        </Button>
        <span className="ml-auto font-narrow text-gauge font-semibold uppercase text-muted">
          {lista ? `${lista.length} ${lista.length === 1 ? "monograma" : "monogramas"}` : ""}
        </span>
      </div>

      {erro && <p className="mb-3 border-l-2 border-pencil pl-2 font-mono text-[11px] text-pencil">{erro}</p>}
      {!lista && !erro && <p className="font-mono text-[12px] text-muted">Lendo a biblioteca…</p>}
      {lista && visiveis.length === 0 && (
        <p className="text-[13px] text-muted">{lista.length === 0 ? "A biblioteca ainda está vazia." : "Nada com esse nome."}</p>
      )}

      <ul className="grid min-h-0 grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 overflow-y-auto pb-4">
        {visiveis.map((c) => (
          <li key={c.id} className="group flex flex-col border border-rule bg-surface">
            <button
              type="button"
              onClick={() => onEscolher(c)}
              className="no-drag block aspect-square w-full bg-white p-3"
              title={`${acao} ${c.nome}`}
            >
              <img src={c.png} alt={`Monograma ${c.nome}`} loading="lazy" className="h-full w-full object-contain" />
            </button>
            <div className="flex items-start gap-2 border-t border-rule px-2.5 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] text-text">{c.nome}</p>
                <p className="truncate font-mono text-[10px] text-muted">
                  {c.iniciais} · {data(c.atualizado)}
                  {c.autor ? ` · ${c.autor}` : ""}
                </p>
              </div>
              {podeApagar &&
                (confirmar === c.id ? (
                  <Button variant="danger" size="sm" disabled={apagando === c.id} onClick={() => void apagar(c.id)}>
                    {apagando === c.id ? "…" : "Apagar"}
                  </Button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmar(c.id)}
                    aria-label={`Apagar ${c.nome}`}
                    title="Apagar da biblioteca"
                    className={cn("no-drag shrink-0 p-1 text-muted opacity-0 transition-opacity hover:text-pencil group-hover:opacity-100 focus-visible:opacity-100")}
                  >
                    <Trash2 size={13} />
                  </button>
                ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
