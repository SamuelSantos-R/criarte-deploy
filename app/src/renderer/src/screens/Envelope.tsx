import { useEffect, useRef, useState, type ReactElement, type PointerEvent as ReactPointerEvent } from "react";
import { FolderOpen, Image as Icone, ListChecks, Stamp } from "lucide-react";
import {
  envelopeAbrirSaida,
  envelopeGerar,
  envelopeLinkUnico,
  envelopeLista,
  envelopeModelo,
  envelopePasta,
  type Lista,
  type Modelo,
  type Saida,
} from "@/lib/api";
import { Button, Input } from "@/components/ui/primitives";
import { Segmentado } from "@/components/ui/Segmentado";
import { Topo } from "@/components/Topo";

type Marca = { x: number; y: number; l: number; a: number };

const MINIMO = 0.004;

/** As oito alças do Canva: cantos redondos, lados em barrinha. */
const ALCAS: { lado: string; cursor: string; barra?: boolean; estilo: Record<string, string> }[] = [
  { lado: "nw", cursor: "nwse-resize", estilo: { left: "-6px", top: "-6px" } },
  { lado: "ne", cursor: "nesw-resize", estilo: { right: "-6px", top: "-6px" } },
  { lado: "sw", cursor: "nesw-resize", estilo: { left: "-6px", bottom: "-6px" } },
  { lado: "se", cursor: "nwse-resize", estilo: { right: "-6px", bottom: "-6px" } },
  { lado: "n", cursor: "ns-resize", barra: true, estilo: { left: "calc(50% - 10px)", top: "-4px", width: "20px", height: "7px" } },
  { lado: "s", cursor: "ns-resize", barra: true, estilo: { left: "calc(50% - 10px)", bottom: "-4px", width: "20px", height: "7px" } },
  { lado: "w", cursor: "ew-resize", barra: true, estilo: { top: "calc(50% - 10px)", left: "-4px", width: "7px", height: "20px" } },
  { lado: "e", cursor: "ew-resize", barra: true, estilo: { top: "calc(50% - 10px)", right: "-4px", width: "7px", height: "20px" } },
];

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
  const [modo, setModo] = useState<"lista" | "unico">("lista");
  const [link, setLink] = useState("");
  const [nomeUnico, setNomeUnico] = useState("");

  const folha = useRef<HTMLImageElement>(null);
  // Onde a imagem está dentro da moldura, em px. A marca era desenhada em % da
  // moldura mas medida na imagem: quando as duas não coincidiam, o retângulo
  // aparecia num sítio e o clique ficava gravado noutro.
  const [caixa, setCaixa] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const gesto = useRef<
    | { tipo: "novo"; a: { x: number; y: number } }
    | { tipo: "mover"; p0: { x: number; y: number }; m0: Marca }
    | { tipo: "alca"; lado: string; m0: Marca }
    | null
  >(null);

  const pegar = <T,>(fn: () => Promise<T | null>, guardar: (v: T) => void) => (): void => {
    setErro(null);
    fn()
      .then((v) => v !== null && guardar(v))
      .catch((e: Error) => setErro(e.message));
  };

  useEffect(() => {
    const el = folha.current;
    if (!el) return;
    const medir = (): void =>
      setCaixa({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    window.addEventListener("resize", medir);
    return () => {
      obs.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, [modelo]);

  const ponto = (e: ReactPointerEvent): { x: number; y: number } | null => {
    const el = folha.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1),
      y: Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1),
    };
  };

  // Como no Canva: arrastar no vazio desenha, por dentro move, e cada uma das
  // oito alças puxa só o seu lado (ou os dois do canto).
  const arrastar = (e: ReactPointerEvent): void => {
    const g = gesto.current;
    if (!g) return;
    const p = ponto(e);
    if (!p) return;
    const lim = (v: number): number => Math.min(Math.max(v, 0), 1);
    if (g.tipo === "novo") {
      setMarca({ x: Math.min(g.a.x, p.x), y: Math.min(g.a.y, p.y), l: Math.abs(p.x - g.a.x), a: Math.abs(p.y - g.a.y) });
      return;
    }
    const m = g.m0;
    if (g.tipo === "mover") {
      const x = Math.min(Math.max(m.x + p.x - g.p0.x, 0), 1 - m.l);
      const y = Math.min(Math.max(m.y + p.y - g.p0.y, 0), 1 - m.a);
      setMarca({ ...m, x, y });
      return;
    }
    let [x1, y1, x2, y2] = [m.x, m.y, m.x + m.l, m.y + m.a];
    if (g.lado.includes("w")) x1 = lim(p.x);
    if (g.lado.includes("e")) x2 = lim(p.x);
    if (g.lado.includes("n")) y1 = lim(p.y);
    if (g.lado.includes("s")) y2 = lim(p.y);
    setMarca({ x: Math.min(x1, x2), y: Math.min(y1, y2), l: Math.abs(x2 - x1), a: Math.abs(y2 - y1) });
  };

  const soltar = (e: ReactPointerEvent): void => {
    gesto.current = null;
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
        {modo === "lista" && (
          <Button variant="ghost" onClick={pegar(envelopeLista, setLista)}>
            <ListChecks size={13} /> {lista ? "Trocar lista" : "Lista .txt"}
          </Button>
        )}
        <Button variant="ghost" onClick={pegar(envelopePasta, setPasta)}>
          <FolderOpen size={13} /> Pasta
        </Button>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          {pronto && (
            <span className="font-narrow font-semibold text-gauge text-muted">
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
              className="relative cursor-crosshair select-none touch-none"
              onPointerDown={(e) => {
                const p = ponto(e);
                if (!p) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                const alvo = e.target as HTMLElement;
                const lado = alvo.closest<HTMLElement>("[data-alca]")?.dataset.alca;
                if (marca && lado) gesto.current = { tipo: "alca", lado, m0: marca };
                else if (marca && alvo.closest("[data-marca]")) gesto.current = { tipo: "mover", p0: p, m0: marca };
                else {
                  gesto.current = { tipo: "novo", a: p };
                  setMarca({ x: p.x, y: p.y, l: 0, a: 0 });
                }
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
                  data-marca
                  className="absolute cursor-move rounded-[3px] border-2 border-focus bg-focus/20 shadow-[0_0_0_1px_rgb(255_255_255/0.6)]"
                  style={{
                    left: caixa.left + marca.x * caixa.width,
                    top: caixa.top + marca.y * caixa.height,
                    width: marca.l * caixa.width,
                    height: marca.a * caixa.height,
                  }}
                >
                  {ALCAS.map(({ lado, estilo, cursor, barra }) => (
                    <span
                      key={lado}
                      data-alca={lado}
                      className={
                        barra
                          ? "absolute rounded-full border border-focus bg-white shadow-sm"
                          : "absolute h-3 w-3 rounded-full border-2 border-focus bg-white shadow-sm"
                      }
                      style={{ ...estilo, cursor }}
                    />
                  ))}
                  <span className="pointer-events-none absolute -top-6 left-0 whitespace-nowrap rounded bg-focus px-1.5 py-0.5 font-narrow text-[10px] font-semibold text-white">
                    {Math.round(marca.l * modelo.largura)} × {Math.round(marca.a * modelo.altura)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center">
              <p className="text-[13px] text-muted">Escolha a imagem do convite.</p>
              <p className="mt-2 font-mono text-[11px] text-muted">
                Vira PDF e ganha um botão invisível por cima — um arquivo por convidado.
              </p>
            </div>
          )}
        </div>

        <aside className="w-[268px] shrink-0 overflow-y-auto border-l border-rule px-5 py-6">
          <span className="font-narrow font-semibold text-label text-muted">Área do botão</span>
          <p className="mt-2 text-[12px] leading-normal text-muted">
            {marca
              ? "Puxe as alças pra ajustar cada lado, arraste por dentro pra mover, ou desenhe outra fora."
              : "Arraste por cima do convite onde o convidado vai tocar."}
          </p>

          <span className="mt-8 block font-narrow font-semibold text-label text-muted">Convidados</span>
          <Segmentado
            rotulo="De onde vêm os links"
            valor={modo}
            className="mt-2 w-full"
            onChange={(m) => {
              setModo(m);
              setLista(null);
              setErro(null);
            }}
            opcoes={[
              { valor: "lista", rotulo: "Lista .txt" },
              { valor: "unico", rotulo: "Link único" },
            ]}
          />
          {modo === "unico" ? (
            <form
              className="mt-3 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                pegar(() => envelopeLinkUnico({ url: link, nome: nomeUnico }), setLista)();
              }}
            >
              <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" aria-label="Link do convidado" spellCheck={false} />
              <Input value={nomeUnico} onChange={(e) => setNomeUnico(e.target.value)} placeholder="Nome (opcional)" aria-label="Nome do convidado" />
              <Button type="submit" variant="outline" className="w-full" disabled={!link.trim()}>
                {lista ? "Atualizar link" : "Usar este link"}
              </Button>
              {lista && (
                <p className="text-[12px] text-muted">
                  1 PDF para <span className="text-text">{lista.nome}</span>
                </p>
              )}
            </form>
          ) : lista ? (
            <>
              <p className="mt-2 break-all font-mono text-[11px] text-text">{lista.nome}</p>
              <p className="mt-1 text-[12px] text-muted">
                {lista.total} com link · {lista.unicos} nomes únicos
              </p>
              {lista.repetidos.length > 0 && (
                <p className="mt-2 rounded-lg bg-cyan/10 px-3 py-2 text-[11px] leading-normal text-muted">
                  repetidos: {lista.repetidos.map((d) => `${d.nome} (${d.vezes}×)`).join(", ")}
                </p>
              )}
              <label className="mt-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={semRepetidos}
                  onChange={(e) => setSemRepetidos(e.target.checked)}
                  className="h-4 w-4 accent-cyan"
                />
                <span className="text-[12px] text-muted">Pular nome repetido</span>
              </label>
            </>
          ) : (
            <p className="mt-2 text-[12px] leading-normal text-muted">
              Um por linha, com o link. Nome antes ou depois, tanto faz.
            </p>
          )}

          <span className="mt-8 block font-narrow font-semibold text-label text-muted">Nome do arquivo</span>
          <Input
            value={padrao}
            onChange={(e) => setPadrao(e.target.value)}
            aria-label="Padrão do nome do arquivo"
            className="mt-2"
          />
          <p className="mt-1 text-[11px] text-muted">{"{nome}"} vira o nome do convidado.</p>

          <span className="mt-8 block font-narrow font-semibold text-label text-muted">Salvar em</span>
          <p className="mt-2 break-all font-mono text-[11px] text-text">
            {pasta ?? (modo === "unico" ? "Transferências/Criarte Envelopes" : "saida/ ao lado do .txt")}
          </p>

          {saida && (
            <div className="mt-8 rounded-lg bg-focus/10 px-3 py-2">
              <p className="text-[12px] text-text">
                {saida.feitos} {saida.feitos === 1 ? "PDF pronto" : "PDFs prontos"}
              </p>
              {saida.falhas.length > 0 && (
                <p className="mt-1 text-[11px] text-pencil">{saida.falhas.length} falharam</p>
              )}
              <Button variant="ghost" className="mt-2 px-0" onClick={() => void envelopeAbrirSaida()}>
                Abrir pasta
              </Button>
            </div>
          )}

          {erro && (
            <pre className="mt-6 whitespace-pre-wrap rounded-lg bg-pencil/10 px-3 py-2 font-mono text-[11px] text-pencil">
              {erro}
            </pre>
          )}
        </aside>
      </div>
    </div>
  );
}
