import { type ReactElement } from "react";
import { Wand2 } from "lucide-react";
import { Button, Field, Input, Rule, Textarea } from "@/components/ui/primitives";
import { ehAsset } from "@/components/CampoArquivo";
import { rotulo } from "@/lib/secoes";
import { sugestao } from "@/lib/ingles";
import type { Caminho } from "@/components/JsonForm";

/**
 * O convite em inglês, para os convidados de fora. Não é um segundo convite: é o
 * bloco `en` do convite.json, que o site põe por cima do português só quando o
 * link do convidado leva `&l=en`. Aqui aparecem todos os textos do convite numa
 * página só, o português por cima e a caixa do inglês por baixo — os painéis de
 * cada secção (Hero, Galeria…) não precisam de saber que há dois idiomas.
 *
 * Caixa vazia sai em português. Assim um convite meio traduzido nunca mostra um
 * buraco, e quem não tem convidado de fora não tem de passar por aqui.
 */

/** Secções sem texto para o convidado ler: cores, medidas, ficheiros, controlo. */
const FORA = new Set([
  "en",
  "secoes",
  "tema",
  "medidas",
  "ornamentos",
  "molduras",
  "assets",
  "r2",
  "data",
  "noivos",
  "envelope",
  "musica",
]);

/** Chaves que guardam dados, não frases — mesmo sendo texto. */
const CHAVES_DE_DADO =
  /^(posicao|mapa|url|link|iban|cor|cores|fonte|icone|olha|foto|telefone|email|limite|prazo|hora|horario|zoom|aliancas|monograma|capa|arquivo|video)$/i;

