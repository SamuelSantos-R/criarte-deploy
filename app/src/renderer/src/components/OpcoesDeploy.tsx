import { type ReactElement } from "react";
import { ChevronDown, Clapperboard, FileText, Plus, X } from "lucide-react";
import { pickGuests, pickVideo, type Lingua, type ListaLingua } from "@/lib/api";
import { Button, Input } from "@/components/ui/primitives";

/** O que o CLI aceita em `--expires`: "0" é permanente, o resto é em meses. */
const VALIDADES: { valor: string; rotulo: string }[] = [
  { valor: "1", rotulo: "1 mês" },
  { valor: "3", rotulo: "3 meses" },
  { valor: "6", rotulo: "6 meses" },
  { valor: "12", rotulo: "1 ano" },
  { valor: "0", rotulo: "permanente" },
  { valor: "data", rotulo: "data…" },
];

export type Opcoes = {
  /** Um dos valores acima, ou "data" enquanto o campo de data está aberto. */
  validade: string;
  data: string;
  subdominio: string;
  convidados: string | null;
  /** Listas noutras línguas: cada nome recebe o convite nessa língua. */
  listas: LinhaLingua[];
};

/** Uma linha da tela: o .txt e o vídeo ainda podem estar por escolher. */
export type LinhaLingua = { lang: Lingua; arquivo: string | null; video: string | null };

export const LINGUAS: { valor: Lingua; rotulo: string }[] = [
  { valor: "en", rotulo: "Inglês" },
  { valor: "fr", rotulo: "Francês" },
  { valor: "pt", rotulo: "Português" },
];

/** Só as linhas com .txt escolhido viajam; o vídeo só nas línguas que o têm. */
export function listasDe(o: Opcoes): ListaLingua[] {
  return o.listas
    .filter((l): l is LinhaLingua & { arquivo: string } => l.arquivo !== null)
    .map((l) => ({ lang: l.lang, arquivo: l.arquivo, ...(l.video && l.lang !== "pt" ? { video: l.video } : {}) }));
}

export const OPCOES_PADRAO: Opcoes = {
  validade: "3",
  data: "",
  subdominio: "",
  convidados: null,
  listas: [],
};

/**
 * O que o CLI vai receber, ou null quando a escolha ainda está pela metade —
 * uma data por acabar não pode virar deploy com a validade errada.
 */
export function expiresDe(o: Opcoes): string | null {
  if (o.validade !== "data") return o.validade;
  return /^\d{2}\/\d{2}\/\d{4}$/.test(o.data.trim()) ? o.data.trim() : null;
}

/** Como a escolha se lê em português, para o resumo antes de publicar. */
export function validadeEmPalavras(o: Opcoes): string {
  if (o.validade === "data") return o.data.trim() || "data por preencher";
  return VALIDADES.find((v) => v.valor === o.validade)?.rotulo ?? o.validade;
}

const Rotulo = ({ children }: { children: string }): ReactElement => (
  <span className="font-narrow font-semibold text-label text-muted">{children}</span>
);

/**
 * As perguntas que o terminal fazia durante o deploy. No Studio elas não podem
 * ser prompt — o log corre sozinho — então passam a ser campos, respondidos
 * antes de arrancar. Sem isto o `--yes` respondia tudo pelo padrão.
 */
