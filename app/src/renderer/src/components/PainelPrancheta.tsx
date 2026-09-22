import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from "react";
import { FlipHorizontal, FlipVertical, Plus, Trash2 } from "lucide-react";
import { CampoArquivo } from "@/components/CampoArquivo";
import { LinhaMedida, type Medida } from "@/components/PainelMedidas";
import { lerSvgDoSite, previaDeAsset } from "@/lib/api";
import { ALTURA, LARGURA, cantoEFolga, type Canto } from "@/lib/prancheta";
import { cn } from "@/lib/utils";

// PRANCHETA — o retrato de telemóvel em que as molduras do painel RSVP foram
// desenhadas. Ela arrasta dentro deste quadro e a moldura cola no canto mais
// próximo; o que fica guardado é a folga até esse canto, em percentagem. Assim o
// desenho chega igual a um ecrã maior ou menor, que é como o painel já se
// comporta — o quadro é a régua, não o tamanho final.
type Moldura = {
  arquivo: string;
  canto: Canto;
  folgaX: number;
  folgaY: number;
  largura: number;
  espelhoX: boolean;
  espelhoY: boolean;
};

const MOLDURA_NOVA: Moldura = {
  arquivo: "",
  canto: "superior-esquerdo",
  folgaX: 0,
  folgaY: 0,
  largura: 37,
  espelhoX: false,
  espelhoY: false,
};

const LARGURA_MEDIDA: Medida = {
  chave: "largura",
  rotulo: "largura",
  dica: "Percentagem da largura do ecrã, como a prancheta. O painel nasceu com 37.",
  min: 5,
  max: 100,
  passo: 1,
  padrao: 37,
  unidade: "%",
};

