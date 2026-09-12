import { type ReactElement, type ReactNode } from "react";
import { AlignCenter, ArrowLeftRight, Pipette } from "lucide-react";
import type { FonteMonograma } from "@/lib/api";
import type { Composicao, Letra, Moldura, Papel } from "@/lib/monograma/composicao";
import { Input } from "@/components/ui/primitives";
import { SeletorCor } from "@/components/SeletorCor";
import { FonteCursiva } from "./FonteCursiva";
import { MolduraMonograma } from "./MolduraMonograma";
import { ReguaMonograma } from "./ReguaMonograma";
import { cn } from "@/lib/utils";

type Props = {
  comp: Composicao;
  alterar: (mudanca: Partial<Composicao>, podeJuntar?: boolean) => void;
  selecionada: Papel;
  setSelecionada: (p: Papel) => void;
  nome: string;
  setNome: (n: string) => void;
  recentes: FonteMonograma[];
  fonteAtualNome: string;
  lendoFonte: boolean;
  onEscolherFonte: (chave: string) => void;
  onSoltarFonte: (caminho: string) => void;
  mostrarCruzamentos: boolean;
  setMostrarCruzamentos: (v: boolean) => void;
  molduras: FonteMonograma[];
  lendoMoldura: boolean;
  onEscolherMoldura: (m: Pick<Moldura, "tipo" | "chave" | "nome">) => void;
  onSoltarMoldura: (caminho: string) => void;
  /** Cores mais presentes na moldura arrastada. */
  paleta: string[];
  onCentralizar: () => void;
};

type ContaGotas = { open: () => Promise<{ sRGBHex: string }> };
const EyeDropper = (window as unknown as { EyeDropper?: new () => ContaGotas }).EyeDropper;

function Titulo({ children }: { children: ReactNode }): ReactElement {
  return (
    <span className="mb-2 mt-7 block font-narrow text-label font-semibold uppercase text-muted first:mt-0">
      {children}
    </span>
  );
}

const letraValida = (v: string): string => v.trim().slice(-1).toLocaleUpperCase("pt");

