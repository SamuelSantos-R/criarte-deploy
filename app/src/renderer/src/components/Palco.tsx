import { useCallback, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { corpoDe, MolduraAparelho } from "@/components/MolduraAparelho";

export type Aparelho = { id: string; nome: string; l: number; a: number; dpr: number; movel: boolean };

// Pontos reais em CSS px — os mesmos que o Safari usa, então as media queries
// do site respondem igual ao aparelho de verdade.
export const APARELHOS: Aparelho[] = [
  { id: "se", nome: "iPhone SE", l: 375, a: 667, dpr: 2, movel: true },
  { id: "13", nome: "iPhone 13 / 14", l: 390, a: 844, dpr: 3, movel: true },
  { id: "15p", nome: "iPhone 15 Pro", l: 393, a: 852, dpr: 3, movel: true },
  { id: "15pm", nome: "iPhone 15 Pro Max", l: 430, a: 932, dpr: 3, movel: true },
  { id: "mini", nome: "iPad mini", l: 744, a: 1133, dpr: 2, movel: true },
  { id: "air", nome: "iPad Air", l: 820, a: 1180, dpr: 2, movel: true },
  { id: "pro", nome: 'iPad Pro 12.9"', l: 1024, a: 1366, dpr: 2, movel: true },
  { id: "desktop", nome: "Desktop", l: 1440, a: 900, dpr: 1, movel: false },
];

export const acharAparelho = (id: string): Aparelho =>
  APARELHOS.find((a) => a.id === id) ?? APARELHOS[APARELHOS.length - 1];

/**
 * O site roda num `<iframe>`, não numa vista nativa: assim ele é recortado pelo
 * layout como qualquer outro elemento (nada de retângulo flutuando por cima da
 * janela) e sobrevive a trocar de aba enquanto o nó continuar montado.
 *
 * O iframe tem o tamanho do aparelho em CSS px e é o `scale` que encolhe pra
 * caber no painel — encolher a caixa faria o site achar que a tela é menor.
 */
export function Palco({
  url,
  aparelho,
  deitado = false,
  margem = 28,
  legenda = true,
  className,
  children,
}: {
  url: string | null;
  aparelho: Aparelho;
  deitado?: boolean;
  margem?: number;
  legenda?: boolean;
  className?: string;
  children?: ReactNode;
}): ReactElement {
  const [zoom, setZoom] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);

  const largura = deitado ? aparelho.a : aparelho.l;
  const altura = deitado ? aparelho.l : aparelho.a;
  const corpo = corpoDe(aparelho);
  // O que tem de caber no painel é o aparelho inteiro, não só a tela.
  const bx = corpo ? (deitado ? corpo.bordaY : corpo.bordaX) : 0;
  const by = corpo ? (deitado ? corpo.bordaX : corpo.bordaY) : 0;

  const medir = useCallback(() => {
    const el = caixa.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = r.width - margem * 2;
    const h = r.height - margem * 2;
    // Painel escondido (aba inativa) mede 0: manter o zoom antigo evita
    // recalcular pra zero e piscar quando a aba voltar.
    if (w < 2 || h < 2) return;
    setZoom(Math.min(w / (largura + bx * 2), h / (altura + by * 2), 1));
  }, [margem, largura, altura, bx, by]);

  useLayoutEffect(() => {
    medir();
    const obs = new ResizeObserver(medir);
    if (caixa.current) obs.observe(caixa.current);
    return () => obs.disconnect();
  }, [medir]);

  return (
    <div ref={caixa} className={className}>
      {url ? (
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
          {(() => {
            const iframe = (
              <iframe
                // A `key` sem o zoom e sem a recarga: trocar de aparelho só
                // re-escala, e recarregar acontece por dentro do frame (o main
                // manda um location.reload). Remontar o elemento dava o branco de
                // montar um iframe do zero e perdia a posição do scroll.
                key={url}
                src={`${url}${url.includes("?") ? "&" : "?"}studio=1`}
                title="Preview do convite"
                allow="autoplay; fullscreen"
                className="absolute left-0 top-0 block border-0 bg-white"
                style={{ width: largura, height: altura, transform: `scale(${zoom})`, transformOrigin: "0 0" }}
              />
            );
            const rotulo = legenda && (
              <span className="pointer-events-none absolute left-1/2 top-full mt-4 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium text-muted">
                {aparelho.nome} · {largura}×{altura} · {Math.round(zoom * 100)}%
              </span>
            );
            return corpo ? (
              <div className="relative">
                <MolduraAparelho corpo={corpo} largura={largura} altura={altura} zoom={zoom} deitado={deitado}>
                  {iframe}
                </MolduraAparelho>
                {rotulo}
              </div>
            ) : (
              // Computador não tem aparelho a desenhar: uma janela de canto macio basta.
              <div className="relative shrink-0 rounded-xl shadow-flutua" style={{ width: largura * zoom, height: altura * zoom }}>
                <div className="absolute inset-0 overflow-hidden rounded-xl ring-1 ring-rule">{iframe}</div>
                {rotulo}
              </div>
            );
          })()}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
