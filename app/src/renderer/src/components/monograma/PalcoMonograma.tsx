import { useRef, type PointerEvent as ReactPointerEvent, type ReactElement } from "react";
import { PRANCHETA, type Desenho } from "@/lib/monograma/geometria";
import {
  caixaMolduraArquivo,
  transformMoldura,
  type Composicao,
  type Guirlanda,
  type MolduraArquivo,
  type Papel,
} from "@/lib/monograma/composicao";

type Props = {
  comp: Composicao;
  desenho: Desenho | null;
  guirlanda: Guirlanda | null;
  molduraArquivo: MolduraArquivo | null;
  selecionada: Papel;
  mostrarCruzamentos: boolean;
  onSelecionar: (p: Papel) => void;
  /** `fim` só no soltar: o arraste inteiro vira um passo do histórico. */
  onMover: (p: Papel, x: number, y: number, fim: boolean) => void;
  onTrocarCruzamento: (i: number) => void;
};

type Pega = { papel: Papel; x0: number; y0: number; lx: number; ly: number; moveu: boolean };

/**
 * A prancheta de 1000px desenhada em SVG, na escala que couber. Por cima do
 * desenho cortado ficam os contornos crus de cada letra, invisíveis, só pra
 * pegar o clique — o desenho cortado tem buracos que deixariam o dedo cair.
 */
export function PalcoMonograma({
  comp,
  desenho,
  guirlanda,
  molduraArquivo,
  selecionada,
  mostrarCruzamentos,
  onSelecionar,
  onMover,
  onTrocarCruzamento,
}: Props): ReactElement {
  const svg = useRef<SVGSVGElement>(null);
  const pega = useRef<Pega | null>(null);

  const naPrancheta = (e: ReactPointerEvent): { x: number; y: number } | null => {
    const el = svg.current;
    const m = el?.getScreenCTM();
    if (!el || !m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };

  const agarrar = (papel: Papel) => (e: ReactPointerEvent<SVGPathElement>): void => {
    const p = naPrancheta(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    onSelecionar(papel);
    pega.current = { papel, x0: p.x, y0: p.y, lx: comp[papel].x, ly: comp[papel].y, moveu: false };
  };

  const posicao = (e: ReactPointerEvent): [number, number] | null => {
    const g = pega.current;
    const p = naPrancheta(e);
    if (!g || !p) return null;
    // O conjunto está escalado em torno do centro; o arraste anda na escala da letra.
    const dx = (p.x - g.x0) / comp.escala;
    const dy = (p.y - g.y0) / comp.escala;
    return [Math.round((g.lx + dx) * 10) / 10, Math.round((g.ly + dy) * 10) / 10];
  };

  const arrastar = (e: ReactPointerEvent): void => {
    const g = pega.current;
    const pos = posicao(e);
    if (!g || !pos) return;
    g.moveu = true;
    onMover(g.papel, pos[0], pos[1], false);
  };

  const soltar = (e: ReactPointerEvent<SVGPathElement>): void => {
    const g = pega.current;
    const pos = posicao(e);
    pega.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (g?.moveu && pos) onMover(g.papel, pos[0], pos[1], true);
  };

  const ordem: Papel[] = selecionada === "cursiva" ? ["serifada", "cursiva"] : ["cursiva", "serifada"];

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${PRANCHETA} ${PRANCHETA}`}
      className="block aspect-square h-full max-h-full w-auto max-w-full select-none rounded-xl bg-white shadow-flutua"
      role="img"
      aria-label={`Monograma ${comp.serifada.char}${comp.cursiva.char}`}
    >
      {comp.moldura.tipo === "arquivo" && molduraArquivo && (
        <image {...caixaMolduraArquivo(comp.moldura, molduraArquivo)} href={molduraArquivo.dataUrl} pointerEvents="none" />
      )}
      <g fill={comp.cor}>
        {comp.moldura.tipo === "guirlanda" && guirlanda && (
          <path transform={transformMoldura(comp.moldura, guirlanda)} d={guirlanda.d} />
        )}
        {desenho && <path d={desenho.d} />}
      </g>

      {desenho &&
        ordem.map((papel) => (
          <path
            key={papel}
            d={desenho.contorno[papel]}
            fill="transparent"
            // Contorno só sob o mouse: fixo, o tracejado engolia a cursiva fina inteira.
            stroke="none"
            strokeWidth={1}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
            pointerEvents="fill"
            className="cursor-grab hover:stroke-cyan active:cursor-grabbing"
            onPointerDown={agarrar(papel)}
            onPointerMove={arrastar}
            onPointerUp={soltar}
            onPointerCancel={soltar}
          >
            <title>{papel === "serifada" ? "Letra serifada" : "Letra cursiva"} — arraste pra mover</title>
          </path>
        ))}

      {mostrarCruzamentos &&
        desenho?.cruzamentos.map((c, i) => (
          <g
            key={`${Math.round(c.x)}-${Math.round(c.y)}`}
            transform={`translate(${c.x} ${c.y})`}
            className="cursor-pointer"
            onClick={() => onTrocarCruzamento(i)}
          >
            <title>Trocar quem passa por cima ({c.cima === "cursiva" ? "cursiva" : "serifada"} agora)</title>
            <circle r={22} fill="#FFFFFF" fillOpacity={0.9} stroke="var(--cyan)" strokeWidth={2.5} />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={20}
              fontWeight={700}
              fill="var(--cyan)"
              className="pointer-events-none"
            >
              {c.cima === "cursiva" ? "C" : "S"}
            </text>
          </g>
        ))}
    </svg>
  );
}
