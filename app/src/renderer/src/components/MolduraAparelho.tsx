import { type ReactElement, type ReactNode } from "react";
import type { Aparelho } from "@/components/Palco";

/** Espessura do aro de metal, em CSS px do aparelho. */
const ARO = 3;

type Recorte = "ilha" | "entalhe" | "botao-inicio" | "nenhum";

/** Medidas do corpo em CSS px do aparelho — proporções dos iPhones e iPads de verdade. */
export type Corpo = {
  /** Borda preta entre a tela e o aro, de cada lado. */
  bordaX: number;
  bordaY: number;
  raioTela: number;
  recorte: Recorte;
  botoesLaterais: boolean;
};

export function corpoDe(a: Aparelho): Corpo | null {
  if (!a.movel) return null;
  if (a.l >= 700) return { bordaX: 22, bordaY: 22, raioTela: 18, recorte: "nenhum", botoesLaterais: false };
  if (a.id === "se") return { bordaX: 16, bordaY: 92, raioTela: 0, recorte: "botao-inicio", botoesLaterais: true };
  if (a.id === "13") return { bordaX: 13, bordaY: 13, raioTela: 47, recorte: "entalhe", botoesLaterais: true };
  return { bordaX: 12, bordaY: 12, raioTela: 55, recorte: "ilha", botoesLaterais: true };
}

/**
 * O aparelho em volta do site: aro de titânio com brilho fino na aresta,
 * borda preta, ilha dinâmica ou entalhe, e os botões laterais. Tudo em CSS,
 * na mesma escala do iframe — o site por dentro continua o site real.
 */
export function MolduraAparelho({
  corpo,
  largura,
  altura,
  zoom,
  deitado,
  children,
}: {
  corpo: Corpo;
  largura: number;
  altura: number;
  zoom: number;
  deitado: boolean;
  children: ReactNode;
}): ReactElement {
  const z = (n: number): number => n * zoom;
  const bx = deitado ? corpo.bordaY : corpo.bordaX;
  const by = deitado ? corpo.bordaX : corpo.bordaY;
  const corpoL = largura + bx * 2;
  const corpoA = altura + by * 2;
  const raioCorpo = corpo.raioTela > 0 ? corpo.raioTela + Math.max(bx, by) : 56;
  // Os botões são desenhados pra um corpo de ~876px de altura e acompanham o tamanho.
  const k = (deitado ? corpoL : corpoA) / 876;

  const botao = (lado: "esq" | "dir", topo: number, alto: number): ReactElement => {
    const estilo = deitado
      ? { left: z(topo * k), width: z(alto * k), height: z(3.5), [lado === "esq" ? "top" : "bottom"]: z(-3) }
      : { top: z(topo * k), height: z(alto * k), width: z(3.5), [lado === "esq" ? "left" : "right"]: z(-3) };
    return <span aria-hidden className="absolute rounded-full bg-[#3a3a3e]" style={estilo} />;
  };

  return (
    <div
      className="relative shrink-0"
      style={{
        width: z(corpoL),
        height: z(corpoA),
        borderRadius: z(raioCorpo),
        // Só o aro é metal: 3px de titânio com brilho na aresta de fora.
        background: "linear-gradient(145deg, #5a5a60 0%, #2a2a2e 30%, #1a1a1d 55%, #46464c 100%)",
        boxShadow: `inset 0 0 0 ${z(0.75)}px rgb(255 255 255 / 0.22), 0 ${z(30)}px ${z(60)}px -${z(22)}px rgb(0 0 0 / 0.45), 0 ${z(6)}px ${z(14)}px -${z(6)}px rgb(0 0 0 / 0.25)`,
      }}
    >
      {/* Borda preta uniforme, concêntrica com o aro e com a tela — era o degradê
          cinza aparecendo aqui que fazia os cantos parecerem tortos. */}
      <div
        aria-hidden
        className="absolute bg-[#050506]"
        style={{ inset: z(ARO), borderRadius: z(Math.max(0, raioCorpo - ARO)) }}
      />
      {corpo.botoesLaterais && (
        <>
          {botao("esq", 150, 30)}
          {botao("esq", 205, 58)}
          {botao("esq", 275, 58)}
          {botao("dir", 235, 95)}
        </>
      )}

      {/* clip-path em vez de só overflow+radius: o iframe escalado vira camada
          própria no Chromium e escapava da curva nos cantos. Fundo preto porque
          o arredondamento de subpixel deixava um fio branco na borda. */}
      <div
        className="absolute overflow-hidden bg-black"
        style={{
          left: z(bx),
          top: z(by),
          width: z(largura),
          height: z(altura),
          borderRadius: z(corpo.raioTela),
          clipPath: `inset(0 round ${z(corpo.raioTela)}px)`,
          isolation: "isolate",
          transform: "translateZ(0)",
        }}
      >
        {children}

        {corpo.recorte === "ilha" && (
          <span
            aria-hidden
            className="pointer-events-none absolute rounded-full bg-black"
            style={
              deitado
                ? { left: z(11), top: "50%", width: z(36), height: z(124), transform: "translateY(-50%)" }
                : { top: z(11), left: "50%", width: z(124), height: z(36), transform: "translateX(-50%)" }
            }
          />
        )}
        {corpo.recorte === "entalhe" && (
          <span
            aria-hidden
            className="pointer-events-none absolute bg-black"
            style={
              deitado
                ? { left: 0, top: "50%", width: z(32), height: z(162), transform: "translateY(-50%)", borderRadius: `0 ${z(20)}px ${z(20)}px 0` }
                : { top: 0, left: "50%", width: z(162), height: z(32), transform: "translateX(-50%)", borderRadius: `0 0 ${z(20)}px ${z(20)}px` }
            }
          />
        )}
      </div>

      {corpo.recorte === "botao-inicio" && (
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-full"
          style={{
            width: z(56),
            height: z(56),
            boxShadow: `inset 0 0 0 ${z(2.5)}px #3a3a3e`,
            ...(deitado
              ? { right: z((bx - 56) / 2), top: "50%", transform: "translateY(-50%)" }
              : { bottom: z((by - 56) / 2), left: "50%", transform: "translateX(-50%)" }),
          }}
        />
      )}
    </div>
  );
}
