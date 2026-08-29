import { useRef, useState, type ReactElement, type PointerEvent as ReactPointerEvent } from "react";
import { FolderOpen, Image as Icone, ListChecks, Stamp } from "lucide-react";
import {
  envelopeAbrirSaida,
  envelopeGerar,
  envelopeLista,
  envelopeModelo,
  envelopePasta,
  type Lista,
  type Modelo,
  type Saida,
} from "@/lib/api";
import { Button, Input } from "@/components/ui/primitives";
import { Topo } from "@/components/Topo";

type Marca = { x: number; y: number; l: number; a: number };

const MINIMO = 0.004;

export function Envelope(): ReactElement {
  const [modelo, setModelo] = useState<Modelo | null>(null);
  const [lista, setLista] = useState<Lista | null>(null);
  const [pasta, setPasta] = useState<string | null>(null);
  const [marca, setMarca] = useState<Marca | null>(null);
  const [padrao, setPadrao] = useState("Convite {nome}");
  const [semRepetidos, setSemRepetidos] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [saida, setSaida] = useState<Saida | null>(null);
  const [gerando, setGerando] = useState(false);

  const folha = useRef<HTMLImageElement>(null);
  const inicio = useRef<{ x: number; y: number } | null>(null);

  const pegar = <T,>(fn: () => Promise<T | null>, guardar: (v: T) => void) => (): void => {
    setErro(null);
    fn()
      .then((v) => v !== null && guardar(v))
      .catch((e: Error) => setErro(e.message));
  };

  const ponto = (e: ReactPointerEvent): { x: number; y: number } | null => {
    const el = folha.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1),
      y: Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1),
    };
  };

  const arrastar = (e: ReactPointerEvent): void => {
    if (!inicio.current) return;
    const p = ponto(e);
    if (!p) return;
    const a = inicio.current;
    setMarca({
      x: Math.min(a.x, p.x),
      y: Math.min(a.y, p.y),
      l: Math.abs(p.x - a.x),
      a: Math.abs(p.y - a.y),
    });
  };

  const soltar = (e: ReactPointerEvent): void => {
    inicio.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setMarca((m) => (m && (m.l < MINIMO || m.a < MINIMO) ? null : m));
  };

  // A página do PDF tem exatamente o tamanho da imagem, então basta escalar —
  // só o eixo Y inverte, porque no PDF a origem fica embaixo à esquerda.
  const emPontos = (m: Marca, mod: Modelo): number[] => [
    Math.round(m.x * mod.largura),
    Math.round((1 - (m.y + m.a)) * mod.altura),
    Math.round((m.x + m.l) * mod.largura),
    Math.round((1 - m.y) * mod.altura),
  ];

  const disparar = async (): Promise<void> => {
    if (!modelo || !lista || !marca) return;
    setGerando(true);
    setErro(null);
    setSaida(null);
    try {
      const r = await envelopeGerar({ rect: emPontos(marca, modelo), padrao, semRepetidos });
      setSaida(r);
      setPasta(r.pasta);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setGerando(false);
    }
  };

  const quantos = lista ? (semRepetidos ? lista.unicos : lista.total) : 0;
  const pronto = Boolean(modelo && lista && marca);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <Topo>
        <Button variant="ghost" onClick={pegar(envelopeModelo, setModelo)}>
          <Icone size={13} /> {modelo ? "Trocar convite" : "Convite"}
        </Button>
        <Button variant="ghost" onClick={pegar(envelopeLista, setLista)}>
          <ListChecks size={13} /> {lista ? "Trocar lista" : "Lista .txt"}
        </Button>
        <Button variant="ghost" onClick={pegar(envelopePasta, setPasta)}>
          <FolderOpen size={13} /> Pasta
        </Button>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          {pronto && (
            <span className="font-mono text-serial uppercase tracking-[0.16em] text-muted">
              {quantos} {quantos === 1 ? "pdf" : "pdfs"}
            </span>
          )}
          <Button variant="primary" size="sm" disabled={!pronto || gerando} onClick={() => void disparar()}>
            <Stamp size={13} /> {gerando ? "Carimbando…" : "Carimbar"}
          </Button>
        </div>
      </Topo>

      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-surface-2/40 p-8">
          {modelo ? (
            <div
              className="relative max-h-full max-w-full cursor-crosshair select-none"
              onPointerDown={(e) => {
                const p = ponto(e);
                if (!p) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                inicio.current = p;
                setMarca({ x: p.x, y: p.y, l: 0, a: 0 });
              }}
              onPointerMove={arrastar}
              onPointerUp={soltar}
            >
              <img
                ref={folha}
                src={modelo.dataUrl}
                alt={`Convite ${modelo.nome}`}
                draggable={false}
                className="block max-h-[calc(100vh-140px)] max-w-full object-contain"
              />
              {marca && (
                <div
                  className="pointer-events-none absolute border border-sage bg-sage/25"
                  style={{
                    left: `${marca.x * 100}%`,
                    top: `${marca.y * 100}%`,
                    width: `${marca.l * 100}%`,
                    height: `${marca.a * 100}%`,
                  }}
                >
                  <span className="absolute -top-5 left-0 whitespace-nowrap font-mono text-serial uppercase tracking-[0.14em] text-sage">
                    {emPontos(marca, modelo).join(" ")}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center">
              <p className="text-[13px] text-muted">Escolha a imagem do convite.</p>
              <p className="mt-2 font-mono text-[11px] text-muted/70">
                Vira PDF e ganha um botão invisível por cima — um arquivo por convidado.
              </p>
            </div>
          )}
        </div>

        <aside className="w-[268px] shrink-0 overflow-y-auto border-l border-rule px-5 py-6">
          <span className="font-mono text-label uppercase text-muted">Área do botão</span>
          <p className="mt-2 text-[12px] leading-[1.5] text-muted">
            {marca
              ? "Arraste de novo pra remarcar."
              : "Arraste por cima do convite onde o convidado vai tocar."}
          </p>

          <span className="mt-8 block font-mono text-label uppercase text-muted">Convidados</span>
          {lista ? (
            <>
              <p className="mt-2 break-all font-mono text-[11px] text-text/85">{lista.nome}</p>
              <p className="mt-1 text-[12px] text-muted">
                {lista.total} com link · {lista.unicos} nomes únicos
              </p>
              {lista.repetidos.length > 0 && (
                <p className="mt-2 border-l-2 border-accent pl-2 text-[11px] leading-[1.5] text-muted">
                  repetidos: {lista.repetidos.map((d) => `${d.nome} (${d.vezes}×)`).join(", ")}
                </p>
              )}
              <label className="mt-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={semRepetidos}
                  onChange={(e) => setSemRepetidos(e.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                <span className="text-[12px] text-muted">Pular nome repetido</span>
              </label>
            </>
          ) : (
            <p className="mt-2 text-[12px] leading-[1.5] text-muted">
              Um por linha, com o link. Nome antes ou depois, tanto faz.
            </p>
          )}

          <span className="mt-8 block font-mono text-label uppercase text-muted">Nome do arquivo</span>
          <Input
            value={padrao}
            onChange={(e) => setPadrao(e.target.value)}
            aria-label="Padrão do nome do arquivo"
            className="mt-2"
          />
          <p className="mt-1 text-[11px] text-muted/70">{"{nome}"} vira o nome do convidado.</p>

          <span className="mt-8 block font-mono text-label uppercase text-muted">Salvar em</span>
          <p className="mt-2 break-all font-mono text-[11px] text-text/85">
            {pasta ?? "saida/ ao lado do .txt"}
          </p>

          {saida && (
            <div className="mt-8 border-l-2 border-sage pl-3">
              <p className="text-[12px] text-text">
                {saida.feitos} {saida.feitos === 1 ? "PDF pronto" : "PDFs prontos"}
              </p>
              {saida.falhas.length > 0 && (
                <p className="mt-1 text-[11px] text-bad">{saida.falhas.length} falharam</p>
              )}
              <Button variant="ghost" className="mt-2 px-0" onClick={() => void envelopeAbrirSaida()}>
                Abrir pasta
              </Button>
            </div>
          )}

          {erro && (
            <pre className="mt-6 whitespace-pre-wrap border-l-2 border-bad pl-3 font-mono text-[11px] text-bad">
              {erro}
            </pre>
          )}
        </aside>
      </div>
    </div>
  );
}
