import { type ReactElement } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export type Medida = {
  chave: string;
  rotulo: string;
  dica: string;
  min: number;
  max: number;
  passo: number;
  padrao: number;
};

/**
 * A faixa é a mesma que o `src/lib/tema.ts` do site aceita. Valor fora dela o site
 * descarta e volta pro padrão, então limitar aqui evita a pessoa mexer no número e
 * não entender por que a tela não mudou.
 */
const MEDIDAS: Medida[] = [
  {
    chave: "monogramaAltura",
    rotulo: "monograma",
    dica: "Altura. A largura acompanha sozinha — monograma redondo e monograma estreito e alto funcionam igual.",
    min: 80,
    max: 320,
    passo: 4,
    padrao: 180,
  },
  {
    chave: "paisTamanho",
    rotulo: "nomes dos pais",
    dica: "Tamanho fixo: o mesmo no telemóvel e no computador.",
    min: 10,
    max: 22,
    passo: 1,
    padrao: 13,
  },
  {
    chave: "noivosTamanho",
    rotulo: "nomes dos noivos",
    dica: "Teto no computador. No telemóvel o nome continua acompanhando a largura da tela.",
    min: 120,
    max: 320,
    passo: 5,
    padrao: 230,
  },
  {
    chave: "vasoLargura",
    rotulo: "vaso dos presentes",
    dica: "Largura. A altura acompanha sozinha.",
    min: 60,
    max: 260,
    passo: 5,
    padrao: 120,
  },
];

/** O que o Studio grava quando o convite.json ainda não tem a seção. */
export const MEDIDAS_PADRAO: Record<string, number | string> = {
  ...Object.fromEntries(MEDIDAS.map((m) => [m.chave, m.padrao])),
  noivosFonte: "milton",
};

const FONTES = [
  { valor: "milton", nome: "Milton One", nota: "display encorpada" },
  { valor: "manstein", nome: "Manstein", nota: "manuscrita" },
  { valor: "noah", nome: "Noah", nota: "sem serifa" },
  { valor: "garamond", nome: "Cormorant Garamond", nota: "serifa clássica" },
  { valor: "infant", nome: "Cormorant Infant", nota: "serifa suave" },
  { valor: "medium", nome: "Cormorant Medium", nota: "serifa densa" },
];

