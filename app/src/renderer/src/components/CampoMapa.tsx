import { useEffect, useRef, useState, type ReactElement } from "react";
import { MapPin, Search } from "lucide-react";
import { mapaBuscar, type Lugar } from "@/lib/api";
import { Field, Input } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * O campo "Mapa" de um evento. Antes era abrir o navegador, procurar no Google
 * Maps, copiar e colar; agora escreve-se o sítio aqui, escolhe-se da lista e o
 * link fica gravado. O link continua editável à mão por baixo.
 *
 * `sugestao` é o que já está no cartão (local + morada): a busca começa por aí.
 */
export function CampoMapa({
  valor,
  label,
  sugestao,
  onChange,
  onEscolher,
}: {
  valor: string;
  label: string;
  sugestao: string;
  onChange: (link: string) => void;
  /**
   * Um lugar escolhido da lista: link e morada numa gravação só. Duas chamadas
   * seguidas partiam do mesmo estado e a segunda apagava a primeira.
   */
  onEscolher: (link: string, morada: string) => void;
}): ReactElement {
  const [consulta, setConsulta] = useState("");
  const [lugares, setLugares] = useState<Lugar[]>([]);
  const [aberto, setAberto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ativo, setAtivo] = useState(0);
  const pedido = useRef(0);
  const campo = useRef<HTMLInputElement>(null);

  // Espera a pessoa parar de escrever: a Photon é um serviço público, sem pressa de martelar.
  useEffect(() => {
    const q = consulta.trim();
    if (q.length < 3) {
      setLugares([]);
      return;
    }
    const meu = ++pedido.current;
    const t = setTimeout(() => {
      setBuscando(true);
      setErro(null);
      mapaBuscar(q)
        .then((r) => {
          if (meu !== pedido.current) return;
          setLugares(r);
          setAtivo(0);
          setAberto(true);
        })
        .catch((e: unknown) => meu === pedido.current && setErro(e instanceof Error ? e.message : String(e)))
        .finally(() => meu === pedido.current && setBuscando(false));
    }, 350);
    return () => clearTimeout(t);
  }, [consulta]);

  const escolher = (l: Lugar): void => {
    onEscolher(l.link, l.morada);
    setAberto(false);
    setConsulta("");
  };

  return (
    <div className="col-span-2 space-y-2">
      <Field label={label}>
        <Input value={valor} onChange={(e) => onChange(e.target.value)} placeholder="https://maps…" spellCheck={false} />
      </Field>
      <div className="relative">
        <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <Input
          ref={campo}
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          onFocus={() => {
            if (!consulta && sugestao) {
              setConsulta(sugestao);
              // Selecionada: Enter procura a sugestão, escrever substitui-a.
              requestAnimationFrame(() => campo.current?.select());
            } else if (lugares.length) setAberto(true);
          }}
          onBlur={() => setTimeout(() => setAberto(false), 150)}
          onKeyDown={(e) => {
            if (!aberto || lugares.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setAtivo((a) => Math.min(a + 1, lugares.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setAtivo((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              escolher(lugares[ativo]);
            } else if (e.key === "Escape") setAberto(false);
          }}
          placeholder="Procurar o sítio — hotel, igreja, salão…"
          aria-label="Procurar endereço no mapa"
          className="pl-8"
          spellCheck={false}
        />
        {buscando && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted">a procurar…</span>}
        {aberto && (
          <ul
            role="listbox"
            className="absolute z-20 mt-1 max-h-[260px] w-full overflow-y-auto rounded-lg border border-rule bg-surface shadow-flutua"
          >
            {lugares.length === 0 && <li className="px-3 py-2 text-[12px] text-muted">Nada encontrado. Tente o nome do bairro ou da cidade.</li>}
            {lugares.map((l, i) => (
              <li key={`${l.lat},${l.lon}`} role="option" aria-selected={i === ativo}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => escolher(l)}
                  onMouseEnter={() => setAtivo(i)}
                  className={cn("flex w-full items-start gap-2 px-3 py-2 text-left", i === ativo && "bg-surface-2")}
                >
                  <MapPin size={13} className="mt-0.5 shrink-0 text-muted" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-text">{l.nome}</span>
                    {l.morada && <span className="block truncate text-[11px] text-muted">{l.morada}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {erro && <p className="text-[11px] text-pencil">{erro}</p>}
    </div>
  );
}
