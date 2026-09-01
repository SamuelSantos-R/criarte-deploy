import { useState, type ReactElement } from "react";
import { QrCode, RefreshCw, Square } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { acharAparelho, Palco } from "@/components/Palco";
import { ModalQR } from "@/components/ModalQR";
import { SeletorAparelho } from "@/components/SeletorAparelho";

const CHAVE_APARELHO = "criarte:aparelho-ao-vivo";

// O convite nasce no telefone: a coluna do editor abre no aparelho, não no desktop.
const PADRAO = "13";

/** Não é maquete: é o site rodando. O que se digita à esquerda repinta aqui. */
export function PainelAoVivo({
  url,
  lan,
  largura,
  ligando,
  podeLigar,
  emprestado,
  onRecarregar,
  onLigar,
  onParar,
}: {
  url: string | null;
  lan: string | null;
  largura: number;
  ligando: boolean;
  podeLigar: boolean;
  /** O preview é do anfitrião, servido pela rede: aqui não há o que ligar nem parar. */
  emprestado?: boolean;
  onRecarregar: () => void;
  onLigar: () => void;
  onParar: () => void;
}): ReactElement {
  const [qrAberto, setQrAberto] = useState(false);
  // O telefone é limitado pela altura da janela, então alargar o painel só rende
  // quando o aparelho é mais largo que alto — daí a escolha viver aqui.
  const [aparelho, setAparelho] = useState(() =>
    acharAparelho(localStorage.getItem(CHAVE_APARELHO) ?? PADRAO),
  );

  return (
    <aside className="flex shrink-0 flex-col bg-surface" style={{ width: largura }}>
      <div className="no-drag flex h-[38px] shrink-0 items-center gap-2 border-b border-rule px-4">
        <span className="shrink-0 font-mono text-label uppercase text-muted">Ao vivo</span>
        {url && (
          <>
            <span
              aria-hidden
              className="h-[5px] w-[5px] shrink-0 animate-pulse rounded-full bg-ok"
              style={{ animationDuration: "2s" }}
            />
            <SeletorAparelho
              valor={aparelho}
              onChange={(a) => {
                setAparelho(a);
                localStorage.setItem(CHAVE_APARELHO, a.id);
              }}
              className="min-w-[88px] max-w-[176px] flex-1"
            />
          </>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {url && (
            <>
              <Button variant="ghost" onClick={onRecarregar} aria-label="Recarregar" title="Recarregar">
                <RefreshCw size={13} />
              </Button>
              <Button
                variant="ghost"
                onClick={() => setQrAberto(true)}
                aria-label="Ver no telefone"
                title="Ver no telefone"
              >
                <QrCode size={13} />
              </Button>
            </>
          )}
          {emprestado ? (
            <span className="font-mono text-label uppercase tracking-[0.16em] text-muted">
              do anfitrião
            </span>
          ) : url ? (
            <Button variant="danger" size="sm" onClick={onParar}>
              <Square size={13} /> Parar
            </Button>
          ) : (
            <Button variant="primary" size="sm" disabled={!podeLigar || ligando} onClick={onLigar}>
              {ligando ? "Subindo…" : "Ligar"}
            </Button>
          )}
        </div>
      </div>

      {qrAberto && <ModalQR lan={lan} url={url} onFechar={() => setQrAberto(false)} />}

      <Palco
        url={url}
        aparelho={aparelho}
        margem={20}
        legenda={false}
        className="relative min-h-0 flex-1 overflow-hidden bg-surface-2/40"
      >
        <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
          <p className="text-[13px] text-muted">
            {emprestado
              ? "O anfitrião ainda não ligou o preview. Quando ligar, aparece aqui sozinho."
              : ligando
                ? "Subindo o Next do site…"
                : "Ligue pra ver o convite de verdade repintando enquanto edita."}
          </p>
          {ligando && (
            <p className="font-mono text-[11px] text-muted/70">a primeira vez demora uns segundos.</p>
          )}
        </div>
      </Palco>
    </aside>
  );
}

/**
 * Faixa, não modal: dá pra olhar o preview e a tela antes de escolher. E gravar
 * por cima é um link solto de propósito — apagar o trabalho de quem mexeu no
 * arquivo não pode ficar do lado do botão de salvar.
 */
export function FaixaConflito({
  onFicarComArquivo,
  onGravarPorCima,
}: {
  onFicarComArquivo: () => void;
  onGravarPorCima: () => void;
}): ReactElement {
  return (
    <div
      role="alert"
      className="flex shrink-0 items-center gap-3 border-b border-rule bg-surface-2/50 py-2.5 pl-5 pr-7"
    >
      <span aria-hidden className="h-[30px] w-[2px] shrink-0 bg-bad" />
      <div className="min-w-0">
        <p className="font-mono text-label uppercase tracking-[0.18em] text-bad">conflito</p>
        <p className="mt-0.5 text-[12px] leading-[1.5] text-muted">
          O <span className="font-mono">convite.json</span> mudou fora do Studio e você tem alteração
          na tela. Um dos dois vai embora.
        </p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-4">
        <Button variant="primary" size="sm" onClick={onFicarComArquivo}>
          Ficar com o arquivo
        </Button>
        <button
          type="button"
          onClick={onGravarPorCima}
          className="no-drag text-[11px] leading-none text-muted underline decoration-dotted underline-offset-4 transition-colors hover:text-bad focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-sage"
        >
          descartar o arquivo
        </button>
      </div>
    </div>
  );
}
