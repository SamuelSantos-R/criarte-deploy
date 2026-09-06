import { useEffect, useState, type ReactElement } from "react";
import { Minus, Plus, RotateCcw, Upload } from "lucide-react";
import { instalarFonte, listarFontes, type Fonte } from "@/lib/api";
import { BLOCOS } from "@/lib/secoes";
import { cn } from "@/lib/utils";

export type Medida = {
  chave: string;
  rotulo: string;
  dica: string;
  min: number;
  max: number;
  passo: number;
  padrao: number;
  /** O que aparece à direita do número. Só rótulo — o site sabe a unidade. */
  unidade?: string;
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
    chave: "monogramaTopo",
    rotulo: "folga acima do monograma",
    dica: "Empurra só o monograma para baixo. A régua da secção move o bloco todo; isto move só ele.",
    min: 0,
    max: 120,
    passo: 2,
    padrao: 0,
  },
  {
    chave: "monogramaFolga",
    rotulo: "folga até ao versículo",
    dica: "Espaço entre o monograma e a primeira linha do versículo.",
    min: 0,
    max: 80,
    passo: 2,
    padrao: 4,
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
    chave: "versiculoTamanho",
    rotulo: "versículo",
    dica: "Teto no computador. Versículo comprido ocupa meia página — baixe aqui em vez de partir o texto à mão.",
    min: 12,
    max: 28,
    passo: 1,
    padrao: 22,
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

/**
 * Opacidade em percentagem porque é assim que se pensa nela; o site divide por
 * 100. São as peças que herdam a cor principal esbatida em vez de cor própria.
 */
const OPACIDADES: Medida[] = [
  {
    chave: "manualIconeOpacidade",
    rotulo: "círculo dos ícones",
    dica: "O disco por trás de cada ícone do manual. Alto fecha o cartão, baixo fica só uma sombra.",
    min: 0,
    max: 100,
    passo: 5,
    padrao: 20,
    unidade: "%",
  },
  {
    chave: "musicaBarraOpacidade",
    rotulo: "barra da música",
    dica: "A parte já tocada da faixa, dentro da pill.",
    min: 0,
    max: 100,
    passo: 5,
    padrao: 40,
    unidade: "%",
  },
  {
    chave: "musicaBaseOpacidade",
    rotulo: "base da música",
    dica: "O trilho por baixo da barra. Costuma ficar bem mais fraco que ela.",
    min: 0,
    max: 100,
    passo: 2,
    padrao: 12,
    unidade: "%",
  },
  {
    chave: "musicaEqualizadorOpacidade",
    rotulo: "ondas da música",
    dica: "Os traços que sobem e descem enquanto toca.",
    min: 0,
    max: 100,
    passo: 5,
    padrao: 40,
    unidade: "%",
  },
];

/**
 * Espaçamento em `em`, não em px: o nome dos noivos encolhe no telemóvel e um px
 * cravado abriria lá o dobro do que abre aqui. Fonte de desenho aperta as letras
 * à sua maneira, por isso cada linha tem o seu número.
 */
const ESPACAMENTOS: Medida[] = [
  {
    chave: "noivaEspacamento",
    rotulo: "nome da noiva",
    dica: "Afasta as letras umas das outras. Zero é a fonte como veio.",
    min: -0.05,
    max: 0.4,
    passo: 0.01,
    padrao: 0,
    unidade: "em",
  },
  {
    chave: "eEspacamento",
    rotulo: "o & do meio",
    dica: "Vale só para o & entre os dois nomes.",
    min: -0.05,
    max: 0.4,
    passo: 0.01,
    padrao: 0,
    unidade: "em",
  },
  {
    chave: "noivoEspacamento",
    rotulo: "nome do noivo",
    dica: "Afasta as letras umas das outras. Zero é a fonte como veio.",
    min: -0.05,
    max: 0.4,
    passo: 0.01,
    padrao: 0,
    unidade: "em",
  },
  {
    chave: "noivosAltura",
    rotulo: "altura da linha",
    dica: "A folga entre a noiva, o & e o noivo. Multiplica o tamanho do nome, então abre igual no telemóvel e no computador.",
    min: 0.7,
    max: 1.6,
    passo: 0.05,
    padrao: 0.9,
    unidade: "×",
  },
];

/**
 * O nome no rodapé usa a fonte dos noivos mas não o tamanho deles: lá em cima é
 * um clamp que acompanha a tela, aqui é número fixo. Os padrões são o que estava
 * cravado no componente.
 */
const RODAPE: Medida[] = [
  {
    chave: "rodapeTamanho",
    rotulo: "nome do casal",
    dica: "Tamanho fixo, o mesmo no telemóvel e no computador.",
    min: 20,
    max: 140,
    passo: 1,
    padrao: 55,
  },
  {
    chave: "rodapeEspacamento",
    rotulo: "letras do nome",
    dica: "Afasta as letras umas das outras. Zero é a fonte como veio.",
    min: -0.05,
    max: 0.4,
    passo: 0.01,
    padrao: 0,
    unidade: "em",
  },
  {
    chave: "rodapeAltura",
    rotulo: "altura da linha",
    dica: "Multiplica o tamanho do nome. Só se vê quando o nome parte em duas linhas.",
    min: 0.7,
    max: 1.6,
    passo: 0.05,
    padrao: 1,
    unidade: "×",
  },
  {
    chave: "rodapeDataTamanho",
    rotulo: "data",
    dica: "A linha em maiúsculas por baixo do nome.",
    min: 8,
    max: 24,
    passo: 1,
    padrao: 12,
  },
  {
    chave: "rodapeDataEspacamento",
    rotulo: "letras da data",
    dica: "Texto em maiúsculas pede folga entre as letras; por isso o número é em pixels e não acompanha o tamanho.",
    min: 0,
    max: 12,
    passo: 0.5,
    padrao: 3,
  },
  {
    chave: "rodapeTopo",
    rotulo: "folga em cima",
    dica: "Entre o fim da página e o nome.",
    min: 0,
    max: 200,
    passo: 2,
    padrao: 36,
  },
  {
    chave: "rodapeBase",
    rotulo: "folga embaixo",
    dica: "Entre a assinatura da Criarte e o fim do convite.",
    min: 0,
    max: 200,
    passo: 2,
    padrao: 36,
  },
];

/** O que o Studio grava quando o convite.json ainda não tem a seção. */
export const MEDIDAS_PADRAO: Record<string, number | string> = {
  ...Object.fromEntries(MEDIDAS.map((m) => [m.chave, m.padrao])),
  ...Object.fromEntries(OPACIDADES.map((m) => [m.chave, m.padrao])),
  ...Object.fromEntries(ESPACAMENTOS.map((m) => [m.chave, m.padrao])),
  ...Object.fromEntries(RODAPE.map((m) => [m.chave, m.padrao])),
  noivosFonte: "milton",
};

function preso(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Duas casas chegam para o que se digita à mão (13,5 / 12,25) e evitam dízima. */
function arredonda(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Vírgula é o separador do teclado dele; o `Number` só entende ponto. */
function lerNumero(texto: string): number | null {
  const limpo = texto.replace(",", ".").trim();
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
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
  const mexer = (d: number): void =>
    onChange(arredonda(preso(atual + d, medida.min, medida.max)));
  const noLimite = (d: number): boolean =>
    d < 0 ? atual <= medida.min : atual >= medida.max;
  const unidade = medida.unidade ?? "px";

  // O campo guarda o que está a ser escrito, não o valor: sem isto apagar para
  // reescrever devolvia o número antigo à tecla seguinte. Só ao sair é que vira
  // número, e texto que não é número volta ao que estava.
  const [rascunho, setRascunho] = useState<string | null>(null);
  const fechar = (): void => {
    if (rascunho !== null) {
      const n = lerNumero(rascunho);
      if (n !== null) onChange(arredonda(preso(n, medida.min, medida.max)));
    }
    setRascunho(null);
  };

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

          <span className="flex w-[62px] items-baseline justify-end gap-0.5 pr-1 font-mono text-[12px] tabular-nums text-text">
            <input
              value={rascunho ?? String(atual)}
              onChange={(e) => setRascunho(e.target.value)}
              onBlur={fechar}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setRascunho(null);
              }}
              inputMode="decimal"
              aria-label={`${medida.rotulo} em ${unidade}`}
              className={cn(
                "no-drag w-full min-w-0 bg-transparent text-right font-mono text-[12px] tabular-nums text-text",
                "focus:bg-surface-2 focus:outline-none",
              )}
            />
            <span className="shrink-0 text-muted">{unidade}</span>
          </span>

          <button
            type="button"
            onClick={() => onChange(medida.padrao)}
            disabled={atual === medida.padrao}
            aria-label={`Voltar ${medida.rotulo} ao padrão de ${medida.padrao}${unidade}`}
            title={`Padrão: ${medida.padrao}${unidade}`}
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

/**
 * Topo e base de uma secção lado a lado. Duas linhas de régua por secção davam
 * vinte réguas no painel; aqui a secção é a unidade e os dois números ficam
 * onde se compara um com o outro.
 */
function LinhaEspaco({
  bloco,
  valores,
  onChange,
}: {
  bloco: (typeof BLOCOS)[number];
  valores: Record<string, unknown>;
  onChange: (lado: "topo" | "base", novo: number | undefined) => void;
}): ReactElement {
  const tocada = (["topo", "base"] as const).some((l) => typeof valores[l] === "number");

  return (
    <div className="flex items-center gap-3 border-b border-rule py-2 pl-4 pr-2 last:border-b-0 focus-within:bg-surface-2/40">
      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-text">{bloco.rotulo}</span>

      {(["topo", "base"] as const).map((lado) => {
        const bruto = valores[lado];
        const atual = typeof bruto === "number" && Number.isFinite(bruto) ? bruto : bloco[lado];
        return (
          <label key={lado} className="flex shrink-0 items-baseline gap-1.5">
            <span className="font-mono text-serial uppercase tracking-[0.12em] text-muted/60">
              {lado}
            </span>
            <input
              defaultValue={String(atual)}
              key={`${lado}-${atual}`}
              onBlur={(e) => {
                const n = lerNumero(e.target.value);
                if (n === null) e.target.value = String(atual);
                else onChange(lado, arredonda(preso(n, 0, 400)));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              inputMode="decimal"
              aria-label={`${bloco.rotulo}, folga de ${lado} em pixels`}
              className={cn(
                "no-drag w-[52px] border border-rule bg-transparent px-1.5 py-1 text-right font-mono text-[12px] tabular-nums text-text",
                "hover:border-rule-strong focus:border-accent focus:bg-surface-2 focus:outline-none",
              )}
            />
          </label>
        );
      })}

      <button
        type="button"
        onClick={() => {
          onChange("topo", undefined);
          onChange("base", undefined);
        }}
        disabled={!tocada}
        aria-label={`Voltar ${bloco.rotulo} às folgas de origem`}
        title={`Origem: ${bloco.topo} / ${bloco.base}px`}
        className={cn(
          "no-drag flex h-7 w-7 shrink-0 items-center justify-center text-muted transition-colors hover:text-text",
          "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
          "disabled:cursor-not-allowed disabled:opacity-20 disabled:hover:text-muted",
        )}
      >
        <RotateCcw size={12} />
      </button>
    </div>
  );
}

export function PainelMedidas({
  medidas,
  onChange,
  convidado = false,
}: {
  medidas: Record<string, unknown>;
  onChange: (caminho: (string | number)[], valor: unknown) => void;
  /** Convidado escolhe do banco do anfitrião, mas não instala nada. */
  convidado?: boolean;
}): ReactElement {
  const espacos = (medidas.espacos ?? {}) as Record<string, Record<string, unknown>>;
  const fonte = typeof medidas.noivosFonte === "string" ? medidas.noivosFonte : "milton";
  const [fontes, setFontes] = useState<Fonte[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erroFonte, setErroFonte] = useState<string | null>(null);

  // Entrar ou sair de uma sessão troca o banco debaixo dos pés: como convidado a
  // lista é a do anfitrião, sozinho é a local.
  useEffect(() => {
    void listarFontes()
      .then(setFontes)
      .catch((e) => setErroFonte(e instanceof Error ? e.message : "não deu pra ler o banco"));
  }, [convidado]);

  const carregar = async (): Promise<void> => {
    setCarregando(true);
    setErroFonte(null);
    try {
      const nova = await instalarFonte();
      if (nova) setFontes(nova);
    } catch (e) {
      setErroFonte(e instanceof Error ? e.message : "não deu pra instalar");
    } finally {
      setCarregando(false);
    }
  };

  // A escolha gravada pode ser de uma fonte que ainda não chegou nesta máquina.
  // Some-la da lista faria o radio ficar sem nenhum marcado e o valor virar
  // mistério — melhor mostrá-la e dizer que o ficheiro não está aqui.
  const lista: (Fonte & { ausente?: boolean })[] = fontes.some((f) => f.chave === fonte)
    ? fontes
    : [...fontes, { chave: fonte, nome: fonte, ficheiro: "", bytes: 0, ausente: true }];

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
              onChange={(novo) => onChange([medida.chave], novo)}
            />
          ))}
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-baseline gap-3">
          <span className="font-mono text-label uppercase text-text">nome dos noivos</span>
          <span className="font-mono text-serial text-muted/60">
            {String(ESPACAMENTOS.length).padStart(2, "0")}
          </span>
          <span className="h-px flex-1 bg-rule" />
        </div>
        <p className="mb-3 max-w-[46ch] text-[12px] leading-[1.6] text-muted/80">
          Fonte de desenho costuma colar as letras umas nas outras e as linhas umas
          por cima das outras. Aqui abre-se o nome sem mexer no tamanho — de lado
          por linha, porque não apertam todas igual, e de cima a baixo de uma vez.
        </p>
        <div className="border-t border-rule">
          {ESPACAMENTOS.map((medida) => (
            <LinhaMedida
              key={medida.chave}
              medida={medida}
              valor={medidas[medida.chave]}
              onChange={(novo) => onChange([medida.chave], novo)}
            />
          ))}
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-baseline gap-3">
          <span className="font-mono text-label uppercase text-text">rodapé</span>
          <span className="font-mono text-serial text-muted/60">
            {String(RODAPE.length).padStart(2, "0")}
          </span>
          <span className="h-px flex-1 bg-rule" />
        </div>
        <p className="mb-3 max-w-[46ch] text-[12px] leading-[1.6] text-muted/80">
          O nome do casal fecha o convite na mesma fonte do topo, mas em tamanho
          próprio: aqui não é um clamp, é um número fixo.
        </p>
        <div className="border-t border-rule">
          {RODAPE.map((medida) => (
            <LinhaMedida
              key={medida.chave}
              medida={medida}
              valor={medidas[medida.chave]}
              onChange={(novo) => onChange([medida.chave], novo)}
            />
          ))}
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-baseline gap-3">
          <span className="font-mono text-label uppercase text-text">altura das secções</span>
          <span className="font-mono text-serial text-muted/60">
            {String(BLOCOS.length).padStart(2, "0")}
          </span>
          <span className="h-px flex-1 bg-rule" />
        </div>
        <p className="mb-3 max-w-[46ch] text-[12px] leading-[1.6] text-muted/80">
          A folga em cima e a folga embaixo de cada bloco, em pixels. Secção que
          você não tocar fica com a medida com que o convite foi desenhado.
        </p>
        <div className="border-t border-rule">
          {BLOCOS.map((bloco) => (
            <LinhaEspaco
              key={bloco.id}
              bloco={bloco}
              valores={espacos[bloco.id] ?? {}}
              onChange={(lado, novo) => onChange(["espacos", bloco.id, lado], novo)}
            />
          ))}
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-baseline gap-3">
          <span className="font-mono text-label uppercase text-text">opacidades</span>
          <span className="font-mono text-serial text-muted/60">
            {String(OPACIDADES.length).padStart(2, "0")}
          </span>
          <span className="h-px flex-1 bg-rule" />
        </div>
        <p className="mb-3 max-w-[46ch] text-[12px] leading-[1.6] text-muted/80">
          Peças que não têm cor própria: saem da cor de destaque, só que esbatidas.
          Mudar a cor de destaque muda todas de uma vez.
        </p>
        <div className="border-t border-rule">
          {OPACIDADES.map((medida) => (
            <LinhaMedida
              key={medida.chave}
              medida={medida}
              valor={medidas[medida.chave]}
              onChange={(novo) => onChange([medida.chave], novo)}
            />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline gap-3">
          <span className="font-mono text-label uppercase text-text">fonte dos noivos</span>
          <span className="font-mono text-serial text-muted/60">
            {String(fontes.length).padStart(2, "0")}
          </span>
          <span className="h-px flex-1 bg-rule" />
          {!convidado && (
            <button
              type="button"
              onClick={() => void carregar()}
              disabled={carregando}
              className={cn(
                "no-drag flex shrink-0 items-center gap-1.5 self-center border border-rule px-2.5 py-1 font-mono text-serial uppercase tracking-[0.12em] text-muted transition-colors",
                "hover:border-rule-strong hover:text-text",
                "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
                "disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              <Upload size={11} strokeWidth={1.8} aria-hidden />
              {carregando ? "a instalar" : "carregar fonte"}
            </button>
          )}
        </div>
        {/* Sem amostra visual de propósito: o Studio não carrega as fontes do site,
            e um preview desenhado com a fonte errada mente mais do que ajuda. */}
        <p className="mb-3 max-w-[46ch] text-[12px] leading-[1.6] text-muted/80">
          Vale para os dois nomes e o <span className="font-mono">&amp;</span> do meio. A
          amostra de verdade é o preview ao lado.{" "}
          {convidado
            ? "O banco é o do anfitrião — é ele quem instala fonte nova."
            : "Fonte nova entra no banco e fica disponível em todos os convites."}
        </p>

        {erroFonte && (
          <p className="mb-3 border-l-2 border-accent pl-3 font-mono text-[11px] leading-[1.6] text-text">
            {erroFonte}
          </p>
        )}

        {lista.length === 0 ? (
          <p className="border-y border-rule py-4 pl-4 text-[12px] leading-[1.6] text-muted/70">
            O banco está vazio. Carregue um <span className="font-mono">.ttf</span>,{" "}
            <span className="font-mono">.otf</span>, <span className="font-mono">.woff</span> ou{" "}
            <span className="font-mono">.woff2</span>.
          </p>
        ) : (
          <div className="border-y border-rule">
            {lista.map((f) => (
              <label
                key={f.chave}
                className={cn(
                  "no-drag flex cursor-pointer items-center gap-3 border-b border-rule py-2.5 pl-4 pr-3 last:border-b-0",
                  "focus-within:outline focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-accent",
                  f.chave === fonte ? "bg-accent/10" : "hover:bg-surface-2/40",
                )}
              >
                <input
                  type="radio"
                  name="noivosFonte"
                  checked={f.chave === fonte}
                  onChange={() => onChange(["noivosFonte"], f.chave)}
                  className="no-drag h-3.5 w-3.5 shrink-0 accent-accent"
                />
                <span
                  className={cn(
                    "min-w-0 truncate font-mono text-[12px]",
                    f.chave === fonte ? "text-text" : "text-muted",
                  )}
                >
                  {f.nome}
                </span>
                <span className="ml-auto shrink-0 font-mono text-serial uppercase tabular-nums text-muted/60">
                  {f.ausente ? "não está no banco" : `${Math.round(f.bytes / 1024)} kb`}
                </span>
              </label>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
