import { type ReactElement } from "react";
import { ChevronDown, FileText, X } from "lucide-react";
import { pickGuests } from "@/lib/api";
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
};

export const OPCOES_PADRAO: Opcoes = {
  validade: "3",
  data: "",
  subdominio: "",
  convidados: null,
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
  const nomeDaLista = valor.convidados?.split("/").pop() ?? null;

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

      <div className="flex flex-col gap-1.5">
        <Rotulo>Convidados</Rotulo>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={travado}
            onClick={() => {
              void pickGuests().then((caminho) => caminho && set({ convidados: caminho }));
            }}
          >
            <FileText size={13} /> {nomeDaLista ?? "Escolher .txt…"}
          </Button>
          {nomeDaLista && (
            <button
              type="button"
              disabled={travado}
              onClick={() => set({ convidados: null })}
              aria-label="Tirar a lista de convidados"
              title="Sem lista o convite sobe em prévia, sem token por convidado"
              className="no-drag flex h-[26px] w-[26px] items-center justify-center text-muted transition-colors hover:text-text focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-40"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
