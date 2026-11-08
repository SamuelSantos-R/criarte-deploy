import { useEffect, useRef, useState, type ReactElement } from "react";
import { Check, Pause, Play, Search, TriangleAlert } from "lucide-react";
import { musicaBuscar, musicaPrevia, musicaUsar, type Faixa } from "@/lib/api";
import { Button, Input } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Procurar a música, ouvir e escolher onde começa — sem YouTube aberto, sem
 * site de conversão, sem arrastar ficheiro para a pasta. O mp3 cortado vai
 * direto para public/assets do convite e o caminho entra em `musica.arquivo`.
 */
export function BuscarMusica({
  siteId,
  musica,
  onChange,
}: {
  siteId: string;
  musica: Record<string, unknown>;
  onChange: (campo: "arquivo" | "titulo" | "artista", valor: string) => void;
}): ReactElement {
  const titulo = typeof musica.titulo === "string" ? musica.titulo.trim() : "";
  const artista = typeof musica.artista === "string" ? musica.artista.trim() : "";
  const [consulta, setConsulta] = useState([artista, titulo].filter(Boolean).join(" "));
  const [faixas, setFaixas] = useState<Faixa[] | null>(null);
  const [escolhida, setEscolhida] = useState<Faixa | null>(null);
  const [audio, setAudio] = useState<string | null>(null);
  const [duracao, setDuracao] = useState(0);
  const [inicio, setInicio] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [estado, setEstado] = useState<"livre" | "buscando" | "baixando" | "gravando">("livre");
  const [erro, setErro] = useState<string | null>(null);
  const [gravado, setGravado] = useState<string | null>(null);
  const player = useRef<HTMLAudioElement>(null);

  useEffect(() => () => void (audio && URL.revokeObjectURL(audio)), [audio]);

  const falhou = (e: unknown): void => {
    setErro(e instanceof Error ? e.message : String(e));
    setEstado("livre");
  };

  const buscar = (): void => {
    if (consulta.trim().length < 2 || estado !== "livre") return;
    setEstado("buscando");
    setErro(null);
    musicaBuscar(consulta)
      .then((r) => {
        setFaixas(r);
        setEstado("livre");
      })
      .catch(falhou);
  };

  const escolher = (f: Faixa): void => {
    if (estado !== "livre") return;
    player.current?.pause();
    setTocando(false);
    setEscolhida(f);
    setGravado(null);
    setInicio(0);
    setAudio(null);
    setEstado("baixando");
    setErro(null);
    musicaPrevia(f.id)
      .then((bytes) => {
        setAudio(URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" })));
        setDuracao(f.duracao);
        setEstado("livre");
      })
      .catch(falhou);
  };

  const ouvir = (): void => {
    const el = player.current;
    if (!el) return;
    if (tocando) {
      el.pause();
      setTocando(false);
      return;
    }
    el.currentTime = inicio;
    void el.play();
    setTocando(true);
  };

  const usar = (): void => {
    if (!escolhida || estado !== "livre") return;
    player.current?.pause();
    setTocando(false);
    setEstado("gravando");
    setErro(null);
    musicaUsar(siteId, escolhida.id, inicio, artista, titulo || escolhida.titulo)
      .then(({ arquivo }) => {
        onChange("arquivo", arquivo);
        setGravado(arquivo);
        setEstado("livre");
      })
      .catch(falhou);
  };

  return (
    <div className="mb-5 space-y-3 rounded-xl border border-rule p-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
            placeholder="Artista e nome da música"
            aria-label="Procurar música"
            className="pl-8"
          />
        </div>
        <Button variant="ghost" onClick={buscar} disabled={estado !== "livre"}>
          {estado === "buscando" ? "Procurando…" : "Procurar"}
        </Button>
      </div>

      {faixas && faixas.length === 0 && <p className="text-[12px] text-muted">Nada encontrado. Tente só o nome da música.</p>}

      {faixas && faixas.length > 0 && (
        <ul className="space-y-1.5" role="listbox" aria-label="Versões encontradas">
          {faixas.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                role="option"
                aria-selected={escolhida?.id === f.id}
                onClick={() => escolher(f)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-2 py-1.5 text-left transition-colors",
                  escolhida?.id === f.id ? "border-text bg-surface-2" : "border-rule hover:border-muted",
                )}
              >
                <img src={f.capa} alt="" className="h-10 w-16 shrink-0 rounded object-cover" loading="lazy" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-text">{f.titulo}</span>
                  <span className="flex items-center gap-1.5 truncate text-[11px] text-muted">
                    {f.canal}
                    {f.duracao > 0 && ` · ${mmss(f.duracao)}`}
                    {f.versaoSuspeita && (
                      <span className="inline-flex items-center gap-0.5 text-pencil">
                        <TriangleAlert size={10} /> ao vivo / versão
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {estado === "baixando" && <p className="text-[12px] text-muted">Baixando a prévia… (uns segundos)</p>}

      {audio && escolhida && (
        <div className="space-y-2 border-t border-rule pt-3">
          <audio
            ref={player}
            src={audio}
            onLoadedMetadata={(e) => setDuracao(e.currentTarget.duration || escolhida.duracao)}
            onEnded={() => setTocando(false)}
          />
          <div className="flex items-center justify-between text-[11px] text-muted">
            <span>
              Começa em <b className="font-mono text-text">{mmss(inicio)}</b>
            </span>
            <span className="font-mono">{mmss(duracao)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0, Math.floor(duracao) - 5)}
            step={0.5}
            value={inicio}
            onChange={(e) => {
              const v = Number(e.target.value);
              setInicio(v);
              setGravado(null);
              if (player.current && tocando) player.current.currentTime = v;
            }}
            aria-label="Ponto de início da música"
            className="no-drag w-full accent-cyan"
          />
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={ouvir}>
              {tocando ? <Pause size={13} /> : <Play size={13} />} {tocando ? "Parar" : "Ouvir daqui"}
            </Button>
            {inicio > 0 && (
              <Button variant="ghost" onClick={() => setInicio(0)}>
                Do início
              </Button>
            )}
            <Button variant="primary" className="ml-auto" onClick={usar} disabled={estado !== "livre"}>
              {gravado ? <Check size={13} /> : null}
              {estado === "gravando" ? "Gravando…" : gravado ? "No convite" : `Usar a partir de ${mmss(inicio)}`}
            </Button>
          </div>
          {gravado && <p className="font-mono text-[11px] text-muted">{gravado} — falta salvar o convite.</p>}
        </div>
      )}

      {erro && <p className="rounded-lg bg-pencil/10 px-3 py-2 text-[12px] text-pencil">{erro}</p>}
    </div>
  );
}
