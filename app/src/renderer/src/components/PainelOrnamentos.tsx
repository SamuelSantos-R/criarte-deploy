import { type ReactElement } from "react";
import { AlignLeft, AlignRight, RotateCcw } from "lucide-react";
import { CampoArquivo } from "@/components/CampoArquivo";
import { LinhaMedida, type Medida } from "@/components/PainelMedidas";
import { SeletorCor, hexValido } from "@/components/SeletorCor";
import { ANCORAS_ORNAMENTO } from "@/lib/secoes";
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

export const ORNAMENTOS_PADRAO: Record<string, string | number | boolean> = {
  esquerdo: "",
  direito: "/assets/div-flor.svg",
  cor: "",
  tamanho: 360,
  deslocamento: 0,
  rodape: true,
};

/**
 * Deslocamento e lado só desta arte. Vazio herda o geral em vez de gravar o mesmo
 * número em dez sítios — mexer no geral continua a mover as que ninguém tocou.
 */
function LinhaAncora({
  ancora,
  valor,
  lado,
  geral,
  onChange,
  onLado,
}: {
  ancora: { id: string; rotulo: string; lado: "left" | "right" };
  valor: unknown;
  lado: unknown;
  geral: number;
  onChange: (novo: number | undefined) => void;
  onLado: (novo: "left" | "right") => void;
}): ReactElement {
  const proprio = typeof valor === "number" && Number.isFinite(valor);
  const atual = proprio ? (valor as number) : geral;
  const ladoAtual = lado === "left" || lado === "right" ? lado : ancora.lado;

  return (
    <div className="flex items-center gap-3 border-b border-rule py-2 pl-4 pr-2 last:border-b-0 focus-within:bg-surface-2/40">
      <span className="min-w-0 flex-1 truncate text-[12px] text-text">
        {ancora.rotulo}
      </span>
      <div className="flex shrink-0 border border-rule rounded-lg" role="group" aria-label={`Lado da arte de ${ancora.rotulo}`}>
        {(["left", "right"] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => onLado(l)}
            aria-pressed={ladoAtual === l}
            title={l === "left" ? "Arte no canto esquerdo" : "Arte no canto direito"}
            className={cn(
              "no-drag flex h-7 w-7 items-center justify-center transition-colors",
              "focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cyan",
              ladoAtual === l
                ? "bg-cyan/[0.07] text-text"
                : "text-muted hover:text-text",
            )}
          >
            {l === "left" ? <AlignLeft size={12} /> : <AlignRight size={12} />}
          </button>
        ))}
      </div>
      {!proprio && (
        <span className="shrink-0 font-narrow font-semibold text-gauge text-muted">
          herda
        </span>
      )}
      <input
        key={`${ancora.id}-${atual}-${proprio}`}
        defaultValue={String(atual)}
        onBlur={(e) => {
          const limpo = e.target.value.replace(",", ".").trim();
          const n = Number(limpo);
          if (limpo === "" || !Number.isFinite(n)) {
            e.target.value = String(atual);
            return;
          }
          onChange(Math.round(Math.min(200, Math.max(-200, n)) * 100) / 100);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        inputMode="decimal"
        aria-label={`Subir ou descer a arte de ${ancora.rotulo}, em pixels`}
        className={cn(
          "no-drag w-[58px] shrink-0 border border-rule bg-transparent px-1.5 py-1 text-right gauge font-narrow text-[12px] font-semibold rounded-lg",
          "hover:border-rule-strong focus:border-cyan focus:bg-surface-2 focus:outline-hidden",
          proprio ? "text-text" : "text-muted",
        )}
      />
      <button
        type="button"
        onClick={() => onChange(undefined)}
        disabled={!proprio}
        aria-label={`Devolver ${ancora.rotulo} ao deslocamento geral`}
        title="Voltar a herdar o deslocamento geral"
        className={cn(
          "no-drag flex h-7 w-7 shrink-0 items-center justify-center text-muted transition-colors hover:text-text",
          "focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cyan",
          "disabled:cursor-not-allowed disabled:opacity-20 disabled:hover:text-muted",
        )}
      >
        <RotateCcw size={12} />
      </button>
    </div>
  );
}

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
            <span className="shrink-0 font-narrow font-semibold text-gauge text-pencil">hex inválido</span>
          )}
        </div>
        <p className="mt-0.5 max-w-[42ch] text-[12px] leading-normal text-muted">
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
            "no-drag shrink-0 self-start px-3 py-2.5 font-narrow font-semibold text-gauge",
            "text-muted hover:text-text",
            "focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-focus",
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
          "placeholder:normal-case placeholder:text-muted focus:bg-surface-2 focus:outline-hidden",
          valido ? "text-muted" : "text-pencil",
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
  onChange: (caminho: (string | number)[], valor: unknown) => void;
}): ReactElement {
  const deslocamentos = (ornamentos.deslocamentos ?? {}) as Record<string, unknown>;
  const lados = (ornamentos.lados ?? {}) as Record<string, unknown>;
  const geral =
    typeof ornamentos.deslocamento === "number" && Number.isFinite(ornamentos.deslocamento)
      ? ornamentos.deslocamento
      : 0;
  const noRodape = ornamentos.rodape !== false;

  return (
    <div className="max-w-[520px]">
      <p className="mb-7 max-w-[46ch] text-[13px] leading-[1.6] text-muted">
        A arte que aparece no canto de cada secção. Só SVG ou PNG — o desenho é
        recortado no canto e formato com fundo chapado deixa um quadrado à vista.
      </p>

      <section className="mb-8">
        <div className="mb-3 flex items-baseline gap-3">
          <span className="font-narrow font-semibold text-label text-text">arte</span>
          <span className="font-narrow font-semibold text-gauge text-muted">02</span>
          <span className="h-px flex-1 bg-rule" />
        </div>
        <div className="flex flex-col gap-5">
          {SLOTS.map((slot) => (
            <div key={slot.chave}>
              <CampoArquivo
                label={slot.rotulo}
                valor={typeof ornamentos[slot.chave] === "string" ? (ornamentos[slot.chave] as string) : ""}
                onChange={(v) => onChange([slot.chave], v)}
                aceita={SVG_OU_PNG}
                aceitaNota="só SVG ou PNG"
              />
              <p className="mt-1.5 max-w-[46ch] text-[11px] leading-normal text-muted">
                {slot.dica}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <LinhaCor
            valor={typeof ornamentos.cor === "string" ? ornamentos.cor : ""}
            onChange={(v) => onChange(["cor"], v)}
          />
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-baseline gap-3">
          <span className="font-narrow font-semibold text-label text-text">ajuste</span>
          <span className="font-narrow font-semibold text-gauge text-muted">02</span>
          <span className="h-px flex-1 bg-rule" />
        </div>
        <div className="border-t border-rule">
          {AJUSTES.map((medida) => (
            <LinhaMedida
              key={medida.chave}
              medida={medida}
              valor={ornamentos[medida.chave]}
              onChange={(novo) => onChange([medida.chave], novo)}
            />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline gap-3">
          <span className="font-narrow font-semibold text-label text-text">por secção</span>
          <span className="font-narrow font-semibold text-gauge text-muted">
            {String(ANCORAS_ORNAMENTO.length).padStart(2, "0")}
          </span>
          <span className="h-px flex-1 bg-rule" />
        </div>
        <p className="mb-3 max-w-[46ch] text-[12px] leading-[1.6] text-muted">
          Sobe (negativo) ou desce (positivo) só a arte daquela secção. Enquanto
          diz <span className="font-mono">herda</span>, ela segue o ajuste geral acima.
          O par de setas troca o canto em que a arte se encosta.
        </p>

        <label
          className={cn(
            "no-drag mb-4 flex cursor-pointer items-center gap-3 border-y border-rule py-2.5 pl-4 pr-3",
            "focus-within:outline-solid focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-cyan",
          )}
        >
          <input
            type="checkbox"
            checked={noRodape}
            onChange={(e) => onChange(["rodape"], e.target.checked)}
            className="no-drag h-3.5 w-3.5 shrink-0 accent-cyan"
          />
          <span className="min-w-0 flex-1">
            <span className="text-[12px] text-text">arte no rodapé</span>
            <span className="mt-0.5 block max-w-[42ch] text-[11px] leading-normal text-muted">
              É a única que entra por baixo do bloco todo. Desligada, o rodapé fica
              limpo — o slot continua aqui para o próximo convite.
            </span>
          </span>
        </label>

        <div className="border-t border-rule">
          {ANCORAS_ORNAMENTO.map((ancora) => (
            <LinhaAncora
              key={ancora.id}
              ancora={ancora}
              valor={deslocamentos[ancora.id]}
              lado={lados[ancora.id]}
              geral={geral}
              onChange={(novo) => onChange(["deslocamentos", ancora.id], novo)}
              onLado={(novo) => onChange(["lados", ancora.id], novo)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
