import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Copy, FolderOpen, Redo2, RefreshCw, RotateCcw, Save, Square, Undo2 } from "lucide-react";
import { previewScroll, readConvite, reveal, writeConvite, type Site } from "@/lib/api";
import {
  alternarSecao,
  ancoraDe,
  CHAVE_SECOES,
  estaLigada,
  iconeDe,
  podeDesligar,
  rotulo,
} from "@/lib/secoes";
import { derrubarServidor, subirServidor, usarServidor } from "@/lib/servidor";
import { useHistorico } from "@/lib/useHistorico";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/primitives";
import { JsonForm } from "@/components/JsonForm";
import { ProvedorSite } from "@/components/CampoArquivo";
import { acharAparelho, Palco } from "@/components/Palco";
import { SalvarComoNovo } from "@/components/SalvarComoNovo";
import { SeletorSite } from "@/components/SeletorSite";
import { Topo } from "@/components/Topo";

// O convite nasce no telefone: a coluna do editor mostra o aparelho, não o desktop.
const APARELHO = acharAparelho("13");

// Tempo entre a última tecla e o disco. Curto o bastante pra parecer ao vivo,
// longo o bastante pra não gravar letra por letra enquanto se digita um nome.
const REPOUSO = 400;

function Regua({
  chaves,
  atual,
  desligadas,
  onEscolher,
}: {
  chaves: string[];
  atual: string | null;
  desligadas: Set<string>;
  onEscolher: (chave: string) => void;
}): ReactElement {
  return (
    <nav aria-label="Seções do convite" className="w-[136px] shrink-0 overflow-y-auto border-r border-rule py-2">
      {chaves.map((chave, i) => {
        const Icone = iconeDe(chave);
        const ativo = chave === atual;
        const fora = desligadas.has(chave);
        return (
          <button
            key={chave}
            onClick={() => onEscolher(chave)}
            aria-current={ativo ? "true" : undefined}
            title={fora ? `${rotulo(chave)} — fora da página` : undefined}
            className={cn(
              "no-drag relative flex w-full items-center gap-2 px-3 py-[7px] text-left text-[12px] transition-colors",
              ativo ? "bg-surface-2 text-text" : "text-muted hover:text-text",
            )}
          >
            <span className={cn("absolute left-0 top-0 h-full w-[2px]", ativo ? "bg-sage" : "bg-transparent")} />
            <span className="w-[15px] shrink-0 font-mono text-serial text-muted/70">
              {String(i + 1).padStart(2, "0")}
            </span>
            <Icone size={14} strokeWidth={1.6} aria-hidden />
            {/* Risca, não só cinza: quem enxerga mal a cor ainda vê que saiu da página. */}
            <span className={cn("truncate", fora && "line-through decoration-1")}>{rotulo(chave)}</span>
          </button>
        );
      })}
    </nav>
  );
}

/**
 * Trilho reto, não pílula: a chave herda a mesma linguagem do par desfazer/refazer
 * do topo. O rótulo diz o estado por escrito — cor sozinha não conta.
 */
function ChaveSecao({
  ligada,
  nome,
  onAlternar,
}: {
  ligada: boolean;
  nome: string;
  onAlternar: (proxima: boolean) => void;
}): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligada}
      onClick={() => onAlternar(!ligada)}
      title={ligada ? `Tirar ${nome} da página` : `Devolver ${nome} à página`}
      className={cn(
        "no-drag flex h-[28px] shrink-0 items-center gap-2 px-1 transition-colors",
        "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-sage",
        ligada ? "text-text hover:text-accent" : "text-muted hover:text-text",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex h-[15px] w-[28px] items-center border px-[2px]",
          ligada ? "justify-end border-accent/70" : "justify-start border-rule-strong",
        )}
      >
        <span className={cn("h-[9px] w-[9px]", ligada ? "bg-accent" : "bg-muted")} />
      </span>
      <span className="font-mono text-label uppercase tracking-[0.14em]">
        {ligada ? "na página" : "fora"}
      </span>
    </button>
  );
}

