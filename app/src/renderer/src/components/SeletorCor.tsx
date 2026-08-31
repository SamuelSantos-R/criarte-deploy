import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Pipette } from "lucide-react";
import { cn } from "@/lib/utils";

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function hexValido(v: string): boolean {
  return HEX.test(v);
}

/** `#abc` e `#aabbcc` sao a mesma cor, mas so a forma longa serve de valor de input. */
export function expandir(hex: string): string {
  const h = hex.slice(1);
  return h.length === 3 ? `#${h.replace(/./g, (c) => c + c)}` : hex.toUpperCase();
}

type HSV = { h: number; s: number; v: number };

function hexParaHsv(hex: string): HSV {
  const n = parseInt(expandir(hex).slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvParaHex({ h, s, v }: HSV): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const t = Math.floor(h / 60) % 6;
  const rgb = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][t];
  const par = (n: number): string =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${par(rgb[0])}${par(rgb[1])}${par(rgb[2])}`.toUpperCase();
}

/** Preto ou branco por cima da amostra, decidido pela luminancia relativa. */
function contraste(hex: string): string {
  const n = parseInt(expandir(hex).slice(1), 16);
  const canal = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l =
    0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
  return l > 0.36 ? "#101010" : "#FFFFFF";
}

interface EyeDropperCtor {
  new (): { open(): Promise<{ sRGBHex: string }> };
}

function Paleta({
  hex,
  onChange,
  onFechar,
  ancora,
}: {
  hex: string;
  onChange: (novo: string) => void;
  onFechar: () => void;
  ancora: DOMRect;
}): ReactElement {
  const [hsv, setHsv] = useState<HSV>(() => hexParaHsv(hex));
  const [rascunho, setRascunho] = useState(expandir(hex));
  const areaRef = useRef<HTMLDivElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: -9999, left: -9999 });

  // Segue o valor de fora enquanto ninguem esta a arrastar aqui dentro.
  useEffect(() => {
    if (hexValido(hex) && expandir(hex) !== hsvParaHex(hsv)) {
      setHsv(hexParaHsv(hex));
      setRascunho(expandir(hex));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hex]);

  useLayoutEffect(() => {
    const caixa = caixaRef.current;
    if (!caixa) return;
    const alt = caixa.offsetHeight;
    const larg = caixa.offsetWidth;
    // Abre para baixo; se nao couber, sobe. Nunca sai da janela.
    const top = Math.min(Math.max(8, ancora.bottom + 6), window.innerHeight - alt - 8);
    const left = Math.min(Math.max(8, ancora.left), window.innerWidth - larg - 8);
    setPos({ top, left });
  }, [ancora]);

  const aplicar = (proximo: HSV): void => {
    setHsv(proximo);
    const novo = hsvParaHex(proximo);
    setRascunho(novo);
    onChange(novo);
  };

  const daPosicao = (e: { clientX: number; clientY: number }): void => {
    const r = areaRef.current?.getBoundingClientRect();
    if (!r) return;
    const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    aplicar({ ...hsv, s, v });
  };

  const setaNaArea = (e: React.KeyboardEvent): void => {
    const passo = e.shiftKey ? 0.1 : 0.02;
    const mapa: Record<string, [number, number]> = {
      ArrowLeft: [-passo, 0],
      ArrowRight: [passo, 0],
      ArrowUp: [0, passo],
      ArrowDown: [0, -passo],
    };
    const d = mapa[e.key];
    if (!d) return;
    e.preventDefault();
    aplicar({
      ...hsv,
      s: Math.min(1, Math.max(0, hsv.s + d[0])),
      v: Math.min(1, Math.max(0, hsv.v + d[1])),
    });
  };

  const conta_gotas = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onFechar} aria-hidden />
      <div
        ref={caixaRef}
        role="dialog"
        aria-label="Escolher cor"
        style={{ top: pos.top, left: pos.left }}
        onKeyDown={(e) => e.key === "Escape" && onFechar()}
        className="fixed z-50 w-[236px] border border-rule-strong bg-surface shadow-[0_18px_50px_-12px_rgba(0,0,0,0.65)]"
      >
        <div
          ref={areaRef}
          tabIndex={0}
          role="slider"
          aria-label="Saturacao e brilho"
          aria-valuetext={`saturacao ${Math.round(hsv.s * 100)}%, brilho ${Math.round(hsv.v * 100)}%`}
          onKeyDown={setaNaArea}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            daPosicao(e);
          }}
          onPointerMove={(e) => e.buttons === 1 && daPosicao(e)}
          className="relative h-[132px] w-full cursor-crosshair focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-accent"
          style={{
            background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`,
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
            style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
          />
        </div>

        <div className="flex items-center gap-2.5 border-t border-rule px-2.5 py-2.5">
          <input
            type="range"
            min={0}
            max={359}
            value={Math.round(hsv.h)}
            aria-label="Matiz"
            onChange={(e) => aplicar({ ...hsv, h: Number(e.target.value) })}
            className="no-drag h-3 flex-1 cursor-pointer appearance-none rounded-none bg-transparent focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent [&::-webkit-slider-runnable-track]:h-3 [&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)] [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-[7px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[#101010] [&::-webkit-slider-thumb]:bg-white"
          />
          {conta_gotas && (
            <button
              type="button"
              title="Apanhar cor do ecra"
              aria-label="Apanhar cor do ecra"
              onClick={() => {
                void new conta_gotas()
                  .open()
                  .then((r) => aplicar(hexParaHsv(r.sRGBHex)))
                  .catch(() => undefined);
              }}
              className="no-drag grid h-7 w-7 shrink-0 place-items-center border border-rule text-muted hover:border-accent hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-accent"
            >
              <Pipette size={13} strokeWidth={1.7} aria-hidden />
            </button>
          )}
        </div>

        <div className="flex items-center border-t border-rule">
          <span
            aria-hidden
            className="h-8 w-8 shrink-0 border-r border-rule"
            style={{ backgroundColor: hsvParaHex(hsv) }}
          />
          <input
            value={rascunho}
            spellCheck={false}
            aria-label="Codigo hexadecimal"
            onChange={(e) => {
              const v = e.target.value;
              setRascunho(v);
              if (hexValido(v)) {
                setHsv(hexParaHsv(v));
                onChange(expandir(v));
              }
            }}
            className={cn(
              "no-drag min-w-0 flex-1 bg-transparent px-2.5 py-2 font-mono text-[12px] uppercase",
              "focus:bg-surface-2 focus:outline-none",
              hexValido(rascunho) ? "text-text" : "text-bad",
            )}
          />
        </div>
      </div>
    </>,
    document.body,
  );
}

