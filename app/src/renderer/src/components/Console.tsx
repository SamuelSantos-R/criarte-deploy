import { useEffect, useRef, type ReactElement } from "react";
import { cn } from "@/lib/utils";
import type { Estado, Linha } from "@/lib/useJob";

const ROTULO: Record<Estado, string> = {
  parado: "ocioso",
  rodando: "executando",
  ok: "concluído",
  falhou: "falhou",
};

/** Estado nunca é só cor: tem rótulo escrito e forma do marcador diferente. */
function Selo({ estado }: { estado: Estado }): ReactElement {
  const cor =
    estado === "ok" ? "text-ok" : estado === "falhou" ? "text-bad" : estado === "rodando" ? "text-accent" : "text-muted";
  const marca = estado === "ok" ? "▪" : estado === "falhou" ? "▲" : estado === "rodando" ? "▸" : "▫";
  return (
    <span className={cn("font-mono text-serial uppercase tracking-[0.18em]", cor)}>
      {marca} {ROTULO[estado]}
    </span>
  );
}

export function Console({
  linhas,
  estado,
  erro,
  vazio = "Nenhuma saída ainda.",
}: {
  linhas: Linha[];
  estado: Estado;
  erro?: string | null;
  vazio?: string;
}): ReactElement {
  const fim = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const grudado = useRef(true);

  useEffect(() => {
    if (grudado.current) fim.current?.scrollIntoView({ block: "end" });
  }, [linhas.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-rule bg-ground">
      <div className="flex items-center justify-between border-b border-rule px-4 py-2">
        <span className="font-mono text-label uppercase text-muted">Saída do CLI</span>
        <Selo estado={estado} />
      </div>
      <div
        ref={box}
        onScroll={() => {
          const el = box.current;
          if (el) grudado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-[12px] leading-[1.75]"
        style={{ userSelect: "text" }}
      >
        {linhas.length === 0 && <p className="text-muted/60">{vazio}</p>}
        {linhas.map((l) => (
          <div
            key={l.n}
            className={cn("whitespace-pre-wrap break-words", l.stream === "err" ? "text-bad" : "text-text/85")}
          >
            {l.texto || "\u00a0"}
          </div>
        ))}
        {erro && <div className="mt-2 border-l-2 border-bad pl-3 text-bad">{erro}</div>}
        <div ref={fim} />
      </div>
    </div>
  );
}
