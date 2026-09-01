import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Copy, FolderOpen, Lock, Redo2, RotateCcw, Save, Undo2, Users } from "lucide-react";
import {
  onConviteMudou,
  previewScroll,
  readConvite,
  reveal,
  vigiarConvite,
  writeConvite,
  type Site,
} from "@/lib/api";
import {
  alternarSecao,
  ancoraDe,
  ausentes,
  CHAVE_SECOES,
  estaLigada,
  podeDesligar,
  rotulo,
  semearSecao,
} from "@/lib/secoes";
import { derrubarServidor, subirServidor, usarServidor } from "@/lib/servidor";
import { useHistorico } from "@/lib/useHistorico";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/primitives";
import { JsonForm, setIn, type Caminho } from "@/components/JsonForm";
import { PainelCoop } from "@/components/PainelCoop";
import { useCoop } from "@/lib/useCoop";
import { ProvedorSite } from "@/components/CampoArquivo";
import { Divisor, useLarguraPainel } from "@/components/Divisor";
import { SalvarComoNovo } from "@/components/SalvarComoNovo";
import { SeletorSite } from "@/components/SeletorSite";
import { FaixaConflito, PainelAoVivo } from "@/components/PainelAoVivo";
import { BotaoTrilha, ChaveSecao, Regua } from "@/components/ReguaSecoes";
import { Topo } from "@/components/Topo";