export function SeletorCor({
  valor,
  rotulo,
  onChange,
}: {
  valor: string;
  rotulo: string;
  onChange: (novo: string) => void;
}): ReactElement {
  const [ancora, setAncora] = useState<DOMRect | null>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const valido = hexValido(valor);

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={ancora !== null}
        title={`Escolher a cor de ${rotulo}`}
        onClick={() =>
          setAncora(ancora ? null : (botaoRef.current?.getBoundingClientRect() ?? null))
        }
        style={valido ? { backgroundColor: valor, color: contraste(valor) } : undefined}
        className={cn(
          "no-drag relative w-[46px] shrink-0 self-stretch",
          "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
          !valido && "bg-surface-2 text-bad",
        )}
      >
        {valido ? (
          // O ponto so aparece no hover: em repouso a coluna e cor pura, mas
          // ninguem tem de adivinhar que a amostra e clicavel.
          <span className="pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition-opacity hover:opacity-100 [button:focus-visible>&]:opacity-100 [button:hover>&]:opacity-100">
            <Pipette size={13} strokeWidth={1.8} aria-hidden />
          </span>
        ) : (
          <AlertTriangle
            size={13}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            aria-hidden
          />
        )}
      </button>
      {ancora && (
        <Paleta
          hex={valido ? valor : "#808080"}
          ancora={ancora}
          onChange={onChange}
          onFechar={() => setAncora(null)}
        />
      )}
    </>
  );
}