export function OpcoesDeploy({
  valor,
  onChange,
  travado,
}: {
  valor: Opcoes;
  onChange: (novo: Opcoes) => void;
  travado: boolean;
}): ReactElement {
  const set = (parcial: Partial<Opcoes>): void => onChange({ ...valor, ...parcial });

  return (
    <div className="flex flex-wrap items-end gap-x-7 gap-y-3 border-b border-rule px-8 py-4">
      <label className="flex flex-col gap-1.5">
        <Rotulo>Validade</Rotulo>
        <div className="relative w-[130px]">
          <select
            value={valor.validade}
            disabled={travado}
            onChange={(e) => set({ validade: e.target.value })}
            className="no-drag h-[30px] w-full appearance-none border border-rule bg-surface pl-2.5 pr-8 text-[12px] text-text focus:border-focus focus:outline-hidden disabled:opacity-40 rounded-lg"
          >
            {VALIDADES.map((v) => (
              <option key={v.valor} value={v.valor}>
                {v.rotulo}
              </option>
            ))}
          </select>
          <ChevronDown
            size={13}
            aria-hidden
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"
          />
        </div>
      </label>

      {valor.validade === "data" && (
        <label className="flex flex-col gap-1.5">
          <Rotulo>Dia</Rotulo>
          <Input
            value={valor.data}
            disabled={travado}
            placeholder="31/12/2027"
            inputMode="numeric"
            aria-invalid={valor.data.trim() !== "" && expiresDe(valor) === null}
            onChange={(e) => set({ data: e.target.value })}
            className="h-[30px] w-[120px] font-mono text-[12px]"
          />
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <Rotulo>Subdomínio</Rotulo>
        <Input
          value={valor.subdominio}
          disabled={travado}
          placeholder="opcional"
          onChange={(e) => set({ subdominio: e.target.value })}
          className="h-[30px] w-[150px] font-mono text-[12px]"
        />
      </label>

      <EscolherLista
        rotulo="Convidados"
        caminho={valor.convidados}
        travado={travado}
        onChange={(convidados) => set({ convidados })}
        tirar="Tirar a lista de convidados"
        dica="Sem lista o convite sobe em prévia, sem token por convidado"
      />
      <ListasDeFora listas={valor.listas} travado={travado} onChange={(listas) => set({ listas })} />
    </div>
  );
}

/** Um .txt com um nome por linha, escolhido no Finder. */
function EscolherLista({
  rotulo,
  caminho,
  travado,
  onChange,
  tirar,
  dica,
}: {
  rotulo: string;
  caminho: string | null;
  travado: boolean;
  onChange: (caminho: string | null) => void;
  tirar: string;
  dica: string;
}): ReactElement {
  const nome = caminho?.split("/").pop() ?? null;
  return (
    <div className="flex flex-col gap-1.5" title={dica}>
      <Rotulo>{rotulo}</Rotulo>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          disabled={travado}
          onClick={() => {
            void pickGuests().then((c) => c && onChange(c));
          }}
        >
          <FileText size={13} /> {nome ?? "Escolher .txt…"}
        </Button>
        {nome && (
          <button
            type="button"
            disabled={travado}
            onClick={() => onChange(null)}
            aria-label={tirar}
            title={dica}
            className="no-drag flex h-[26px] w-[26px] items-center justify-center text-muted transition-colors hover:text-text focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-40"
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

const nomeDe = (caminho: string | null): string | null => caminho?.split("/").pop() ?? null;

/**
 * Convidados noutra língua. Cada linha é uma lista: a língua, o .txt e — em
 * inglês e francês — o vídeo do envelope nessa língua, que é a única coisa do
 * convite que não se traduz por texto. Português aqui serve para devolver à
 * língua da casa quem antes estava numa lista de fora; o link não muda.
 */
function ListasDeFora({
  listas,
  travado,
  onChange,
}: {
  listas: LinhaLingua[];
  travado: boolean;
  onChange: (listas: LinhaLingua[]) => void;
}): ReactElement {
  const usadas = new Set(listas.map((l) => l.lang));
  const livre = LINGUAS.find((l) => !usadas.has(l.valor));
  const mudar = (i: number, parcial: Partial<LinhaLingua>): void =>
    onChange(listas.map((l, k) => (k === i ? { ...l, ...parcial } : l)));

  return (
    <div className="flex w-full flex-col gap-1.5">
      <Rotulo>Convidados de fora</Rotulo>
      {listas.map((linha, i) => (
        <div key={linha.lang} className="flex flex-wrap items-center gap-2">
          <div className="relative w-[118px]">
            <select
              value={linha.lang}
              disabled={travado}
              aria-label="Língua desta lista"
              onChange={(e) => {
                const lang = e.target.value as Lingua;
                mudar(i, { lang, ...(lang === "pt" ? { video: null } : {}) });
              }}
              className="no-drag h-[30px] w-full appearance-none rounded-lg border border-rule bg-surface pl-2.5 pr-8 text-[12px] text-text focus:border-focus focus:outline-hidden disabled:opacity-40"
            >
              {LINGUAS.filter((l) => l.valor === linha.lang || !usadas.has(l.valor)).map((l) => (
                <option key={l.valor} value={l.valor}>
                  {l.rotulo}
                </option>
              ))}
            </select>
            <ChevronDown size={13} aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
          </div>
          <Button
            variant="outline"
            disabled={travado}
            onClick={() => void pickGuests().then((c) => c && mudar(i, { arquivo: c }))}
          >
            <FileText size={13} /> {nomeDe(linha.arquivo) ?? "Escolher .txt…"}
          </Button>
          {linha.lang !== "pt" && (
            <Button
              variant="outline"
              disabled={travado}
              title="O vídeo do envelope com o texto nesta língua. Sem ele, estes convidados veem o envelope em português."
              onClick={() => void pickVideo().then((c) => c && mudar(i, { video: c }))}
            >
              <Clapperboard size={13} /> {nomeDe(linha.video) ?? "Vídeo do envelope…"}
            </Button>
          )}
          <button
            type="button"
            disabled={travado}
            onClick={() => onChange(listas.filter((_, k) => k !== i))}
            aria-label="Tirar esta lista"
            className="no-drag flex h-[26px] w-[26px] items-center justify-center text-muted transition-colors hover:text-text disabled:opacity-40"
          >
            <X size={13} />
          </button>
        </div>
      ))}
      {livre && (
        <div>
          <Button
            variant="ghost"
            disabled={travado}
            onClick={() => onChange([...listas, { lang: livre.valor, arquivo: null, video: null }])}
          >
            <Plus size={13} /> {listas.length === 0 ? "Lista noutra língua" : "Outra língua"}
          </Button>
        </div>
      )}
    </div>
  );
}
