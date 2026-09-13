import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Maximize, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const MIN = 0.5;
const MAX = 8;
const PASSOS = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];

/**
 * A prancheta cabe inteira na tela em 100%; acima disso ela cresce e o palco
 * rola, pra ver de perto o respiro de um cruzamento. Cmd/Ctrl + roda do mouse
 * (ou pinça no trackpad) aproxima em volta do cursor; Cmd + = / − / 0 também.
 */
export function ZoomPrancheta({ ativo, children }: { ativo: boolean; children: ReactNode }): ReactElement {
  const palco = useRef<HTMLDivElement>(null);
  const [lado, setLado] = useState(0);
  const [zoom, setZoom] = useState(1);
  const alvo = useRef<{ fx: number; fy: number; cx: number; cy: number } | null>(null);

  useLayoutEffect(() => {
    const el = palco.current;
    if (!el) return;
    const medir = (): void => setLado(Math.max(0, Math.min(el.clientWidth, el.clientHeight) - 48));
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  /** Muda o zoom mantendo parado o ponto da prancheta que está sob (cx, cy) do palco. */
  const aplicar = useCallback((novo: number, cx?: number, cy?: number) => {
    const el = palco.current;
    const z = Math.min(MAX, Math.max(MIN, Math.round(novo * 100) / 100));
    if (!el) return setZoom(z);
    const px = cx ?? el.clientWidth / 2;
    const py = cy ?? el.clientHeight / 2;
    // Fração da área rolável sob o cursor, antes de crescer.
    alvo.current = {
      fx: (el.scrollLeft + px) / Math.max(1, el.scrollWidth),
      fy: (el.scrollTop + py) / Math.max(1, el.scrollHeight),
      cx: px,
      cy: py,
    };
    setZoom(z);
  }, []);

  // Depois de o DOM crescer, rola pra devolver o ponto ao mesmo lugar do cursor.
  useLayoutEffect(() => {
    const el = palco.current;
    const a = alvo.current;
    if (!el || !a) return;
    el.scrollLeft = a.fx * el.scrollWidth - a.cx;
    el.scrollTop = a.fy * el.scrollHeight - a.cy;
    alvo.current = null;
  }, [zoom]);

  const passo = (dir: 1 | -1): void => {
    const prox = dir > 0 ? PASSOS.find((p) => p > zoom + 0.001) : [...PASSOS].reverse().find((p) => p < zoom - 0.001);
    aplicar(prox ?? zoom);
  };

  useEffect(() => {
    const el = palco.current;
    if (!el) return;
    const roda = (e: WheelEvent): void => {
      if (!e.metaKey && !e.ctrlKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setZoom((z) => {
        const novo = Math.min(MAX, Math.max(MIN, z * Math.exp(-e.deltaY * 0.01)));
        alvo.current = {
          fx: (el.scrollLeft + e.clientX - r.left) / Math.max(1, el.scrollWidth),
          fy: (el.scrollTop + e.clientY - r.top) / Math.max(1, el.scrollHeight),
          cx: e.clientX - r.left,
          cy: e.clientY - r.top,
        };
        return Math.round(novo * 100) / 100;
      });
    };
    el.addEventListener("wheel", roda, { passive: false });
    return () => el.removeEventListener("wheel", roda);
  }, []);

  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      if (!ativo || (!e.metaKey && !e.ctrlKey)) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        passo(1);
      } else if (e.key === "-") {
        e.preventDefault();
        passo(-1);
      } else if (e.key === "0") {
        e.preventDefault();
        aplicar(1);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  const tamanho = lado * zoom;

  return (
    <div className="relative flex min-h-0 w-full flex-1">
      <div ref={palco} className="min-h-0 flex-1 overflow-auto">
        {/* min-w/min-h a 100% centram a prancheta enquanto cabe; maior, o palco rola. */}
        <div className="grid min-h-full min-w-full place-items-center p-6" style={{ width: tamanho + 48, height: tamanho + 48 }}>
          <div style={{ width: tamanho, height: tamanho }}>{lado > 0 && children}</div>
        </div>
      </div>

      <div className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-xl border border-rule bg-surface p-1 shadow-painel">
        <BotaoZoom rotulo="Afastar (Cmd −)" onClick={() => passo(-1)} disabled={zoom <= MIN}>
          <Minus size={14} />
        </BotaoZoom>
        <button
          type="button"
          onClick={() => aplicar(1)}
          title="Voltar a caber na tela (Cmd 0)"
          className="gauge h-8 min-w-[52px] rounded-lg px-2 text-[12px] font-semibold text-text hover:bg-surface-2"
        >
          {Math.round(zoom * 100)}%
        </button>
        <BotaoZoom rotulo="Aproximar (Cmd +)" onClick={() => passo(1)} disabled={zoom >= MAX}>
          <Plus size={14} />
        </BotaoZoom>
        <span className="mx-0.5 h-5 w-px bg-rule" />
        <BotaoZoom rotulo="Caber na tela" onClick={() => aplicar(1)} disabled={zoom === 1}>
          <Maximize size={14} />
        </BotaoZoom>
      </div>
    </div>
  );
}

function BotaoZoom({
  rotulo,
  onClick,
  disabled,
  children,
}: {
  rotulo: string;
  onClick: () => void;
  disabled: boolean;
  children: ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={rotulo}
      aria-label={rotulo}
      className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text disabled:opacity-35")}
    >
      {children}
    </button>
  );
}
