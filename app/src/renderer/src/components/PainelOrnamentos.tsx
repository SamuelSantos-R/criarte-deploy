import { type ReactElement } from "react";
import { CampoArquivo } from "@/components/CampoArquivo";
import { LinhaMedida, type Medida } from "@/components/PainelMedidas";
import { SeletorCor, hexValido } from "@/components/SeletorCor";
import { cn } from "@/lib/utils";

const SVG_OU_PNG = /\.(svg|png)$/i;

const SLOTS = [
  {
    chave: "esquerdo",
    rotulo: "div lado esquerdo",
    dica: "Vazio: usa a arte da direita espelhada, como o convite sempre fez. Com arte própria, entra como está — nada de espelho.",
  },
  {
    chave: "direito",
    rotulo: "div lado direito",
    dica: "É esta que manda quando o lado esquerdo está vazio.",
  },
];

const AJUSTES: Medida[] = [
  {
    chave: "tamanho",
    rotulo: "tamanho",
    dica: "Vale para os dois lados de uma vez. No telemóvel sai na mesma proporção.",
    min: 160,
    max: 560,
    passo: 10,
    padrao: 360,
  },
  {
    chave: "deslocamento",
    rotulo: "subir / descer",
    dica: "Negativo sobe, positivo desce. Move todos os ornamentos juntos, mantendo a diferença de altura que cada secção já tem.",
    min: -200,
    max: 200,
    passo: 5,
    padrao: 0,
  },
];

export const ORNAMENTOS_PADRAO: Record<string, string | number> = {
  esquerdo: "",
  direito: "/assets/div-flor.svg",
  cor: "",
  tamanho: 360,
  deslocamento: 0,
};

/**
 * Pintar recorta a silhueta da arte e enche-a de uma cor só. Num desenho de
 * traço único é exatamente o que se quer; numa flor pintada à mão apaga o
 * trabalho todo. Daí o vazio ser o padrão e ter volta num clique.
 */
function LinhaCor({
  valor,
  onChange,
}: {
  valor: string;
  onChange: (novo: string) => void;
}): ReactElement {
  const pintado = valor.trim() !== "";
  const valido = !pintado || hexValido(valor);

  return (
    <div className="flex items-stretch border-y border-rule">
      <SeletorCor valor={pintado ? valor : "#B08A4A"} rotulo="a arte" onChange={onChange} />

      <div className="min-w-0 flex-1 py-2.5 pl-4 pr-3">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[13px] text-text">cor da arte</span>
          {!valido && (
            <span className="shrink-0 font-mono text-serial uppercase text-bad">hex inválido</span>
          )}
        </div>
        <p className="mt-0.5 max-w-[42ch] text-[12px] leading-[1.5] text-muted/80">
          {pintado
            ? "A arte sai chapada nesta cor. Serve a desenho de traço único."
            : "A arte sai com as cores do ficheiro."}
        </p>
      </div>

      {pintado ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className={cn(
            "no-drag shrink-0 self-start px-3 py-2.5 font-mono text-serial uppercase tracking-[0.14em]",
            "text-muted hover:text-text",
            "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-sage",
          )}
        >
          limpar
        </button>
      ) : null}

      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        placeholder="original"
        aria-label="Hex da cor da arte"
        className={cn(
          "no-drag w-[92px] shrink-0 self-start bg-transparent py-2.5 pr-3 text-right font-mono text-[12px] uppercase",
          "placeholder:normal-case placeholder:text-muted/50 focus:bg-surface-2 focus:outline-none",
          valido ? "text-muted" : "text-bad",
        )}
      />
    </div>
  );
}

export function PainelOrnamentos({
  ornamentos,
  onChange,
}: {
  ornamentos: Record<string, unknown>;
  onChange: (chave: string, valor: string | number) => void;
}): ReactElement {
  return (
    <div className="max-w-[520px]">
      <p className="mb-7 max-w-[46ch] text-[13px] leading-[1.6] text-muted">
        A arte que aparece no canto de cada secção. Só SVG ou PNG — o desenho é
        recortado no canto e formato com fundo chapado deixa um quadrado à vista.
      </p>

      <section className="mb-8">
        <div className="mb-3 flex items-baseline gap-3">
          <span className="font-mono text-label uppercase text-text">arte</span>
          <span className="font-mono text-serial text-muted/60">02</span>
          <span className="h-px flex-1 bg-rule" />
        </div>
        <div className="flex flex-col gap-5">
          {SLOTS.map((slot) => (
            <div key={slot.chave}>
              <CampoArquivo
                label={slot.rotulo}
                valor={typeof ornamentos[slot.chave] === "string" ? (ornamentos[slot.chave] as string) : ""}
                onChange={(v) => onChange(slot.chave, v)}
                aceita={SVG_OU_PNG}
                aceitaNota="só SVG ou PNG"
              />
              <p className="mt-1.5 max-w-[46ch] text-[11px] leading-[1.5] text-muted/80">
                {slot.dica}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <LinhaCor
            valor={typeof ornamentos.cor === "string" ? ornamentos.cor : ""}
            onChange={(v) => onChange("cor", v)}
          />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline gap-3">
          <span className="font-mono text-label uppercase text-text">ajuste</span>
          <span className="font-mono text-serial text-muted/60">02</span>
          <span className="h-px flex-1 bg-rule" />
        </div>
        <div className="border-t border-rule">
          {AJUSTES.map((medida) => (
            <LinhaMedida
              key={medida.chave}
              medida={medida}
              valor={ornamentos[medida.chave]}
              onChange={(novo) => onChange(medida.chave, novo)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