function preso(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function LinhaMedida({
  medida,
  valor,
  onChange,
}: {
  medida: Medida;
  valor: unknown;
  onChange: (novo: number) => void;
}): ReactElement {
  const bruto = typeof valor === "number" && Number.isFinite(valor) ? valor : medida.padrao;
  const atual = preso(bruto, medida.min, medida.max);
  const pct = ((atual - medida.min) / (medida.max - medida.min)) * 100;
  const mexer = (d: number): void => onChange(preso(atual + d, medida.min, medida.max));
  const noLimite = (d: number): boolean =>
    d < 0 ? atual <= medida.min : atual >= medida.max;

  return (
    <div className="relative border-b border-rule last:border-b-0 focus-within:bg-surface-2/40">
      {/* A régua não é um widget colado embaixo do rótulo: é a própria linha que
          enche. Arrastar em qualquer ponto move o valor; os botões ficam por cima. */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 bg-accent/15"
        style={{ width: `${pct}%` }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-y-0 w-px bg-accent" style={{ left: `${pct}%` }} aria-hidden />

      <input
        type="range"
        min={medida.min}
        max={medida.max}
        step={medida.passo}
        value={atual}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${medida.rotulo} em pixels`}
        className={cn(
          "no-drag absolute inset-0 h-full w-full cursor-ew-resize appearance-none bg-transparent opacity-0",
          "focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
        )}
      />

      <div className="pointer-events-none relative flex items-center gap-4 py-3 pl-4 pr-2">
        <div className="min-w-0 flex-1">
          <span className="font-mono text-[12px] text-text">{medida.rotulo}</span>
          <p className="mt-0.5 max-w-[44ch] text-[11px] leading-[1.5] text-muted/80">{medida.dica}</p>
        </div>

        <div className="pointer-events-auto flex shrink-0 items-center gap-1">
          {[-medida.passo, medida.passo].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => mexer(d)}
              disabled={noLimite(d)}
              aria-label={`${d < 0 ? "Diminuir" : "Aumentar"} ${medida.rotulo}`}
              className={cn(
                "no-drag flex h-7 w-7 items-center justify-center border border-rule text-muted transition-colors",
                "hover:border-rule-strong hover:text-text",
                "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
                "disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-rule disabled:hover:text-muted",
              )}
            >
              {d < 0 ? <Minus size={13} /> : <Plus size={13} />}
            </button>
          ))}

          <span className="w-[62px] pr-1 text-right font-mono text-[12px] tabular-nums text-text">
            {atual}
            <span className="text-muted"> px</span>
          </span>

          <button
            type="button"
            onClick={() => onChange(medida.padrao)}
            disabled={atual === medida.padrao}
            aria-label={`Voltar ${medida.rotulo} ao padrão de ${medida.padrao} pixels`}
            title={`Padrão: ${medida.padrao}px`}
            className={cn(
              "no-drag flex h-7 w-7 items-center justify-center text-muted transition-colors hover:text-text",
              "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
              "disabled:cursor-not-allowed disabled:opacity-20 disabled:hover:text-muted",
            )}
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      <div className="pointer-events-none relative flex justify-between px-4 pb-2 font-mono text-serial text-muted/50">
        <span>{medida.min}</span>
        <span>{medida.max}</span>
      </div>
    </div>
  );
}

export function PainelMedidas({
  medidas,
  onChange,
}: {
  medidas: Record<string, unknown>;
  onChange: (chave: string, valor: string | number) => void;
}): ReactElement {
  const fonte = typeof medidas.noivosFonte === "string" ? medidas.noivosFonte : "milton";

  return (
    <div className="max-w-[520px]">
      <p className="mb-7 max-w-[46ch] text-[13px] leading-[1.6] text-muted">
        Tamanho e fonte viram variável CSS no convite, igual as cores. O preview do lado
        responde na hora — arraste na linha ou use os botões.
      </p>

      <section className="mb-8">
        <div className="mb-3 flex items-baseline gap-3">
          <span className="font-mono text-label uppercase text-text">tamanhos</span>
          <span className="font-mono text-serial text-muted/60">
            {String(MEDIDAS.length).padStart(2, "0")}
          </span>
          <span className="h-px flex-1 bg-rule" />
        </div>
        <div className="border-t border-rule">
          {MEDIDAS.map((medida) => (
            <LinhaMedida
              key={medida.chave}
              medida={medida}
              valor={medidas[medida.chave]}
              onChange={(novo) => onChange(medida.chave, novo)}
            />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline gap-3">
          <span className="font-mono text-label uppercase text-text">fonte dos noivos</span>
          <span className="h-px flex-1 bg-rule" />
        </div>
        {/* Sem amostra visual de propósito: o Studio não carrega as fontes do site,
            e um preview desenhado com a fonte errada mente mais do que ajuda. */}
        <p className="mb-3 max-w-[46ch] text-[12px] leading-[1.6] text-muted/80">
          Vale para os dois nomes e o <span className="font-mono">&amp;</span> do meio. A
          amostra de verdade é o preview ao lado.
        </p>
        <div className="border-y border-rule">
          {FONTES.map((f) => (
            <label
              key={f.valor}
              className={cn(
                "no-drag flex cursor-pointer items-center gap-3 border-b border-rule py-2.5 pl-4 pr-3 last:border-b-0",
                "focus-within:outline focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-accent",
                f.valor === fonte ? "bg-accent/10" : "hover:bg-surface-2/40",
              )}
            >
              <input
                type="radio"
                name="noivosFonte"
                checked={f.valor === fonte}
                onChange={() => onChange("noivosFonte", f.valor)}
                className="no-drag h-3.5 w-3.5 shrink-0 accent-accent"
              />
              <span
                className={cn(
                  "font-mono text-[12px]",
                  f.valor === fonte ? "text-text" : "text-muted",
                )}
              >
                {f.nome}
              </span>
              <span className="ml-auto shrink-0 font-mono text-serial uppercase text-muted/60">
                {f.nota}
              </span>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