// Tempo entre a última tecla e o disco. Curto o bastante pra parecer ao vivo,
// longo o bastante pra não gravar letra por letra enquanto se digita um nome.
const REPOUSO = 400;


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
  const [largura, setLargura] = useLarguraPainel();
  // Enquanto o site está ao vivo o disco carrega o rascunho, não o salvo.
  // Sem esta marca não dá pra saber se ainda tem sujeira pra desfazer no arquivo.
  const rascunho = useRef(false);
  // mtime do convite.json na última vez que este painel o leu ou gravou. Vai
  // junto em toda gravação: é o que impede o Studio de apagar edição feita fora.
  const marca = useRef<number | null>(null);
  const [conflito, setConflito] = useState(false);
  const {
    valor: dados,
    definir: setDados,
    recomecar,
    desfazer,
    refazer,
    podeDesfazer,
    podeRefazer,
  } = useHistorico<Record<string, unknown>>();

  const [mostrarCoop, setMostrarCoop] = useState(false);
  // Patch que chegou da rede entra pelo mesmo caminho de uma edição local, mas
  // sem voltar pra rede — senão os dois Studios ficavam a devolver-se o mesmo.
  // O hook guarda estes ganchos num ref e refaz a cada render, então `dados`
  // aqui dentro é sempre o de agora — não o do render em que a sessão abriu.
  const coop = useCoop({
    aoPatch: ({ caminho, valor }) => {
      if (dados) setDados(setIn(dados, caminho, valor) as Record<string, unknown>);
    },
    aoDocumento: (doc) => {
      recomecar(doc);
      // A secção só era escolhida ao ler convite do disco. Quem entra sem convite
      // próprio recebia o documento do anfitrião e continuava com o formulário
      // em branco — tinha de "Salvar aqui" primeiro só pra ter o que abrir.
      const secoes = Object.keys(doc).filter((k) => k !== CHAVE_SECOES);
      setSecao((atual) => (atual && secoes.includes(atual) ? atual : (secoes[0] ?? null)));
    },
  });
  const bloqueio = coop.donoDe(secao);
  // O documento em cena é o do anfitrião, mas o `id` daqui é o site local. Deixar
  // gravar escreveria o convite do outro por cima de um ficheiro que não é dele.
  const convidado = coop.estado.papel === "convidado";
  // Com sessão aberta quem grava é o anfitrião, a cada patch. O mtime que este
  // painel guarda envelhece a cada gravação dessas, então um ⌘S daqui bateria na
  // guarda e acusaria conflito com o próprio trabalho.
  const emSessao = coop.ligado;
  const destino = useMemo(() => ({ siteId: id, convidado }), [id, convidado]);

  // A lista chega depois do primeiro render — abre o convite mais recente.
  useEffect(() => {
    if (id === null && comConvite[0]) setId(comConvite[0].id);
  }, [id, comConvite]);

  // Entrar numa secção pede a tranca; sair devolve. Sem isto duas pessoas
  // digitavam no mesmo campo e a última tecla ganhava.
  //
  // A renovação existe porque a tranca do anfitrião caduca aos 30s e só a
  // digitação a estica: quem fica a ler a secção por um minuto perdia-a sem sair
  // dela, e o outro entrava por cima.
  useEffect(() => {
    if (!coop.ligado || !secao) return;
    coop.tomar(secao);
    const renovar = setInterval(() => coop.tomar(secao), 12_000);
    return () => {
      clearInterval(renovar);
      coop.soltar(secao);
    };
  }, [coop.ligado, secao, coop.tomar, coop.soltar]);

  // No convidado o que está em cena é o convite do anfitrião. Ler o ficheiro
  // local por cima trocaria o documento sem trocar a sessão, e os patches
  // seguintes iriam descrever um convite que o anfitrião não tem.
  useEffect(() => {
    if (!id || convidado) return;
    let vivo = true;
    recomecar(null);
    setSecao(null);
    setErro(null);
    setConflito(false);
    readConvite(id)
      .then(({ dados: d, marca: m }) => {
        if (!vivo) return;
        marca.current = m;
        recomecar(d);
        setOriginal(JSON.stringify(d));
        setSecao(Object.keys(d).find((k) => k !== CHAVE_SECOES) ?? null);
      })
      .catch((e: Error) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [id, convidado, recomecar]);

  // O main avisa quando o arquivo muda por fora. Sem o vigia, o guarda do mtime
  // ainda segura a gravação — mas só na hora de gravar, e aí já vira pergunta.
  useEffect(() => {
    void vigiarConvite(id).catch(() => {});
    return () => {
      void vigiarConvite(null).catch(() => {});
    };
  }, [id]);

  // `secoes` é o mapa do que está fora da página, não uma seção editável.
  const chaves = dados ? Object.keys(dados).filter((k) => k !== CHAVE_SECOES) : [];
  const desligadas = new Set(chaves.filter((k) => dados !== null && !estaLigada(dados, k)));
  const faltando = dados ? ausentes(dados) : [];
  const sujo = dados !== null && JSON.stringify(dados) !== original;

  /** Fora da sessão é um no-op — o editor não muda de forma por causa do co-op. */
  const publicar = useCallback(
    (caminho: Caminho, valor: unknown): void => {
      if (coop.ligado) void coop.publicar({ caminho, valor });
    },
    [coop.ligado, coop.publicar],
  );

  const semear = (chave: string): void => {
    if (!dados) return;
    const proximo = semearSecao(dados, chave);
    setDados(proximo);
    publicar([chave], proximo[chave]);
    setSecao(chave);
  };

  /**
   * Toda gravação passa por aqui levando o mtime que este painel leu. Disco
   * mexido por fora derruba a gravação em vez de apagar o que o outro escreveu.
   */
  const gravar = useCallback(async (alvo: string, corpo: unknown): Promise<boolean> => {
    const r = await writeConvite(alvo, corpo, marca.current ?? undefined);
    if (r.conflito) {
      setConflito(true);
      return false;
    }
    marca.current = r.marca;
    return true;
  }, []);

  // Devolve ao arquivo o último estado salvo. Chamado sempre que o rascunho
  // deixa de estar em cena: descartar, trocar de site, desligar, sair da tela.
  const desfazerNoDisco = useCallback(async (): Promise<void> => {
    if (!rascunho.current || !id || !original) return;
    rascunho.current = false;
    await gravar(id, JSON.parse(original) as unknown).catch(() => false);
  }, [id, original, gravar]);

  const salvar = async (): Promise<void> => {
    if (!id || !dados || salvando || emSessao) return;
    setSalvando(true);
    setErro(null);
    try {
      if (!(await gravar(id, dados))) return;
      rascunho.current = false;
      setOriginal(JSON.stringify(dados));
      recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  /** Larga o que está na tela e volta ao que o arquivo diz agora. */
  const ficarComArquivo = useCallback(async (): Promise<void> => {
    if (!id) return;
    rascunho.current = false;
    try {
      const { dados: d, marca: m } = await readConvite(id);
      marca.current = m;
      recomecar(d);
      setOriginal(JSON.stringify(d));
      setConflito(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }, [id, recomecar]);

  /** Sem `marca`: grava por cima de propósito, apagando o que mudou no arquivo. */
  const gravarPorCima = async (): Promise<void> => {
    if (!id || !dados) return;
    try {
      const r = await writeConvite(id, dados);
      marca.current = r.marca;
      rascunho.current = false;
      setOriginal(JSON.stringify(dados));
      setConflito(false);
      recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
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
    // Com conflito em cena o disco não é mais nosso: insistir só faria a
    // gravação bater na trava a cada tecla.
    if (!servidor || !id || !dados || conflito || emSessao) return;
    // Voltar ao valor salvo — desfazendo ou desligando e religando uma seção —
    // deixava o disco preso no último rascunho, e o preview mentia.
    if (!sujo) {
      if (!rascunho.current) return;
      rascunho.current = false;
      void gravar(id, dados).catch((e: Error) => setErro(e.message));
      return;
    }
    const t = setTimeout(() => {
      rascunho.current = true;
      void gravar(id, dados).catch((e: Error) => setErro(e.message));
    }, REPOUSO);
    return () => clearTimeout(t);
  }, [servidor, id, dados, sujo, conflito, emSessao, gravar]);

  /**
   * Arquivo mexido por fora. Sem nada pendente na tela o disco simplesmente
   * ganha — recarrega calado, que é o caso comum de editar o json à mão. Com
   * edição pendente vira pergunta, porque aí um dos dois lados morre.
   */
  useEffect(() => {
    if (!id) return;
    return onConviteMudou(({ id: alvo }) => {
      if (alvo !== id) return;
      if (sujo || rascunho.current) {
        setConflito(true);
        return;
      }
      void ficarComArquivo();
    });
  }, [id, sujo, ficarComArquivo]);

  // Fim de sessão: o disco levou todos os patches e o `marca` daqui ficou velho.
  // Reler é o que devolve a tela e o mtime ao mesmo ponto — e no convidado é o
  // que troca o convite do anfitrião pelo ficheiro local dele.
  const estavaEmSessao = useRef(false);
  useEffect(() => {
    if (estavaEmSessao.current && !emSessao) void ficarComArquivo();
    estavaEmSessao.current = emSessao;
  }, [emSessao, ficarComArquivo]);

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
      if (rascunho.current && alvo && salvo) {
        void writeConvite(alvo, JSON.parse(salvo) as unknown, marca.current ?? undefined);
      }
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
      // O convidado não tinha convite aberto do próprio disco pra devolver ao
      // estado salvo, e o convite.json dele já foi escrito com o doc da sessão.
      if (!convidado) {
        if (dados) await writeConvite(copia.id, dados);
        await desfazerNoDisco();
        await derrubarServidor();
        setId(copia.id);
      }
      recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <ProvedorSite value={destino}>
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

        {sujo && !emSessao && (
          <span className="font-mono text-serial uppercase tracking-[0.18em] text-accent">alterado</span>
        )}
        {emSessao && (
          <span className="font-mono text-serial uppercase tracking-[0.18em] text-muted">
            {convidado ? "grava no anfitrião" : "grava sozinho"}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {sujo && !emSessao && (
            <Button variant="ghost" onClick={descartar}>
              <RotateCcw size={13} /> Descartar
            </Button>
          )}
          {/* Ligado, o botão para de ser botão e vira placa: o ponto verde e a
              contagem dizem que tem mais gente na mesa sem ter que abrir o painel. */}
          <button
            type="button"
            aria-pressed={mostrarCoop}
            onClick={() => setMostrarCoop((v) => !v)}
            title={coop.ligado ? "Sessão a dois — abrir painel" : "Editar a dois"}
            className={cn(
              "no-drag flex h-[28px] shrink-0 items-center gap-2 px-2 text-[12px] transition-colors",
              "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-sage",
              mostrarCoop ? "bg-surface-2 text-text" : "text-muted hover:text-text",
            )}
          >
            <Users size={13} strokeWidth={1.8} aria-hidden />
            <span>A dois</span>
            {coop.ligado && (
              <>
                <span aria-hidden className="h-[5px] w-[5px] shrink-0 rounded-full bg-ok" />
                <span className="font-mono text-serial text-muted">
                  {String(coop.estado.pares.length + 1).padStart(2, "0")}
                </span>
              </>
            )}
          </button>
          {/* No convidado é o único jeito de ficar com o convite: a pasta do
              site está na máquina do anfitrião, não na dele. */}
          {(id || convidado) && dados && (
            <Button variant="ghost" onClick={() => setDuplicando(true)}>
              <Copy size={13} /> {convidado ? "Salvar aqui" : "Salvar como novo"}
            </Button>
          )}
          {id && !convidado && (
            <Button variant="ghost" onClick={() => void reveal(id)}>
              <FolderOpen size={13} /> Abrir pasta
            </Button>
          )}
          {!emSessao && (
            <Button variant="primary" size="sm" disabled={!sujo || salvando} onClick={() => void salvar()}>
              <Save size={13} /> {salvando ? "Salvando…" : "Salvar"}
            </Button>
          )}
        </div>
      </Topo>

      {conflito && (
        <FaixaConflito
          onFicarComArquivo={() => void ficarComArquivo()}
          onGravarPorCima={() => void gravarPorCima()}
        />
      )}

      <div className="flex min-h-0 min-w-0 flex-1">
        {dados && secao && (
          <Regua
            chaves={chaves}
            atual={secao}
            desligadas={desligadas}
            faltando={faltando}
            onEscolher={setSecao}
            onSemear={semear}
          />
        )}

        <section className="min-w-0 flex-1 overflow-auto px-7 pb-16 pt-6">
          {erro && <p className="border-l-2 border-bad pl-3 text-[13px] text-bad">{erro}</p>}
          {mostrarCoop ? (
            <PainelCoop
              estado={coop.estado}
              erro={coop.erro}
              ocupado={coop.ocupado}
              siteId={id}
              abrir={(alvo) => void coop.abrir(alvo)}
              entrar={(endereco, codigo, nome) => void coop.entrar(endereco, codigo, nome)}
              fechar={() => void coop.fechar()}
            />
          ) : (
            <>
              {!id && !dados && (
                <p className="text-[13px] text-muted">
                  {convidado
                    ? "Esperando o convite do anfitrião…"
                    : "Escolha um site com convite.json."}
                </p>
              )}
              {id && !dados && !erro && (
                <p className="font-mono text-[12px] text-muted">Lendo convite.json…</p>
              )}
              {dados && secao && (
                <>
                  <div className="mb-5 flex items-center gap-3 border-b border-rule pb-2">
                    <h2 className="font-mono text-label uppercase tracking-[0.18em] text-text">
                      {rotulo(secao)}
                    </h2>
                    {podeDesligar(secao) && !bloqueio && (
                      <ChaveSecao
                        ligada={estaLigada(dados, secao)}
                        nome={rotulo(secao)}
                        onAlternar={(proxima) => {
                          const proximo = alternarSecao(dados, secao, proxima);
                          setDados(proximo);
                          publicar([CHAVE_SECOES], proximo[CHAVE_SECOES] ?? {});
                        }}
                      />
                    )}
                    {/* Cadeado e nome, não só o cinza do formulário: quem chega no
                        meio da edição precisa saber de quem é a mão, não só que
                        a caixa não responde. */}
                    {bloqueio && (
                      <span className="flex items-center gap-1.5 font-mono text-label uppercase tracking-[0.14em] text-muted">
                        <Lock size={12} strokeWidth={1.8} aria-hidden />
                        {bloqueio.nome} está aqui
                      </span>
                    )}
                  </div>
                  <div
                    aria-disabled={bloqueio ? true : undefined}
                    className={cn(bloqueio && "pointer-events-none select-none opacity-40")}
                  >
                    <JsonForm
                      dados={dados}
                      secao={secao}
                      onChange={setDados}
                      onPatch={publicar}
                      convidado={convidado}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </section>

        <Divisor largura={largura} onLargura={setLargura} />

        {/* No convidado não há pasta pra rodar `next dev`: o que se vê é o preview
            do anfitrião servido pela LAN, e o QR aponta pro Mac dele. */}
        <PainelAoVivo
          url={convidado ? coop.estado.aoVivo : (servidor?.url ?? null)}
          lan={convidado ? coop.estado.aoVivo : (servidor?.lan ?? null)}
          largura={largura}
          ligando={ligando}
          podeLigar={!!id}
          emprestado={convidado}
          recarga={recarga}
          onRecarregar={() => setRecarga((n) => n + 1)}
          onLigar={() => void ligarAoVivo()}
          onParar={() => void desligarAoVivo()}
        />
      </div>

      {duplicando &&
        dados &&
        (() => {
          // No convidado a origem é o site do anfitrião, que não existe aqui.
          const origem = (convidado ? coop.estado.siteId : id) ?? "";
          if (!origem) return null;
          return (
            <SalvarComoNovo
              origemId={origem}
              categoriaPadrao={origem.split("/")[0] ?? "casamento"}
              daSessao={convidado ? dados : undefined}
              onFechar={() => setDuplicando(false)}
              onPronto={(copia) => void aoDuplicar(copia)}
            />
          );
        })()}
    </div>
    </ProvedorSite>
  );
}
