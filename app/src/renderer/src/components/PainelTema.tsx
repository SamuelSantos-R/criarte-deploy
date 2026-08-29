import { useMemo, type ReactElement } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

// O convite.json guarda hex porque e o que a gente le e o que o <input type=color>
// fala. Quem converte pra canal RGB e o src/lib/tema.ts do site.
function expandir(hex: string): string {
  const h = hex.slice(1);
  return h.length === 3 ? `#${h.replace(/./g, (c) => c + c)}` : hex;
}

const FAMILIA: Record<string, string> = {
  principal: "Cor dominante — fundos e blocos cheios",
  realce: "Titulos, rotulos e icones",
  borda: "Fios e contornos de cartao",
  creme: "Papel — fundo das secoes",
  tinta: "Texto corrido",
  texto: "Texto corrido",
  ouro: "Filetes e ornamentos",
  sage: "Neutro frio de apoio",
};

function Linha({
  token,
  valor,
  onChange,
}: {
  token: string;
  valor: string;
  onChange: (novo: string) => void;
}): ReactElement {
  const valido = HEX.test(valor);

  return (
    <div className="flex items-stretch border-b border-rule last:border-b-0">
      {/* O bloco sangra ate a borda esquerda: as amostras formam uma coluna
          continua de cor, e nao uma grade de chips soltos. */}
      <label
        className={cn(
          "relative w-[46px] shrink-0 cursor-pointer",
          "focus-within:outline focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-accent",
          !valido && "bg-surface-2",
        )}
        style={valido ? { backgroundColor: valor } : undefined}
      >
        <input
          type="color"
          value={valido ? expandir(valor) : "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="no-drag absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label={`Escolher cor de ${token}`}
        />
        {!valido && (
          <AlertTriangle
            size={13}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-bad"
            aria-hidden
          />
        )}
      </label>

      <div className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-4">
        <span className="truncate font-mono text-[12px] text-text">{token}</span>
        {!valido && (
          <span className="shrink-0 font-mono text-serial uppercase text-bad">hex invalido</span>
        )}
      </div>

      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        aria-label={`Hex de ${token}`}
        className={cn(
          "no-drag w-[104px] shrink-0 bg-transparent pr-3 text-right font-mono text-[12px] uppercase",
          "focus:outline-none focus:bg-surface-2",
          valido ? "text-muted" : "text-bad",
        )}
      />
    </div>
  );
}

export function PainelTema({
  tema,
  onChange,
}: {
  tema: Record<string, string>;
  onChange: (token: string, valor: string) => void;
}): ReactElement {
  // Agrupa por prefixo (`realce-escuro` cai em `realce`) mantendo a ordem do
  // arquivo — quem escreveu o convite.json ja ordenou por familia.
  const grupos = useMemo(() => {
    const mapa = new Map<string, string[]>();
    for (const token of Object.keys(tema)) {
      const raiz = token.split("-")[0];
      const lista = mapa.get(raiz);
      if (lista) lista.push(token);
      else mapa.set(raiz, [token]);
    }
    return [...mapa.entries()];
  }, [tema]);

  return (
    <div className="max-w-[520px]">
      <p className="mb-7 max-w-[46ch] text-[13px] leading-[1.6] text-muted">
        Cada token vira uma variavel CSS no convite. Trocar aqui repinta tudo que usa
        aquele token — texto, fundo, fio e icone.
      </p>

      {grupos.map(([raiz, tokens]) => (
        <section key={raiz} className="mb-8 last:mb-0">
          <div className="mb-2 flex items-baseline gap-3">
            <span className="font-mono text-label uppercase text-text">{raiz}</span>
            <span className="font-mono text-serial text-muted/60">
              {String(tokens.length).padStart(2, "0")}
            </span>
            <span className="h-px flex-1 bg-rule" />
          </div>
          {FAMILIA[raiz] && (
            <p className="mb-3 text-[12px] text-muted/80">{FAMILIA[raiz]}</p>
          )}
          <div className="border-t border-rule">
            {tokens.map((token) => (
              <Linha
                key={token}
                token={token}
                valor={tema[token] ?? ""}
                onChange={(novo) => onChange(token, novo)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