function BotaoTrilha({
  rotuloAcao,
  atalho,
  Icone,
  disabled,
  onClick,
}: {
  rotuloAcao: string;
  atalho: string;
  Icone: typeof Undo2;
  disabled: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={`${rotuloAcao} (${atalho})`}
      aria-label={`${rotuloAcao} — ${atalho}`}
      aria-keyshortcuts={atalho === "⌘Z" ? "Meta+Z" : "Shift+Meta+Z"}
      className={cn(
        "flex h-[28px] w-[32px] items-center justify-center transition-colors",
        "text-muted hover:bg-surface-2 hover:text-text",
        "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-sage",
        "disabled:pointer-events-none disabled:text-muted/30",
      )}
    >
      <Icone size={13} strokeWidth={1.8} aria-hidden />
    </button>
  );
}

export function Convites({ sites, recarregar }: { sites: Site[]; recarregar: () => void }): ReactElement {
  const comConvite = useMemo(() => sites.filter((s) => s.temConvite), [sites]);
  const [id, setId] = useState<string | null>(null);
  const [original, setOriginal] = useState<string>("");
  const [secao, setSecao] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [duplicando, setDuplicando] = useState(false);
  const rodando = usarServidor();
  // O dev server é um só no app inteiro: se a tela de Preview levou pra outro
  // site, este painel volta a oferecer "Ligar" em vez de mostrar convite alheio.
  const servidor = rodando?.siteId === id ? rodando : null;
  const [ligando, setLigando] = useState(false);
  const [recarga, setRecarga] = useState(0);
  // Enquanto o site está ao vivo o disco carrega o rascunho, não o salvo.
  // Sem esta marca não dá pra saber se ainda tem sujeira pra desfazer no arquivo.
  const rascunho = useRef(false);
  const {
    valor: dados,
    definir: setDados,
    recomecar,
    desfazer,
    refazer,
    podeDesfazer,
    podeRefazer,
  } = useHistorico<Record<string, unknown>>();

  // A lista chega depois do primeiro render — abre o convite mais recente.
  useEffect(() => {
    if (id === null && comConvite[0]) setId(comConvite[0].id);
  }, [id, comConvite]);

  useEffect(() => {
    if (!id) return;
    let vivo = true;
    recomecar(null);
    setSecao(null);
    setErro(null);
    readConvite(id)
      .then((d) => {
        if (!vivo) return;
        recomecar(d);
        setOriginal(JSON.stringify(d));
        setSecao(Object.keys(d).find((k) => k !== CHAVE_SECOES) ?? null);
      })
      .catch((e: Error) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [id, recomecar]);

  // `secoes` é o mapa do que está fora da página, não uma seção editável.
  const chaves = dados ? Object.keys(dados).filter((k) => k !== CHAVE_SECOES) : [];
  const desligadas = new Set(chaves.filter((k) => dados !== null && !estaLigada(dados, k)));
  const sujo = dados !== null && JSON.stringify(dados) !== original;

  // Devolve ao arquivo o último estado salvo. Chamado sempre que o rascunho
  // deixa de estar em cena: descartar, trocar de site, desligar, sair da tela.
  const desfazerNoDisco = useCallback(async (): Promise<void> => {
    if (!rascunho.current || !id || !original) return;
    rascunho.current = false;
    await writeConvite(id, JSON.parse(original) as unknown).catch(() => {});
  }, [id, original]);

  const salvar = async (): Promise<void> => {
    if (!id || !dados || salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      await writeConvite(id, dados);
      rascunho.current = false;
      setOriginal(JSON.stringify(dados));
      recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  const descartar = (): void => {
    if (!original) return;
    recomecar(JSON.parse(original) as Record<string, unknown>);
    void desfazerNoDisco();
  };

  const ligarAoVivo = async (): Promise<void> => {
    if (!id || ligando) return;
    setLigando(true);
    setErro(null);
    try {
      await subirServidor(id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLigando(false);
    }
  };

  const desligarAoVivo = async (): Promise<void> => {
    await desfazerNoDisco();
    await derrubarServidor();
  };

  // O `next dev` sonda o disco (WATCHPACK_POLLING), então gravar o rascunho é o
  // bastante: o HMR repinta a página aberta sozinho, sem reload.
  useEffect(() => {
    if (!servidor || !id || !dados) return;
    // Voltar ao valor salvo — desfazendo ou desligando e religando uma seção —
    // deixava o disco preso no último rascunho, e o preview mentia.
    if (!sujo) {
      if (!rascunho.current) return;
      rascunho.current = false;
      void writeConvite(id, dados).catch((e: Error) => setErro(e.message));
      return;
    }
    const t = setTimeout(() => {
      rascunho.current = true;
      void writeConvite(id, dados).catch((e: Error) => setErro(e.message));
    }, REPOUSO);
    return () => clearTimeout(t);
  }, [servidor, id, dados, sujo]);

  // Trocar de seção leva o preview até o bloco correspondente, pra não ter que
  // procurar rolando. Quem rola é o processo main: o Chrome ignora âncora
  // empurrada de fora num iframe cross-origin.
  useEffect(() => {
    if (!servidor || !secao) return;
    const ancora = ancoraDe(secao);
    if (!ancora) return;
    const t = setTimeout(() => void previewScroll(ancora).catch(() => {}), 120);
    return () => clearTimeout(t);
  }, [servidor, secao]);

  // Sair da tela com rascunho em disco deixaria o arquivo mentindo. O ref existe
  // porque a limpeza roda uma vez só, com o que era verdade no último render.
  const ultimo = useRef({ id, original });
  ultimo.current = { id, original };
  useEffect(() => {
    return () => {
      const { id: alvo, original: salvo } = ultimo.current;
      if (rascunho.current && alvo && salvo) void writeConvite(alvo, JSON.parse(salvo) as unknown);
    };
  }, []);

  // O histórico é do convite inteiro, não de um campo: Cmd+Z aqui tem que
  // desfazer a última mudança tenha ela saído de qual caixa for. Por isso o
  // atalho é interceptado antes do desfazer nativo do <input>.
  useEffect(() => {
    const atalho = (e: KeyboardEvent): void => {
      if (!e.metaKey && !e.ctrlKey) return;
      const tecla = e.key.toLowerCase();
      if (tecla === "s") {
        e.preventDefault();
        void salvar();
      } else if (tecla === "z") {
        e.preventDefault();
        if (e.shiftKey) refazer();
        else desfazer();
      }
    };
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
  });

  /**
   * "Salvar como" de editor de texto: o que está na tela vai pro convite novo e
   * o antigo volta ao que estava salvo. Sem isso a edição ficaria nos dois, que
   * é justamente o que suja a base de onde sai o deploy.
   */
  const aoDuplicar = async (copia: { id: string }): Promise<void> => {
    setDuplicando(false);
    try {
      if (dados) await writeConvite(copia.id, dados);
      await desfazerNoDisco();
      await derrubarServidor();
      setId(copia.id);
      recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <ProvedorSite value={id}>
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <Topo>
        <SeletorSite
          sites={sites}
          valor={id}
          onChange={(novo) => {
            void desligarAoVivo();
            setId(novo);
          }}
          somenteConvite
          className="w-[220px]"
        />
        {/* Par segmentado, encostado e com régua no meio: desfazer e refazer são
            a mesma ação em dois sentidos, não dois botões que por acaso vizinham. */}
        <div className="no-drag flex shrink-0 items-center border border-rule">
          <BotaoTrilha
            rotuloAcao="Desfazer"
            atalho="⌘Z"
            Icone={Undo2}
            disabled={!podeDesfazer}
            onClick={desfazer}
          />
          <span aria-hidden className="h-[18px] w-px bg-rule" />
          <BotaoTrilha
            rotuloAcao="Refazer"
            atalho="⇧⌘Z"
            Icone={Redo2}
            disabled={!podeRefazer}
            onClick={refazer}
          />
        </div>

        {sujo && (
          <span className="font-mono text-serial uppercase tracking-[0.18em] text-accent">alterado</span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {sujo && (
            <Button variant="ghost" onClick={descartar}>
              <RotateCcw size={13} /> Descartar
            </Button>
          )}
          {id && (
            <Button variant="ghost" onClick={() => setDuplicando(true)}>
              <Copy size={13} /> Salvar como novo
            </Button>
          )}
          {id && (
            <Button variant="ghost" onClick={() => void reveal(id)}>
              <FolderOpen size={13} /> Abrir pasta
            </Button>
          )}
          <Button variant="primary" size="sm" disabled={!sujo || salvando} onClick={() => void salvar()}>
            <Save size={13} /> {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </Topo>

      <div className="flex min-h-0 min-w-0 flex-1">
        {dados && secao && (
          <Regua chaves={chaves} atual={secao} desligadas={desligadas} onEscolher={setSecao} />
        )}

        <section className="min-w-0 flex-1 overflow-auto px-7 pb-16 pt-6">
          {erro && <p className="border-l-2 border-bad pl-3 text-[13px] text-bad">{erro}</p>}
          {!id && <p className="text-[13px] text-muted">Escolha um site com convite.json.</p>}
          {id && !dados && !erro && <p className="font-mono text-[12px] text-muted">Lendo convite.json…</p>}
          {dados && secao && (
            <>
              <div className="mb-5 flex items-center gap-3 border-b border-rule pb-2">
                <h2 className="font-mono text-label uppercase tracking-[0.18em] text-text">
                  {rotulo(secao)}
                </h2>
                {podeDesligar(secao) && (
                  <ChaveSecao
                    ligada={estaLigada(dados, secao)}
                    nome={rotulo(secao)}
                    onAlternar={(proxima) => setDados(alternarSecao(dados, secao, proxima))}
                  />
                )}
              </div>
              <JsonForm dados={dados} secao={secao} onChange={setDados} />
            </>
          )}
        </section>

        {/* Não é maquete: é o site rodando. O que se digita à esquerda repinta aqui. */}
        <aside className="flex w-[460px] shrink-0 flex-col border-l border-rule bg-surface">
          <div className="no-drag flex h-[38px] shrink-0 items-center gap-2 border-b border-rule px-4">
            <span className="font-mono text-label uppercase text-muted">Ao vivo</span>
            {servidor && (
              <span
                aria-hidden
                className="h-[5px] w-[5px] shrink-0 animate-pulse rounded-full bg-ok"
                style={{ animationDuration: "2s" }}
              />
            )}
            <div className="ml-auto flex items-center gap-2">
              {servidor && (
                <Button
                  variant="ghost"
                  onClick={() => setRecarga((n) => n + 1)}
                  aria-label="Recarregar"
                  title="Recarregar"
                >
                  <RefreshCw size={13} />
                </Button>
              )}
              {servidor ? (
                <Button variant="danger" size="sm" onClick={() => void desligarAoVivo()}>
                  <Square size={13} /> Parar
                </Button>
              ) : (
                <Button variant="primary" size="sm" disabled={!id || ligando} onClick={() => void ligarAoVivo()}>
                  {ligando ? "Subindo…" : "Ligar"}
                </Button>
              )}
            </div>
          </div>

          <Palco
            url={servidor?.url ?? null}
            aparelho={APARELHO}
            margem={20}
            legenda={false}
            recarga={recarga}
            className="relative min-h-0 flex-1 overflow-hidden bg-surface-2/40"
          >
            <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
              <p className="text-[13px] text-muted">
                {ligando ? "Subindo o Next do site…" : "Ligue pra ver o convite de verdade repintando enquanto edita."}
              </p>
              {ligando && (
                <p className="font-mono text-[11px] text-muted/70">a primeira vez demora uns segundos.</p>
              )}
            </div>
          </Palco>
        </aside>
      </div>

      {duplicando && id && (
        <SalvarComoNovo
          origemId={id}
          categoriaPadrao={id.split("/")[0] ?? "casamento"}
          onFechar={() => setDuplicando(false)}
          onPronto={(copia) => void aoDuplicar(copia)}
        />
      )}
    </div>
    </ProvedorSite>
  );
}
