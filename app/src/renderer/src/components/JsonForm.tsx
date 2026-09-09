import { useEffect, useRef, useState, type ReactElement } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, Rule, Textarea } from "@/components/ui/primitives";
import { CampoArquivo, ehAsset } from "@/components/CampoArquivo";
import { PainelTema } from "@/components/PainelTema";
import { PainelMedidas } from "@/components/PainelMedidas";
import { PainelOrnamentos } from "@/components/PainelOrnamentos";
import { rotulo } from "@/lib/secoes";
import { cn } from "@/lib/utils";

export type Caminho = (string | number)[];

/** Clona só o galho que mudou — o resto do convite fica com a mesma referência. */
export function setIn(alvo: unknown, caminho: Caminho, valor: unknown): unknown {
  if (caminho.length === 0) return valor;
  const [chave, ...resto] = caminho;
  if (Array.isArray(alvo)) {
    const copia = alvo.slice();
    const i = Number(chave);
    copia[i] = setIn(copia[i], resto, valor);
    return copia;
  }
  const obj = (alvo ?? {}) as Record<string, unknown>;
  return { ...obj, [String(chave)]: setIn(obj[String(chave)], resto, valor) };
}

export function getIn(alvo: unknown, caminho: Caminho): unknown {
  return caminho.reduce<unknown>((acc, chave) => {
    if (acc === null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[String(chave)];
  }, alvo);
}

/** Molde a partir do primeiro item: mantém as chaves, esvazia os valores. */
function molde(exemplo: unknown): unknown {
  if (typeof exemplo === "string") return "";
  if (typeof exemplo === "number") return 0;
  if (typeof exemplo === "boolean") return false;
  if (Array.isArray(exemplo)) return [];
  if (exemplo && typeof exemplo === "object") {
    return Object.fromEntries(Object.entries(exemplo).map(([k, v]) => [k, molde(v)]));
  }
  return "";
}

type Props = { valor: unknown; caminho: Caminho; onChange: (caminho: Caminho, valor: unknown) => void };

/**
 * Campo curto é `input`, e num `input` não existe Enter: não havia como pôr uma
 * quebra no título de um evento sem ir ao ficheiro à mão. Agora o Enter insere
 * a quebra no sítio do cursor — o valor passa a ter `\n`, o campo vira caixa de
 * texto e o cursor continua onde estava, em vez de saltar para o fim.
 */
function CampoTexto({ valor, caminho, onChange, label }: Props & { valor: string; label: string }): ReactElement {
  const longo = valor.length > 72 || valor.includes("\n");
  const [cursor, setCursor] = useState<number | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (cursor === null || !area.current) return;
    area.current.focus();
    area.current.setSelectionRange(cursor, cursor);
    setCursor(null);
  }, [cursor]);

  return (
    <Field label={label}>
      {longo ? (
        <Textarea
          ref={area}
          rows={Math.min(8, valor.split("\n").length + 1)}
          value={valor}
          onChange={(e) => onChange(caminho, e.target.value)}
        />
      ) : (
        <Input
          value={valor}
          title="Enter quebra a linha"
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey) return;
            e.preventDefault();
            const el = e.currentTarget;
            const ini = el.selectionStart ?? valor.length;
            const fim = el.selectionEnd ?? ini;
            onChange(caminho, `${valor.slice(0, ini)}\n${valor.slice(fim)}`);
            setCursor(ini + 1);
          }}
          onChange={(e) => onChange(caminho, e.target.value)}
        />
      )}
    </Field>
  );
}

/**
 * Fora do `Lista` de proposito: definida la dentro, era um tipo de componente
 * novo a cada render, e o React desmontava o botao a meio do arrasto — o
 * `dragend` nunca chegava e a lista ficava presa em "a arrastar".
 */
function Pega({
  i,
  label,
  pegado,
  onPegar,
  onLargar,
  onMover,
}: {
  i: number;
  label: string;
  pegado: number | null;
  onPegar: (i: number) => void;
  onLargar: () => void;
  onMover: (de: number, para: number) => void;
}): ReactElement {
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        onPegar(i);
        e.dataTransfer.effectAllowed = "move";
        // Sem carga nenhuma o Chromium cancela o arrasto ao primeiro movimento.
        e.dataTransfer.setData("text/plain", String(i));
      }}
      onDragEnd={onLargar}
      onKeyDown={(e) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        onMover(i, e.key === "ArrowUp" ? i - 1 : i + 1);
      }}
      aria-label={`Mover ${label} ${i + 1} — arraste, ou use as setas`}
      title="Arraste para trocar a ordem (ou setas ↑ ↓)"
      className={cn(
        "no-drag flex h-7 w-5 shrink-0 cursor-grab items-center justify-center text-muted",
        "transition-colors hover:text-text active:cursor-grabbing",
        "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-focus",
        pegado === i && "text-cyan",
      )}
    >
      <GripVertical size={13} />
    </button>
  );
}