function comoMoldura(valor: unknown): Moldura {
  const o = (valor ?? {}) as Record<string, unknown>;
  const num = (v: unknown, padrao: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : padrao;
  const canto = typeof o.canto === "string" ? (o.canto as Canto) : MOLDURA_NOVA.canto;
  return {
    arquivo: typeof o.arquivo === "string" ? o.arquivo : "",
    canto,
    folgaX: num(o.folgaX, 0),
    folgaY: num(o.folgaY, 0),
    largura: num(o.largura, 37),
    espelhoX: o.espelhoX === true,
    espelhoY: o.espelhoY === true,
  };
}

/** A arte da moldura como `data:`, pro quadro mostrar o desenho de verdade. */
function usarArte(siteId: string | null | undefined, arquivo: string): string | null {
  const [arte, setArte] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    setArte(null);
    if (!siteId || !arquivo) return;
    const pedido = arquivo.toLowerCase().endsWith(".svg")
      ? lerSvgDoSite(siteId, arquivo).then((svg) =>
          svg ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}` : null,
        )
      : previaDeAsset(siteId, arquivo);
    void pedido
      .then((url) => {
        if (vivo) setArte(url);
      })
      .catch(() => {
        if (vivo) setArte(null);
      });
    return () => {
      vivo = false;
    };
  }, [siteId, arquivo]);
  return arte;
}

/** Onde a moldura fica no quadro, em percentagem, já contando o canto dela. */
function posicao(m: Moldura): { left: string; top: string; translate: string } {
  const naDireita = m.canto.endsWith("direito");
  const embaixo = m.canto.startsWith("inferior");
  return {
    left: naDireita ? `${100 - m.folgaX}%` : `${m.folgaX}%`,
    top: embaixo ? `${100 - m.folgaY}%` : `${m.folgaY}%`,
    translate: `${naDireita ? "-100%" : "0"} ${embaixo ? "-100%" : "0"}`,
  };
}

function MolduraNoQuadro({
  moldura,
  arte,
  escolhida,
  onEscolher,
  onMover,
}: {
  moldura: Moldura;
  arte: string | null;
  escolhida: boolean;
  onEscolher: () => void;
  onMover: (canto: Canto, folgaX: number, folgaY: number) => void;
}): ReactElement {
  const { left, top, translate } = posicao(moldura);

  // Arrastar: o rato manda no ponto do desenho que ele pegou, e só ao largar é
  // que se decide o canto. Decidir a cada pixel fazia a moldura saltar de canto
  // no meio do gesto, com a mão parada.
  const arrastar = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    onEscolher();
    const quadro = e.currentTarget.parentElement;
    if (!quadro) return;
    const caixa = quadro.getBoundingClientRect();
    const alvo = e.currentTarget.getBoundingClientRect();
    const pegaX = e.clientX - alvo.left;
    const pegaY = e.clientY - alvo.top;

    const mover = (ev: PointerEvent): void => {
      const posto = cantoEFolga(
        ev.clientX - caixa.left - pegaX,
        ev.clientY - caixa.top - pegaY,
        alvo.width,
        alvo.height,
        caixa,
      );
      onMover(posto.canto, posto.folgaX, posto.folgaY);
    };
    const largar = (): void => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", largar);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", largar);
  };

  return (
    <div
      onPointerDown={arrastar}
      style={{
        position: "absolute",
        left,
        top,
        translate,
        width: `${moldura.largura}%`,
        cursor: "grab",
        touchAction: "none",
      }}
      className={cn("group", escolhida && "outline outline-1 outline-focus")}
    >
      {arte ? (
        <img
          src={arte}
          alt=""
          draggable={false}
          style={{
            width: "100%",
            height: "auto",
            display: "block",
            transform: `scale(${moldura.espelhoX ? -1 : 1}, ${moldura.espelhoY ? -1 : 1})`,
          }}
        />
      ) : (
        <div className="grid aspect-square place-items-center border border-dashed border-rule bg-surface-2/60 font-mono text-[10px] text-muted">
          sem arte
        </div>
      )}
    </div>
  );
}

export function PainelPrancheta({
  molduras,
  fundo,
  siteId,
  onChange,
}: {
  molduras: unknown[];
  /** A cor de fundo do painel, pra prancheta não mentir sobre o que ela vê. */
  fundo?: string;
  siteId?: string | null;
  onChange: (molduras: Moldura[]) => void;
}): ReactElement {
  const lista = molduras.map(comoMoldura);
  const [escolhida, setEscolhida] = useState(0);
  const quadroRef = useRef<HTMLDivElement>(null);
  const atual = lista[escolhida];
  const arteAtual = usarArte(siteId, atual?.arquivo ?? "");

  const trocar = (i: number, mudanca: Partial<Moldura>): void =>
    onChange(lista.map((m, j) => (j === i ? { ...m, ...mudanca } : m)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="font-narrow text-label font-semibold text-muted">
          prancheta {LARGURA}×{ALTURA}
        </span>
        <span className="text-[11px] text-muted">Arraste a moldura; ela cola no canto mais perto.</span>
        <button
          onClick={() => {
            onChange([...lista, MOLDURA_NOVA]);
            setEscolhida(lista.length);
          }}
          className="no-drag ml-auto inline-flex items-center gap-1 rounded-full border border-rule px-2.5 py-1 font-mono text-[11px] text-muted transition-colors hover:text-text"
        >
          <Plus size={12} /> moldura
        </button>
      </div>

      <div
        ref={quadroRef}
        className="relative mx-auto w-full overflow-hidden rounded-xl border border-rule"
        style={{ aspectRatio: `${LARGURA} / ${ALTURA}`, maxWidth: LARGURA, background: fundo ?? "var(--surface-2)" }}
      >
        {lista.map((m, i) => (
          <PecaDoQuadro
            key={i}
            moldura={m}
            siteId={siteId}
            escolhida={i === escolhida}
            onEscolher={() => setEscolhida(i)}
            onMover={(canto, folgaX, folgaY) => trocar(i, { canto, folgaX, folgaY })}
          />
        ))}
      </div>

      {atual && (
        <div className="flex flex-col gap-2 rounded-xl border border-rule p-3">
          <div className="flex items-center gap-2">
            <span className="font-narrow text-label font-semibold text-muted">
              moldura {escolhida + 1} de {lista.length}
            </span>
            {lista.length > 1 && (
              <div className="ml-auto flex gap-1">
                {lista.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setEscolhida(i)}
                    aria-label={`Moldura ${i + 1}`}
                    className={cn(
                      "no-drag h-5 w-5 rounded-full border font-mono text-[10px]",
                      i === escolhida ? "border-focus text-text" : "border-rule text-muted",
                    )}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>

          <CampoArquivo
            valor={atual.arquivo}
            label="arte da moldura"
            aceita={/\.(svg|png)$/i}
            aceitaNota="só SVG ou PNG"
            onChange={(novo) => trocar(escolhida, { arquivo: novo })}
          />

          <LinhaMedida
            medida={LARGURA_MEDIDA}
            valor={atual.largura}
            onChange={(novo) => trocar(escolhida, { largura: novo })}
          />

          <div className="flex items-center gap-2">
            <button
              onClick={() => trocar(escolhida, { espelhoX: !atual.espelhoX })}
              className={cn(
                "no-drag inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors",
                atual.espelhoX ? "border-focus text-text" : "border-rule text-muted hover:text-text",
              )}
            >
              <FlipHorizontal size={12} /> espelhar deitado
            </button>
            <button
              onClick={() => trocar(escolhida, { espelhoY: !atual.espelhoY })}
              className={cn(
                "no-drag inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors",
                atual.espelhoY ? "border-focus text-text" : "border-rule text-muted hover:text-text",
              )}
            >
              <FlipVertical size={12} /> espelhar de pé
            </button>
            <button
              onClick={() => {
                onChange(lista.filter((_, i) => i !== escolhida));
                setEscolhida((i) => Math.max(0, i - 1));
              }}
              aria-label="Tirar esta moldura"
              className="no-drag ml-auto p-1 text-muted transition-colors hover:text-pencil"
            >
              <Trash2 size={13} />
            </button>
          </div>

          <p className="font-mono text-[11px] text-muted">
            {atual.canto.replace("-", " ")} · folga {atual.folgaX}% / {atual.folgaY}%
            {arteAtual === null && atual.arquivo ? " · arte não encontrada" : ""}
          </p>
        </div>
      )}
    </div>
  );
}

/** Peça do quadro: separada só para cada uma poder carregar a sua arte. */
function PecaDoQuadro({
  moldura,
  siteId,
  escolhida,
  onEscolher,
  onMover,
}: {
  moldura: Moldura;
  siteId?: string | null;
  escolhida: boolean;
  onEscolher: () => void;
  onMover: (canto: Canto, folgaX: number, folgaY: number) => void;
}): ReactElement {
  const arte = usarArte(siteId, moldura.arquivo);
  return (
    <MolduraNoQuadro
      moldura={moldura}
      arte={arte}
      escolhida={escolhida}
      onEscolher={onEscolher}
      onMover={onMover}
    />
  );
}
