import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from "react";
import { Crosshair, ImageOff } from "lucide-react";
import { lerPosicao, escreverPosicao } from "@/lib/posicao";
import { ReguaMonograma } from "@/components/monograma/ReguaMonograma";
import { cn } from "@/lib/utils";

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;

type Pega = { x0: number; y0: number; offX0: number; offY0: number };

/**
 * Arrasta pra reposicionar, régua pra dar zoom — o mesmo par `posicao`+`zoom`
 * que o site já lê com `object-position` e `transform: scale()`. A conta do
 * arraste usa o tamanho real da imagem, então "arrasta 20px" desloca sempre a
 * mesma fatia, esteja a foto no zoom que estiver.
 */
export function CropVisual({
  dataUrl,
  carregando,
  posicao,
  zoom,
  aspecto,
  onMudar,
}: {
  dataUrl: string | null;
  carregando: boolean;
  posicao: string;
  zoom: number;
  /** CSS `aspect-ratio`, ex. "2 / 3". */
  aspecto: string;
  onMudar: (posicao: string, zoom: number) => void;
}): ReactElement {
  const caixa = useRef<HTMLDivElement>(null);
  const pega = useRef<Pega | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [arrastando, setArrastando] = useState(false);

  const { x, y } = lerPosicao(posicao);
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;

  /** Deslocamento máximo (px) da imagem cobrindo a caixa neste zoom — a mesma conta do `object-fit: cover`. */
  const deslocamentoMax = (): { mx: number; my: number; bw: number; bh: number } | null => {
    const el = caixa.current;
    if (!el || !natural) return null;
    const bw = el.clientWidth;
    const bh = el.clientHeight;
    const cobre = Math.max(bw / natural.w, bh / natural.h) * z;
    return { mx: Math.max(0, natural.w * cobre - bw), my: Math.max(0, natural.h * cobre - bh), bw, bh };
  };

  const agarrar = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!natural) return;
    const d = deslocamentoMax();
    if (!d) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setArrastando(true);
    pega.current = { x0: e.clientX, y0: e.clientY, offX0: d.mx * (x / 100), offY0: d.my * (y / 100) };
  };

  const arrastar = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const g = pega.current;
    const d = deslocamentoMax();
    if (!g || !d) return;
    // Drag em px de tela; no zoom a imagem está maior, então 1px de tela vale menos px de imagem.
    const novoOffX = g.offX0 - (e.clientX - g.x0) / z;
    const novoOffY = g.offY0 - (e.clientY - g.y0) / z;
    const novoX = d.mx > 0 ? (Math.min(d.mx, Math.max(0, novoOffX)) / d.mx) * 100 : 50;
    const novoY = d.my > 0 ? (Math.min(d.my, Math.max(0, novoOffY)) / d.my) * 100 : 50;
    onMudar(escreverPosicao(novoX, novoY), z);
  };

  const soltar = (e: ReactPointerEvent<HTMLDivElement>): void => {
    pega.current = null;
    setArrastando(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  return (
    <div>
      <div
        ref={caixa}
        onPointerDown={agarrar}
        onPointerMove={arrastar}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        style={{ aspectRatio: aspecto }}
        className={cn(
          "no-drag relative w-full select-none overflow-hidden rounded-xl bg-surface-2",
          dataUrl && natural ? (arrastando ? "cursor-grabbing" : "cursor-grab") : "cursor-default",
        )}
      >
        {dataUrl ? (
          <img
            src={dataUrl}
            alt=""
            draggable={false}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: `${x}% ${y}%`, transform: `scale(${z})` }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-muted">
            <ImageOff size={18} strokeWidth={1.6} />
            <span className="text-[11px]">{carregando ? "Carregando…" : "Escolha uma foto pra recortar"}</span>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1">
          <ReguaMonograma
            rotulo="Zoom"
            valor={z}
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            passo={0.05}
            unidade="×"
            onChange={(novo) => onMudar(posicao, novo)}
          />
        </div>
        <button
          type="button"
          onClick={() => onMudar(escreverPosicao(50, 50), 1)}
          title="Recentralizar e zerar o zoom"
          aria-label="Recentralizar e zerar o zoom"
          disabled={!dataUrl}
          className="no-drag flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rule text-muted transition-colors hover:border-rule-strong hover:text-text disabled:opacity-40"
        >
          <Crosshair size={14} />
        </button>
      </div>
    </div>
  );
}