/**
 * Ordem por arrasto. Antes, mudar a ordem dos eventos obrigava a apagar um e
 * voltar a escrevê-lo no sítio certo — o formulário só sabia acrescentar no fim.
 *
 * A pega também responde às setas com o foco em cima: arrastar é o gesto rápido,
 * mas quem chega pelo teclado não pode ficar sem caminho.
 */
function Lista({ valor, caminho, onChange, label }: Props & { valor: unknown[]; label: string }): ReactElement {
  const base = valor[0];
  const deObjetos = base !== null && typeof base === "object" && !Array.isArray(base);
  const [pegado, setPegado] = useState<number | null>(null);
  const [alvo, setAlvo] = useState<number | null>(null);

  const mover = (de: number, para: number): void => {
    // Os dois extremos: uma origem fora da lista fazia o splice devolver vazio e
    // um `undefined` entrava na lista no lugar do item. Acontece se o item for
    // apagado com o arrasto ainda a decorrer.
    if (de === para) return;
    if (de < 0 || de >= valor.length || para < 0 || para >= valor.length) return;
    const copia = [...valor];
    const [item] = copia.splice(de, 1);
    copia.splice(para, 0, item);
    onChange(caminho, copia);
  };

  const largar = (): void => {
    if (pegado !== null && alvo !== null) mover(pegado, alvo);
    setPegado(null);
    setAlvo(null);
  };

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center gap-3">
        <span className="font-narrow font-semibold text-label uppercase text-muted">{label}</span>
        <span className="font-narrow font-semibold text-gauge text-muted">{String(valor.length).padStart(2, "0")}</span>
        <span className="h-px flex-1 bg-rule" />
        <Button
          variant="ghost"
          onClick={() => onChange(caminho, [...valor, molde(base ?? "")])}
          aria-label={`Adicionar em ${label}`}
        >
          <Plus size={13} /> Adicionar
        </Button>
      </div>
      <div className="space-y-2">
        {valor.map((item, i) => (
          <div
            key={i}
            onDragOver={(e) => {
              if (pegado === null) return;
              e.preventDefault();
              setAlvo(i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              largar();
            }}
            className={cn(
              deObjetos
                ? "relative border-l-2 border-rule-strong bg-surface/60 py-4 pl-5 pr-4"
                : "flex items-center gap-2",
              // A marca do destino é uma linha, não um realce do bloco inteiro:
              // o que interessa saber é entre que dois itens ele vai cair.
              pegado !== null && alvo === i && pegado !== i &&
                (i < pegado ? "border-t-2 border-t-cyan" : "border-b-2 border-b-cyan"),
              pegado === i && "opacity-50",
            )}
          >
            {deObjetos ? (
              <>
                <span className="absolute -left-[9px] top-4 bg-ground px-1 font-narrow font-semibold text-gauge text-muted">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="absolute right-9 top-3">
                  <Pega i={i} label={label} pegado={pegado} onPegar={setPegado} onLargar={largar} onMover={mover} />
                </div>
                <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                  <Nos valor={item} caminho={[...caminho, i]} onChange={onChange} />
                </div>
                <button
                  className="no-drag absolute right-3 top-3 p-1 text-muted transition-colors hover:text-pencil"
                  onClick={() => onChange(caminho, valor.filter((_, k) => k !== i))}
                  aria-label={`Remover item ${i + 1}`}
                  title="Remover"
                >
                  <Trash2 size={14} />
                </button>
              </>
            ) : (
              <>
                <Pega i={i} label={label} pegado={pegado} onPegar={setPegado} onLargar={largar} onMover={mover} />
                <span className="w-6 shrink-0 font-narrow font-semibold text-gauge text-muted">{String(i + 1).padStart(2, "0")}</span>
                <Input value={String(item ?? "")} onChange={(e) => onChange([...caminho, i], e.target.value)} />
                <button
                  className="no-drag p-2 text-muted transition-colors hover:text-pencil"
                  onClick={() => onChange(caminho, valor.filter((_, k) => k !== i))}
                  aria-label={`Remover item ${i + 1}`}
                  title="Remover"
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Renderiza as chaves de um objeto. Objeto aninhado vira bloco com régua. */
function Nos({ valor, caminho, onChange }: Props): ReactElement {
  const obj = (valor ?? {}) as Record<string, unknown>;
  return (
    <>
      {Object.entries(obj).map(([chave, v]) => {
        const filho: Caminho = [...caminho, chave];
        const label = rotulo(chave);
        if (typeof v === "string") {
          if (ehAsset(chave, v)) {
            return (
              <div key={chave} className="col-span-2">
                <CampoArquivo valor={v} label={label} onChange={(novo) => onChange(filho, novo)} />
              </div>
            );
          }
          const largo = v.length > 72 || v.includes("\n");
          return (
            <div key={chave} className={largo ? "col-span-2" : ""}>
              <CampoTexto valor={v} caminho={filho} onChange={onChange} label={label} />
            </div>
          );
        }
        if (typeof v === "number") {
          return (
            <Field key={chave} label={label}>
              <Input
                type="number"
                value={String(v)}
                onChange={(e) => onChange(filho, e.target.value === "" ? 0 : Number(e.target.value))}
              />
            </Field>
          );
        }
        if (typeof v === "boolean") {
          return (
            <label key={chave} className="flex items-center gap-2 self-end py-2">
              <input
                type="checkbox"
                checked={v}
                onChange={(e) => onChange(filho, e.target.checked)}
                className="no-drag h-4 w-4 accent-cyan"
              />
              <span className="font-narrow font-semibold text-label uppercase text-muted">{label}</span>
            </label>
          );
        }
        if (Array.isArray(v)) {
          return (
            <div key={chave} className="col-span-2">
              <Lista valor={v} caminho={filho} onChange={onChange} label={label} />
            </div>
          );
        }
        if (v && typeof v === "object") {
          return (
            <div key={chave} className="col-span-2">
              <Rule>{label}</Rule>
              <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                <Nos valor={v} caminho={filho} onChange={onChange} />
              </div>
            </div>
          );
        }
        return null;
      })}
    </>
  );
}

/**
 * O RSVP some da página sozinho quando não tem formulário ligado — é a mesma
 * condição que o componente usa para não desenhar nada. Era o único caso em que
 * o Studio criava a secção, dizia que correu bem, e o convite continuava igual.
 */
function semFormulario(secao: string, valor: unknown): boolean {
  if (secao !== "rsvp") return false;
  const form = (valor as Record<string, unknown>).form;
  if (!form || typeof form !== "object") return true;
  const { url, nome, comparecer } = form as Record<string, unknown>;
  if (typeof nome !== "string" || !nome.trim()) return true;
  if (typeof comparecer !== "string" || !comparecer.trim()) return true;
  return typeof url !== "string" || !url.includes("docs.google.com/forms/");
}

/** Uma seção por vez: `secao` é uma chave de primeiro nível do convite.json. */
export function JsonForm({
  dados,
  secao,
  onChange,
  onPatch,
  convidado = false,
}: {
  dados: Record<string, unknown>;
  secao: string;
  onChange: (proximo: Record<string, unknown>) => void;
  /** Só o galho que mudou. É o que o co-op manda pela rede — o objeto inteiro não. */
  onPatch?: (caminho: Caminho, valor: unknown) => void;
  /** Convidado só mexe nos formulários: instalar fonte é do anfitrião. */
  convidado?: boolean;
}): ReactElement {
  const alterar = (caminho: Caminho, valor: unknown): void => {
    onChange(setIn(dados, caminho, valor) as Record<string, unknown>);
    onPatch?.(caminho, valor);
  };

  const valor = dados[secao];
  const label = rotulo(secao);

  if (secao === "tema" && valor !== null && typeof valor === "object" && !Array.isArray(valor)) {
    return (
      <PainelTema
        tema={valor as Record<string, string>}
        onChange={(token, cor) => alterar([secao, token], cor)}
        // Espalhado por cima do que está lá: cor que a paleta não define — de um
        // modelo antigo — fica onde estava em vez de desaparecer do convite.
        onAplicarPaleta={(cores) =>
          alterar([secao], { ...(valor as Record<string, string>), ...cores })
        }
      />
    );
  }
  if (secao === "medidas" && valor !== null && typeof valor === "object" && !Array.isArray(valor)) {
    return (
      <PainelMedidas
        medidas={valor as Record<string, unknown>}
        onChange={(caminho, novo) => alterar([secao, ...caminho], novo)}
        convidado={convidado}
      />
    );
  }
  if (secao === "ornamentos" && valor !== null && typeof valor === "object" && !Array.isArray(valor)) {
    return (
      <PainelOrnamentos
        ornamentos={valor as Record<string, unknown>}
        onChange={(caminho, novo) => alterar([secao, ...caminho], novo)}
      />
    );
  }
  if (Array.isArray(valor)) {
    return <Lista valor={valor} caminho={[secao]} onChange={alterar} label={label} />;
  }
  if (valor !== null && typeof valor === "object") {
    return (
      <>
        {semFormulario(secao, valor) && (
          <p className="mb-4 border-l-2 border-cyan pl-3 text-[13px] text-text">
            Enquanto o URL do formulário estiver vazio a secção não aparece no convite: sem
            formulário, o botão engolia a resposta. Cola aqui o link do Google Form deste casal
            (o `docs.google.com/forms/…`) e ela entra no ar.
          </p>
        )}
        <div className="grid grid-cols-2 gap-x-5 gap-y-3">
          <Nos valor={valor} caminho={[secao]} onChange={alterar} />
        </div>
      </>
    );
  }
  // Seção escalar (ex.: `data`) — um campo só, sem grid.
  return (
    <div className="max-w-[420px]">
      <Nos valor={{ [secao]: valor }} caminho={[]} onChange={alterar} />
    </div>
  );
}
