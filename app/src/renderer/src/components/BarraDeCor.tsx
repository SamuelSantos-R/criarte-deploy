import { type ReactElement } from "react";
import { CircleCheck, Lock, PenLine, Server } from "lucide-react";
import { useProva } from "@/lib/prova";
import { cn } from "@/lib/utils";

type Tinta = "cyan" | "magenta" | "yellow" | "text";

const ACESA: Record<Tinta, string> = {
  cyan: "bg-cyan/12 text-cyan",
  magenta: "bg-magenta/12 text-magenta",
  yellow: "bg-yellow text-on-yellow",
  text: "bg-text text-surface",
};

/**
 * Um estado da prova. Apagado é um ícone discreto; aceso ganha a tinta do
 * cargo e o rótulo. Lê-se sem clicar, que era o trabalho da antiga barra de cor.
 */
function Estado({
  ligado,
  tinta,
  Icone,
  rotulo,
  titulo,
}: {
  ligado: boolean;
  tinta: Tinta;
  Icone: typeof Server;
  rotulo: string;
  titulo: string;
}): ReactElement {
  return (
    <span
      title={titulo}
      aria-label={titulo}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold transition-colors duration-200",
        ligado ? ACESA[tinta] : "text-muted/70",
      )}
    >
      <Icone size={13} strokeWidth={2.2} />
      <span className={cn(!ligado && "sr-only")}>{rotulo}</span>
    </span>
  );
}

/** Os quatro estados do trabalho, na ordem em que acontecem: servidor, coop, gravar, publicar. */
export function BarraDeCor(): ReactElement {
  const { prova } = useProva();
  const { servidor, coopLigado, coopTranca, porGravar, publicacao } = prova;

  return (
    <div aria-label="Estado do convite" className="no-drag flex items-center gap-1">
      <Estado
        ligado={servidor !== null}
        tinta="cyan"
        Icone={Server}
        rotulo={servidor ? servidor.replace(/^https?:\/\//, "") : "Servidor"}
        titulo={servidor ? `Servidor a correr em ${servidor}` : "Servidor parado"}
      />
      {/* O coop mora no botão do bonequinho, com a contagem. Aqui só aparece
          quando alguém segura um campo — é o que o botão não diz. */}
      {coopLigado && coopTranca && (
        <Estado
          ligado
          tinta="magenta"
          Icone={Lock}
          rotulo={`${coopTranca} a editar`}
          titulo={`${coopTranca} está a segurar um campo`}
        />
      )}
      <Estado
        ligado={porGravar}
        tinta="yellow"
        Icone={PenLine}
        rotulo="Por gravar"
        titulo={porGravar ? "Há edição que ainda não foi para o disco" : "Tudo gravado"}
      />
      <Estado
        ligado={publicacao !== "parada"}
        tinta="text"
        Icone={CircleCheck}
        rotulo={publicacao === "a-correr" ? "A publicar…" : "Publicado"}
        titulo={
          publicacao === "publicado"
            ? "Publicado nesta sessão"
            : publicacao === "a-correr"
              ? "Publicação a correr"
              : "Ainda não publicado nesta sessão"
        }
      />
    </div>
  );
}
