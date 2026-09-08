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
    estado === "ok" ? "text-cyan" : estado === "falhou" ? "text-pencil" : estado === "rodando" ? "text-cyan" : "text-muted";
  const marca = estado === "ok" ? "▪" : estado === "falhou" ? "▲" : estado === "rodando" ? "▸" : "▫";
  return (
    <span className={cn("font-narrow font-semibold text-gauge uppercase tracking-[0.18em]", cor)}>
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
        <span className="font-narrow font-semibold text-label uppercase text-muted">Saída do CLI</span>
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
        {linhas.length === 0 && <p className="text-muted">{vazio}</p>}
        {linhas.map((l) => (
          <div
            key={l.n}
            className={cn("whitespace-pre-wrap break-words", l.stream === "err" ? "text-pencil" : "text-text")}
          >
            {l.texto || "\u00a0"}
          </div>
        ))}
        {erro && <div className="mt-2 border-l-2 border-pencil pl-3 text-pencil">{erro}</div>}
        <div ref={fim} />
      </div>
    </div>
  );
}