/** Texto que é hora, data, número ou cor: igual nos dois idiomas. */
const SEM_PALAVRAS = /^[\d\s:.,h/\-–+#()%]*$/i;

function traduzivel(chave: string, v: string): boolean {
  if (v.trim() === "" || CHAVES_DE_DADO.test(chave) || ehAsset(chave, v)) return false;
  // `entry.123` é o campo do Google Form do RSVP, não frase.
  if (/^https?:\/\//.test(v) || /^entry\.\d+$/.test(v) || SEM_PALAVRAS.test(v)) return false;
  return true;
}

function temTexto(v: unknown, chave = ""): boolean {
  if (typeof v === "string") return traduzivel(chave, v);
  if (Array.isArray(v)) return v.some((x) => temTexto(x, chave));
  if (v && typeof v === "object") return Object.entries(v).some(([k, x]) => temTexto(x, k));
  return false;
}

/**
 * Como o `setIn`, mas um índice numérico cria lista, não objeto: o site funde o
 * inglês por cima posição a posição, e `{ "0": … }` no lugar de `[…]` seria
 * deitado fora como formato errado. Buraco fica `null`, que no site é "igual ao
 * português".
 */
function gravar(alvo: unknown, caminho: Caminho, valor: unknown): unknown {
  if (caminho.length === 0) return valor;
  const [chave, ...resto] = caminho;
  if (typeof chave === "number") {
    const lista = Array.isArray(alvo) ? alvo.slice() : [];
    while (lista.length <= chave) lista.push(null);
    lista[chave] = gravar(lista[chave], resto, valor);
    return lista;
  }
  const obj = alvo && typeof alvo === "object" && !Array.isArray(alvo) ? (alvo as Record<string, unknown>) : {};
  return { ...obj, [chave]: gravar(obj[chave], resto, valor) };
}

function ler(alvo: unknown, caminho: Caminho): unknown {
  return caminho.reduce<unknown>(
    (acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[String(k)] : undefined),
    alvo,
  );
}

type Props = {
  pt: unknown;
  en: unknown;
  caminho: Caminho;
  onChange: (caminho: Caminho, valor: unknown) => void;
};

function Par({ pt, en, caminho, onChange, label }: Props & { pt: string; label: string }): ReactElement {
  const valor = typeof en === "string" ? en : "";
  const longo = pt.length > 72 || pt.includes("\n");
  return (
    <div className={longo ? "col-span-2" : ""}>
      <Field label={label}>
        <p className="mb-1.5 whitespace-pre-line text-[12px] leading-[1.5] text-muted">{pt}</p>
        {longo ? (
          <Textarea
            rows={Math.min(8, pt.split("\n").length + 1)}
            value={valor}
            placeholder="English…"
            onChange={(e) => onChange(caminho, e.target.value)}
          />
        ) : (
          <Input value={valor} placeholder="English…" onChange={(e) => onChange(caminho, e.target.value)} />
        )}
      </Field>
    </div>
  );
}

/**
 * Lista de frases (as linhas da chamada do hero): uma caixa só, uma linha por
 * linha. A tradução raramente tem o mesmo número de linhas que o original.
 */
function Linhas({ pt, en, caminho, onChange, label }: Props & { pt: string[]; label: string }): ReactElement {
  const valor = Array.isArray(en) ? en.filter((l) => typeof l === "string").join("\n") : "";
  return (
    <div className="col-span-2">
      <Field label={label} hint="uma linha por linha">
        <p className="mb-1.5 whitespace-pre-line text-[12px] leading-[1.5] text-muted">{pt.join("\n")}</p>
        <Textarea
          rows={Math.max(2, pt.length + 1)}
          value={valor}
          placeholder="English…"
          onChange={(e) => onChange(caminho, e.target.value === "" ? [] : e.target.value.split("\n"))}
        />
      </Field>
    </div>
  );
}

function Nos({ pt, en, caminho, onChange }: Props): ReactElement {
  const obj = (pt ?? {}) as Record<string, unknown>;
  return (
    <>
      {Object.entries(obj).map(([chave, v]) => {
        if (!temTexto(v, chave)) return null;
        const filho: Caminho = [...caminho, chave];
        const enFilho = ler(en, [chave]);
        const label = rotulo(chave);
        if (typeof v === "string") {
          return <Par key={chave} pt={v} en={enFilho} caminho={filho} onChange={onChange} label={label} />;
        }
        if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
          return <Linhas key={chave} pt={v as string[]} en={enFilho} caminho={filho} onChange={onChange} label={label} />;
        }
        if (Array.isArray(v)) {
          return (
            <div key={chave} className="col-span-2 space-y-3">
              {v.map((item, i) =>
                temTexto(item) ? (
                  <div key={i} className="relative rounded-lg bg-surface-2 py-4 pl-5 pr-4">
                    <span className="absolute left-[-9px] top-4 bg-ground px-1 font-narrow font-semibold text-gauge text-muted">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                      <Nos pt={item} en={ler(enFilho, [i])} caminho={[...filho, i]} onChange={onChange} />
                    </div>
                  </div>
                ) : null,
              )}
            </div>
          );
        }
        return (
          <div key={chave} className="col-span-2">
            <Rule>{label}</Rule>
            <div className="grid grid-cols-2 gap-x-5 gap-y-3">
              <Nos pt={v} en={enFilho} caminho={filho} onChange={onChange} />
            </div>
          </div>
        );
      })}
    </>
  );
}

/**
 * Escreve nas caixas vazias a tradução das frases que todos os convites têm.
 * Nunca por cima do que já foi escrito: quem ajustou uma tradução não a perde.
 */
function preencherPadrao(dados: Record<string, unknown>): { en: Record<string, unknown>; quantos: number } {
  let en: unknown = dados.en ?? {};
  let quantos = 0;
  const andar = (pt: unknown, caminho: Caminho, chave: string): void => {
    const atual = ler(en, caminho);
    if (typeof pt === "string") {
      if (!traduzivel(chave, pt) || (typeof atual === "string" && atual.trim() !== "")) return;
      const s = sugestao(pt);
      if (s) {
        en = gravar(en, caminho, s);
        quantos++;
      }
    } else if (Array.isArray(pt) && pt.length > 0 && pt.every((x) => typeof x === "string")) {
      if (Array.isArray(atual) && atual.some((l) => typeof l === "string" && l.trim() !== "")) return;
      const linhas = (pt as string[]).map((l) => sugestao(l));
      // Linhas de uma frase só: ou se traduz tudo, ou nada — meia chamada em
      // inglês e meia em português lia-se pior do que tudo em português.
      if (linhas.every((l): l is string => l !== null)) {
        en = gravar(en, caminho, linhas);
        quantos++;
      }
    } else if (Array.isArray(pt)) {
      pt.forEach((x, i) => andar(x, [...caminho, i], chave));
    } else if (pt && typeof pt === "object") {
      for (const [k, x] of Object.entries(pt)) andar(x, [...caminho, k], k);
    }
  };
  for (const [secao, v] of Object.entries(dados)) {
    if (!FORA.has(secao)) andar(v, [secao], secao);
  }
  return { en: en as Record<string, unknown>, quantos };
}

/** Quantos textos já têm inglês, para o aviso antes de publicar. */
export function progressoIngles(dados: Record<string, unknown>): { feitos: number; total: number } {
  let feitos = 0;
  let total = 0;
  const andar = (pt: unknown, en: unknown, chave: string): void => {
    if (typeof pt === "string") {
      if (!traduzivel(chave, pt)) return;
      total++;
      if (typeof en === "string" && en.trim() !== "") feitos++;
    } else if (Array.isArray(pt) && pt.every((x) => typeof x === "string")) {
      if (!temTexto(pt, chave)) return;
      total++;
      if (Array.isArray(en) && en.some((l) => typeof l === "string" && l.trim() !== "")) feitos++;
    } else if (Array.isArray(pt)) {
      pt.forEach((x, i) => andar(x, ler(en, [i]), chave));
    } else if (pt && typeof pt === "object") {
      for (const [k, x] of Object.entries(pt)) andar(x, ler(en, [k]), k);
    }
  };
  for (const [secao, v] of Object.entries(dados)) {
    if (!FORA.has(secao)) andar(v, ler(dados.en, [secao]), secao);
  }
  return { feitos, total };
}

export function PainelIngles({
  dados,
  onChange,
}: {
  dados: Record<string, unknown>;
  /** Recebe o bloco `en` inteiro já atualizado. */
  onChange: (en: Record<string, unknown>) => void;
}): ReactElement {
  const en = (dados.en ?? {}) as Record<string, unknown>;
  const secoes = Object.entries(dados).filter(([k, v]) => !FORA.has(k) && temTexto(v, k));
  const { feitos, total } = progressoIngles(dados);

  return (
    <div>
      <div className="mb-6 flex items-start gap-3">
        <p className="flex-1 rounded-lg bg-cyan/10 px-3 py-2 text-[13px] leading-[1.6] text-text">
          Só os convidados da lista <b>Convidados de fora</b> (na tela de publicar) veem o convite
          em inglês. Caixa vazia sai em português. {feitos}/{total} textos traduzidos.
        </p>
        <Button
          variant="outline"
          size="sm"
          title="Traduz as frases que todos os convites têm (títulos, manual, cronograma). Não mexe no que já foi escrito."
          onClick={() => {
            const { en: novo, quantos } = preencherPadrao(dados);
            if (quantos > 0) onChange(novo);
          }}
        >
          <Wand2 size={13} /> Preencher o padrão
        </Button>
      </div>
      {secoes.map(([secao, v]) => (
        <div key={secao}>
          <Rule>{rotulo(secao)}</Rule>
          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            {typeof v === "string" ? (
              <Par
                pt={v}
                en={en[secao]}
                caminho={[secao]}
                onChange={(c, novo) => onChange(gravar(en, c, novo) as Record<string, unknown>)}
                label={rotulo(secao)}
              />
            ) : (
              <Nos
                pt={v}
                en={en[secao]}
                caminho={[secao]}
                onChange={(c, novo) => onChange(gravar(en, c, novo) as Record<string, unknown>)}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