export function PainelMonograma(p: Props): ReactElement {
  const { comp, alterar, selecionada } = p;
  const letra = comp[selecionada];
  const mexerLetra = (mudanca: Partial<Letra>): void =>
    alterar({ [selecionada]: { ...letra, ...mudanca } } as Partial<Composicao>);

  const trocarLetras = (): void =>
    alterar(
      {
        serifada: { ...comp.serifada, char: comp.cursiva.char },
        cursiva: { ...comp.cursiva, char: comp.serifada.char },
        toques: [],
      },
      false,
    );

  return (
    <aside className="w-[292px] shrink-0 overflow-y-auto border-l border-rule px-5 py-6">
      <Titulo>Casal</Titulo>
      <Input value={p.nome} onChange={(e) => p.setNome(e.target.value)} placeholder="ex.: emanuel-oprah" aria-label="Nome do casal" />
      <p className="mt-1 text-[11px] text-muted">Vira o nome dos arquivos exportados.</p>

      <Titulo>Iniciais</Titulo>
      <div className="flex items-end gap-2">
        {(["serifada", "cursiva"] as const).map((papel) => (
          <label key={papel} className="flex-1">
            <span className="mb-1 block text-[11px] text-muted">{papel === "serifada" ? "Serifada" : "Cursiva"}</span>
            <Input
              value={comp[papel].char}
              onChange={(e) => {
                const c = letraValida(e.target.value);
                if (c) alterar({ [papel]: { ...comp[papel], char: c }, toques: [] } as Partial<Composicao>, false);
              }}
              className="text-center font-narrow text-[18px] font-semibold"
              aria-label={`Letra ${papel}`}
            />
          </label>
        ))}
        <button
          type="button"
          onClick={trocarLetras}
          title="Trocar as letras de lugar"
          aria-label="Trocar as letras de lugar"
          className="no-drag flex h-[32px] w-[32px] shrink-0 items-center justify-center border border-rule text-muted hover:text-text"
        >
          <ArrowLeftRight size={14} />
        </button>
      </div>

      <Titulo>Fonte da cursiva</Titulo>
      <FonteCursiva
        atual={comp.fonte}
        recentes={p.recentes}
        atualNome={p.fonteAtualNome}
        ocupado={p.lendoFonte}
        onEscolher={p.onEscolherFonte}
        onSoltar={p.onSoltarFonte}
      />
      <p className="mt-1 text-[11px] text-muted">A serifada é sempre Cormorant Garamond.</p>

      <Titulo>Letra selecionada</Titulo>
      <div className="mb-2 grid grid-cols-2 border border-rule">
        {(["serifada", "cursiva"] as const).map((papel) => (
          <button
            key={papel}
            type="button"
            aria-pressed={selecionada === papel}
            onClick={() => p.setSelecionada(papel)}
            className={cn(
              "no-drag py-1.5 text-[12px]",
              selecionada === papel ? "bg-surface-2 text-text" : "text-muted hover:text-text",
            )}
          >
            {papel === "serifada" ? "Serifada" : "Cursiva"} · {comp[papel].char}
          </button>
        ))}
      </div>
      <ReguaMonograma rotulo="Altura" valor={letra.altura} min={150} max={1100} passo={5} unidade="px" onChange={(altura) => mexerLetra({ altura })} />
      <ReguaMonograma rotulo="Largura" valor={letra.largura} min={0.5} max={1.6} passo={0.01} unidade="×" onChange={(largura) => mexerLetra({ largura })} />
      <ReguaMonograma rotulo="Inclinação" valor={letra.rot} min={-45} max={45} passo={0.5} unidade="°" onChange={(rot) => mexerLetra({ rot })} />
      <p className="mt-1 text-[11px] text-muted">Arraste a letra no palco pra mover.</p>

      <Titulo>Corte</Titulo>
      <ReguaMonograma rotulo="Largura do corte" valor={comp.corte} min={0} max={20} passo={0.5} unidade="px" onChange={(corte) => alterar({ corte })} />
      <label className="mt-2 flex items-center gap-2">
        <input
          type="checkbox"
          checked={p.mostrarCruzamentos}
          onChange={(e) => p.setMostrarCruzamentos(e.target.checked)}
          className="h-4 w-4 accent-cyan"
        />
        <span className="text-[12px] text-muted">Mostrar cruzamentos (clique troca quem passa por cima)</span>
      </label>
      {comp.toques.length > 0 && (
        <button type="button" onClick={() => alterar({ toques: [] }, false)} className="no-drag mt-1 text-[11px] text-muted underline hover:text-text">
          Voltar ao trançado automático
        </button>
      )}

      <Titulo>Conjunto</Titulo>
      <ReguaMonograma rotulo="Tamanho" valor={comp.escala} min={0.3} max={1.5} passo={0.01} unidade="×" onChange={(escala) => alterar({ escala })} />
      <button
        type="button"
        onClick={p.onCentralizar}
        className="no-drag mt-2 flex w-full items-center justify-center gap-2 border border-rule py-1.5 text-[12px] text-muted hover:border-rule-strong hover:text-text"
      >
        <AlignCenter size={13} /> Centralizar na prancheta
      </button>

      <Titulo>Cor das letras</Titulo>
      <div className="flex items-center gap-2">
        <SeletorCor valor={comp.cor} rotulo="monograma" onChange={(cor) => alterar({ cor })} />
        <span className="font-mono text-[12px] text-text">{comp.cor}</span>
        {EyeDropper && (
          <button
            type="button"
            onClick={() => {
              void new EyeDropper()
                .open()
                .then((r) => /^#[0-9a-f]{6}$/i.test(r.sRGBHex) && alterar({ cor: r.sRGBHex.toUpperCase() }, false))
                .catch(() => undefined);
            }}
            title="Pegar uma cor da tela (da moldura, por exemplo)"
            aria-label="Conta-gotas"
            className="no-drag ml-auto flex h-7 w-7 items-center justify-center border border-rule text-muted hover:border-rule-strong hover:text-text"
          >
            <Pipette size={13} />
          </button>
        )}
      </div>
      {p.paleta.length > 0 && (
        <div className="mt-2">
          <span className="block text-[11px] text-muted">Cores da moldura</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {p.paleta.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => alterar({ cor: c }, false)}
                title={c}
                aria-label={`Usar ${c} nas letras`}
                className={cn("no-drag h-6 w-6 border", comp.cor.toUpperCase() === c ? "border-text" : "border-rule")}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      )}

      <Titulo>Moldura</Titulo>
      <MolduraMonograma
        moldura={comp.moldura}
        recentes={p.molduras}
        ocupado={p.lendoMoldura}
        onEscolher={p.onEscolherMoldura}
        onSoltar={p.onSoltarMoldura}
      />
      {comp.moldura.tipo !== "nenhuma" && (
        <div className="mt-3">
          <ReguaMonograma rotulo="Tamanho da moldura" valor={comp.moldura.escala} min={0.5} max={1.4} passo={0.01} unidade="×" onChange={(escala) => alterar({ moldura: { ...comp.moldura, escala } })} />
          <ReguaMonograma rotulo="Giro da moldura" valor={comp.moldura.rot} min={-180} max={180} passo={1} unidade="°" onChange={(rot) => alterar({ moldura: { ...comp.moldura, rot } })} />
        </div>
      )}
    </aside>
  );
}
