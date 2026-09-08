import { type ReactElement } from "react";
import { useProva } from "@/lib/prova";
import { cn } from "@/lib/utils";

/**
 * Cruz de registo. Em registo é uma cruz só, em preto. Quando a outra mão
 * tranca um campo, os dois clichés saem de registo: o ciano fica onde estava
 * e o magenta desloca-se 2px — o defeito de impressão que qualquer um lê de
 * relance, sem legenda.
 */
function CruzDeRegisto({ fora }: { fora: boolean }): ReactElement {
  const cruz = (cor: string, dx: number, dy: number): ReactElement => (
    <g stroke={cor} strokeWidth="1" transform={`translate(${dx} ${dy})`}>
      <line x1="0" y1="8" x2="16" y2="8" />
      <line x1="8" y1="0" x2="8" y2="16" />
      <circle cx="8" cy="8" r="4" fill="none" />
    </g>
  );
  return (
    <svg width="16" height="16" viewBox="-2 -2 20 20" aria-hidden focusable="false">
      {fora ? (
        <>
          {cruz("var(--cyan)", -1.5, -1.5)}
          {cruz("var(--magenta)", 1.5, 1.5)}
        </>
      ) : (
        cruz("var(--reg)", 0, 0)
      )}
    </svg>
  );
}

/**
 * Uma casa da barra. Apagada é só o contorno do cliché — nada foi impresso.
 * Acesa é o bloco de tinta cheio, com o tipo na cor que passa por cima dela.
 */
function Casa({
  ligada,
  tinta,
  rotulo,
  valor,
  titulo,
}: {
  ligada: boolean;
  tinta: "cyan" | "magenta" | "yellow" | "reg";
  rotulo: string;
  valor?: string;
  titulo: string;
}): ReactElement {
  const cheia: Record<string, string> = {
    cyan: "bg-cyan text-reg",
    magenta: "bg-magenta text-white",
    yellow: "bg-yellow text-reg",
    reg: "bg-reg text-white",
  };
  return (
    <div
      title={titulo}
      aria-label={titulo}
      className={cn(
        "flex h-full min-w-[74px] items-center gap-2 px-2.5 font-narrow text-gauge font-semibold uppercase",
        ligada ? cheia[tinta] : "border border-rule-strong text-muted",
      )}
    >
      <span>{rotulo}</span>
      {valor && <span className="gauge ml-auto">{valor}</span>}
    </div>
  );
}

/**
 * A barra de cor. Corre à largura toda no pé da janela e vai da esquerda para
 * a direita na ordem do trabalho: quem está na mesa, o servidor de pé, a
 * segunda mão, o que falta gravar — até ao carimbo de publicado no fim.
 */
export function BarraDeCor(): ReactElement {
  const { prova } = useProva();
  const { servidor, coopLigado, coopPares, coopTranca, porGravar, publicacao } = prova;

  return (
    <footer
      aria-label="Estado da prova"
      className="flex h-[28px] shrink-0 items-stretch gap-[2px] border-t border-rule bg-surface-2 px-[2px] py-[2px]"
    >
      <div
        className="flex w-[28px] shrink-0 items-center justify-center bg-ground"
        title={coopTranca ? `${coopTranca} está a segurar um campo` : "Em registo"}
      >
        <CruzDeRegisto fora={coopTranca !== null} />
      </div>

      <Casa
        ligada={servidor !== null}
        tinta="cyan"
        rotulo="Servidor"
        titulo={servidor ? `Servidor a correr em ${servidor}` : "Servidor parado"}
      />
      <Casa
        ligada={coopLigado}
        tinta="magenta"
        rotulo="Coop"
        valor={coopLigado ? String(coopPares).padStart(2, "0") : undefined}
        titulo={
          coopLigado ? `Coop aberta — ${coopPares} na mesa` : "Coop fechada — está sozinho no convite"
        }
      />
      <Casa
        ligada={porGravar}
        tinta="yellow"
        rotulo="Por gravar"
        titulo={porGravar ? "Há edição que ainda não foi para o disco" : "Tudo gravado"}
      />

      <span className="flex-1" />

      {servidor && (
        <div className="flex items-center px-3 font-mono text-[10px] text-muted" title={servidor}>
          {servidor.replace(/^https?:\/\//, "")}
        </div>
      )}

      <Casa
        ligada={publicacao === "publicado"}
        tinta="reg"
        rotulo={publicacao === "a-correr" ? "A publicar" : "Publicado"}
        valor={publicacao === "publicado" ? "OK" : undefined}
        titulo={
          publicacao === "publicado"
            ? "Publicado nesta sessão"
            : publicacao === "a-correr"
              ? "Publicação a correr"
              : "Ainda não publicado nesta sessão"
        }
      />
    </footer>
  );
}
