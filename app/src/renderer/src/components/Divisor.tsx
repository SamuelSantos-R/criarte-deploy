import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactElement } from "react";

const CHAVE = "criarte:largura-ao-vivo";

export const LARGURA_PADRAO = 460;
// Abaixo disto o cabeçalho do painel (rótulo, aparelho, recarregar, QR, parar)
// começa a transbordar — medido, não chutado.
const PAINEL_MIN = 400;
/** O formulário é o que dá sentido ao preview: nunca pode ser espremido até sumir. */
const FORMULARIO_MIN = 380;

/** Largura do painel ao vivo, lembrada entre sessões. */
export function useLarguraPainel(): [number, (px: number) => void] {
  const [largura, set] = useState(() =>
    Math.max(PAINEL_MIN, Number(localStorage.getItem(CHAVE)) || LARGURA_PADRAO),
  );

  const definir = useCallback((px: number): void => {
    set(px);
    localStorage.setItem(CHAVE, String(px));
  }, []);

  return [largura, definir];
}

const PASSO = 24;

/**
 * Pega-e-arrasta entre o formulário e o painel da direita. O `setPointerCapture`
 * é o que faz o arrasto sobreviver a passar por cima do iframe do preview — sem
 * ele o site engolia o ponteiro no primeiro pixel e a barra ficava presa.
 */
export function Divisor({
  largura,
  onLargura,
}: {
  largura: number;
  onLargura: (px: number) => void;
}): ReactElement {
  const barra = useRef<HTMLDivElement>(null);
  const inicio = useRef<{ x: number; largura: number } | null>(null);
  const [arrastando, setArrastando] = useState(false);

  /**
   * O teto sai do que a barra tem à esquerda, não da largura da janela: entre a
   * janela e o formulário ainda estão a navegação e a régua de seções, e clampar
   * pela janela deixava o formulário com 211px onde devia ter 380.
   */
  const limitar = useCallback((px: number): number => {
    const irmao = barra.current?.previousElementSibling;
    const total = (irmao?.getBoundingClientRect().width ?? 0) + largura;
    const teto = Math.max(PAINEL_MIN, total - FORMULARIO_MIN);
    return Math.round(Math.min(Math.max(px, PAINEL_MIN), teto));
  }, [largura]);

  // Encolher a janela não pode deixar o formulário sem espaço por causa de um
  // número guardado quando ela era maior.
  useEffect(() => {
    const pai = barra.current?.parentElement;
    if (!pai) return;
    const obs = new ResizeObserver(() => {
      const v = limitar(largura);
      if (v !== largura) onLargura(v);
    });
    obs.observe(pai);
    return () => obs.disconnect();
  }, [limitar, largura, onLargura]);

  const descer = (e: PointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    inicio.current = { x: e.clientX, largura };
    setArrastando(true);
  };

  const mover = (e: PointerEvent<HTMLDivElement>): void => {
    const de = inicio.current;
    // Painel à direita: arrastar pra esquerda alarga, daí o sinal invertido.
    if (de) onLargura(limitar(de.largura - (e.clientX - de.x)));
  };

  const soltar = (e: PointerEvent<HTMLDivElement>): void => {
    if (!inicio.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    inicio.current = null;
    setArrastando(false);
  };

  return (
    <div
      ref={barra}
      role="separator"
      aria-orientation="vertical"
      aria-label="Largura do painel ao vivo"
      aria-valuenow={largura}
      tabIndex={0}
      onPointerDown={descer}
      onPointerMove={mover}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      onDoubleClick={() => onLargura(limitar(LARGURA_PADRAO))}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onLargura(limitar(largura + PASSO));
        else if (e.key === "ArrowRight") onLargura(limitar(largura - PASSO));
        else return;
        e.preventDefault();
      }}
      title="Arraste pra mudar o tamanho · duplo clique volta ao padrão"
      className="no-drag group relative w-[9px] shrink-0 cursor-col-resize focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-2px] focus-visible:outline-sage"
    >
      <span
        aria-hidden
        className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${
          arrastando ? "bg-accent" : "bg-rule group-hover:bg-rule-strong"
        }`}
      />
      {/* Três traços: a linha sozinha é só uma borda como as outras, e ninguém
          descobre que dá pra puxar. */}
      <span
        aria-hidden
        className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-[3px]"
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`block h-[3px] w-[3px] transition-colors ${
              arrastando ? "bg-accent" : "bg-rule-strong group-hover:bg-accent"
            }`}
          />
        ))}
      </span>
    </div>
  );
}
