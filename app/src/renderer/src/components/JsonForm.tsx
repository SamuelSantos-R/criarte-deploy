import { type ReactElement } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, Rule, Textarea } from "@/components/ui/primitives";
import { CampoArquivo, ehAsset } from "@/components/CampoArquivo";
import { PainelTema } from "@/components/PainelTema";
import { PainelMedidas } from "@/components/PainelMedidas";
import { PainelOrnamentos } from "@/components/PainelOrnamentos";
import { rotulo } from "@/lib/secoes";

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

function CampoTexto({ valor, caminho, onChange, label }: Props & { valor: string; label: string }): ReactElement {
  const longo = valor.length > 72 || valor.includes("\n");
  return (
    <Field label={label}>
      {longo ? (
        <Textarea rows={Math.min(8, valor.split("\n").length + 1)} value={valor} onChange={(e) => onChange(caminho, e.target.value)} />
      ) : (
        <Input value={valor} onChange={(e) => onChange(caminho, e.target.value)} />
      )}
    </Field>
  );
}

function Lista({ valor, caminho, onChange, label }: Props & { valor: unknown[]; label: string }): ReactElement {
  const base = valor[0];
  const deObjetos = base !== null && typeof base === "object" && !Array.isArray(base);
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center gap-3">
        <span className="font-mono text-label uppercase text-muted">{label}</span>
        <span className="font-mono text-serial text-muted/60">{String(valor.length).padStart(2, "0")}</span>
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
            className={
              deObjetos
                ? "relative border-l-2 border-rule-strong bg-surface/60 py-4 pl-5 pr-4"
                : "flex items-center gap-2"
            }
          >
            {deObjetos ? (
              <>
                <span className="absolute -left-[9px] top-4 bg-ground px-1 font-mono text-serial text-muted">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                  <Nos valor={item} caminho={[...caminho, i]} onChange={onChange} />
                </div>
                <button
                  className="no-drag absolute right-3 top-3 p-1 text-muted transition-colors hover:text-bad"
                  onClick={() => onChange(caminho, valor.filter((_, k) => k !== i))}
                  aria-label={`Remover item ${i + 1}`}
                  title="Remover"
                >
                  <Trash2 size={14} />
                </button>
              </>
            ) : (
              <>
                <span className="w-6 shrink-0 font-mono text-serial text-muted">{String(i + 1).padStart(2, "0")}</span>
                <Input value={String(item ?? "")} onChange={(e) => onChange([...caminho, i], e.target.value)} />
                <button
                  className="no-drag p-2 text-muted transition-colors hover:text-bad"
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
                className="no-drag h-4 w-4 accent-accent"
              />
              <span className="font-mono text-label uppercase text-muted">{label}</span>
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
      />
    );
  }
  if (secao === "medidas" && valor !== null && typeof valor === "object" && !Array.isArray(valor)) {
    return (
      <PainelMedidas
        medidas={valor as Record<string, unknown>}
        onChange={(chave, novo) => alterar([secao, chave], novo)}
        convidado={convidado}
      />
    );
  }
  if (secao === "ornamentos" && valor !== null && typeof valor === "object" && !Array.isArray(valor)) {
    return (
      <PainelOrnamentos
        ornamentos={valor as Record<string, unknown>}
        onChange={(chave, novo) => alterar([secao, chave], novo)}
      />
    );
  }
  if (Array.isArray(valor)) {
    return <Lista valor={valor} caminho={[secao]} onChange={alterar} label={label} />;
  }
  if (valor !== null && typeof valor === "object") {
    return (
      <div className="grid grid-cols-2 gap-x-5 gap-y-3">
        <Nos valor={valor} caminho={[secao]} onChange={alterar} />
      </div>
    );
  }
  // Seção escalar (ex.: `data`) — um campo só, sem grid.
  return (
    <div className="max-w-[420px]">
      <Nos valor={{ [secao]: valor }} caminho={[]} onChange={alterar} />
    </div>
  );
}
