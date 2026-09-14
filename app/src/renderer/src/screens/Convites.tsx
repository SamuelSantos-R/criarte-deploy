import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useSiteValido } from "@/lib/useSiteValido";
import { Lock, Redo2, RotateCcw, Save, Undo2 } from "lucide-react";
import {
  onConviteMudou,
  plantarSecao,
  previewRecarregar,
  previewPintar,
  previewRepintar,
  previewScroll,
  readConvite,
  reveal,
  semearAsset,
  vigiarConvite,
  writeConvite,
  type Site,
  previewPreaquecer,
} from "@/lib/api";
import {
  alternarSecao,
  ancoraDe,
  ausentes,
  completarSecao,
  faltamCampos,
  CHAVE_SECOES,
  estaLigada,
  podeDesligar,
  rotulo,
  semearSecao,
} from "@/lib/secoes";
import { derrubarServidor, subirServidor, usarServidor } from "@/lib/servidor";
import { useProva } from "@/lib/prova";
import { useHistorico } from "@/lib/useHistorico";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/primitives";
import { JsonForm, setIn, type Caminho } from "@/components/JsonForm";
import { PainelCoop } from "@/components/PainelCoop";
import { useCoop } from "@/lib/useCoop";
import { ProvedorSite } from "@/components/CampoArquivo";
import { Divisor, useLarguraPainel } from "@/components/Divisor";
import { ApagarSite } from "@/components/ApagarSite";
import { RenomearSite } from "@/components/RenomearSite";
import { Tokenizar } from "@/components/Tokenizar";
import { SalvarComoNovo } from "@/components/SalvarComoNovo";
import { SeletorSite } from "@/components/SeletorSite";
import { FaixaConflito, PainelAoVivo } from "@/components/PainelAoVivo";
import { BotaoTrilha, ChaveSecao, Regua } from "@/components/ReguaSecoes";
import { Topo } from "@/components/Topo";
import { BotaoCoop, MenuConvite } from "@/components/AcoesConvite";

// Tempo entre a última tecla e o disco. Curto o bastante pra parecer ao vivo,
// longo o bastante pra não gravar letra por letra enquanto se digita um nome.
const REPOUSO = 400;


export function Convites({
  sites,
  recarregar,
  id,
  setId,
  ativa,
}: {
  sites: Site[];
  recarregar: () => Promise<void>;
  id: string | null;
  setId: (novo: string | null) => void;
  ativa: boolean;
}): ReactElement {
  const comConvite = useMemo(() => sites.filter((s) => s.temConvite), [sites]);
  const { marcar } = useProva();
  const [original, setOriginal] = useState<string>("");
  const [secao, setSecao] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Gravou mas com ressalva não é erro. Sem um canal só pra isso, o convidado do
  // co-op via a linha vermelha do SITE_ID e concluía que não tinha baixado nada.
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [duplicando, setDuplicando] = useState(false);
  const [renomeando, setRenomeando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [tokenizando, setTokenizando] = useState(false);
  const rodando = usarServidor();
  // O dev server é um só no app inteiro: se a tela de Preview levou pra outro
  // site, este painel volta a oferecer "Ligar" em vez de mostrar convite alheio.
  const servidor = rodando?.siteId === id ? rodando : null;
  const [ligando, setLigando] = useState(false);
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
  // Neste Mac compilar um convite custa ~15s. Começa por trás assim que ele é
  // escolhido, para o "Ligar" encontrar a página já feita.
  useEffect(() => {
    if (id && !convidado) void previewPreaquecer(id).catch(() => {});
  }, [id, convidado]);
  // Com sessão aberta quem grava é o anfitrião, a cada patch. O mtime que este
  // painel guarda envelhece a cada gravação dessas, então um ⌘S daqui bateria na
  // guarda e acusaria conflito com o próprio trabalho.
  const emSessao = coop.ligado;
  const destino = useMemo(() => ({ siteId: id, convidado }), [id, convidado]);

  // Agora a escolha é do app inteiro, então este ecrã só a pode estreitar aos
  // que têm convite enquanto for ele o que está à frente. Escondido, limita-se a
  // exigir que o site exista — senão arrastava as outras abas atrás de si.
  useSiteValido(ativa ? comConvite : sites, id, setId);

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
    setAviso(null);
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
  const incompletas = dados ? faltamCampos(dados) : [];
  const sujo = dados !== null && JSON.stringify(dados) !== original;

  // A barra de cor no pé da janela mostra estes estados de qualquer aba. A
  // tranca alheia é a que tira a cruz de registo do registo; `donoDe` já
  // descarta as minhas, que é o que o convidado precisa.
  const trancaAlheia =
    coop.estado.trancas.map((t) => coop.donoDe(t.secao)).find((x) => x !== null)?.nome ?? null;
  useEffect(() => {
    marcar({
      porGravar: sujo,
      coopLigado: coop.ligado,
      coopPares: coop.ligado ? coop.estado.pares.length + 1 : 0,
      coopTranca: trancaAlheia,
    });
  }, [sujo, coop.ligado, coop.estado.pares.length, trancaAlheia, marcar]);

  /** Fora da sessão é um no-op — o editor não muda de forma por causa do co-op. */
  const publicar = useCallback(
    (caminho: Caminho, valor: unknown): void => {
      if (coop.ligado) void coop.publicar({ caminho, valor });
    },
    [coop.ligado, coop.publicar],
  );

  const completar = (chave: string): void => {
    if (!dados) return;
    const proximo = completarSecao(dados, chave);
    setDados(proximo);
    publicar([chave], proximo[chave]);
  };

  const semear = (chave: string): void => {
    if (!dados) return;
    const proximo = semearSecao(dados, chave);
    setDados(proximo);
    publicar([chave], proximo[chave]);
    setSecao(chave);
    // Criar a chave não põe nada no ar: o convite ainda tem de ter o componente
    // que a desenha e a linha que o pendura na página. As alianças vêm junto,
    // porque a maior parte dos convites nunca as teve. Como convidado não dá: a
    // pasta do site está no PC do anfitrião, e é ele quem grava.
    if (id && !convidado) {
      void semearAsset(id, chave).catch(() => undefined);
      void plantarSecao(id, chave)
        .then((p) => {
          if (p.impedimento) setAviso(`A secção foi criada, mas não entrou na página: ${p.impedimento}.`);
        })
        .catch((e: Error) => setAviso(`A secção foi criada, mas não entrou na página: ${e.message}.`));
    }
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
    const antes = JSON.parse(original) as Record<string, unknown>;
    recomecar(antes);
    // Descartar depois de semear leva a secção embora; sem isto o formulário
    // dela ficava aberto e vazio, a editar uma chave que já não existe.
    const secoes = Object.keys(antes).filter((k) => k !== CHAVE_SECOES);
    setSecao((atual) => (atual && secoes.includes(atual) ? atual : (secoes[0] ?? null)));
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

  /**
   * Cor e medida não esperam por disco nenhum: são custom properties no `<html>`
   * do convite, e o Studio escreve-as direto no quadro. O que se vê é o que o
   * build vai dar, porque quem faz a conta é o `varsDe` do próprio site.
   *
   * Corre também em sessão, e é aí que mais rende: com a coop aberta ninguém
   * grava em disco, então sem isto o convidado arrastava um cursor e não via
   * absolutamente nada mudar até a sessão fechar.
   *
   * Os 60ms são para o cursor arrastado: uma pintura por quadro em vez de uma
   * por pixel. Texto e estrutura não passam por aqui — esses ainda pedem
   * recompilação, e é o `previewRepintar` que decide.
   */
  useEffect(() => {
    if (!dados) return;
    const t = setTimeout(() => void previewPintar(dados).catch(() => undefined), 60);
    return () => clearTimeout(t);
  }, [dados]);

  // Gravar o rascunho não chega. Medido: o `next dev` serve o convite.json novo
  // em ~3s, mas a página já aberta nunca repinta — 20s de observação e nada. O
  // HMR não propaga a mudança do json. Então mandamos recarregar nós, por
  // dentro do frame, o que preserva o scroll e não remonta o iframe.
  useEffect(() => {
    // Com conflito em cena o disco não é mais nosso: insistir só faria a
    // gravação bater na trava a cada tecla.
    if (!servidor || !id || !dados || conflito || emSessao) return;
    // Voltar ao valor salvo — desfazendo ou desligando e religando uma seção —
    // deixava o disco preso no último rascunho, e o preview mentia.
    if (!sujo) {
      if (!rascunho.current) return;
      rascunho.current = false;
      void gravar(id, dados)
        .then(() => previewRepintar(dados))
        .catch((e: Error) => setErro(e.message));
      return;
    }
    const t = setTimeout(() => {
      rascunho.current = true;
      void gravar(id, dados)
        .then(() => previewRepintar(dados))
        .catch((e: Error) => setErro(e.message));
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
      // A aba fica montada escondida: sem isto o Cmd+Z de outra tela desfazia o convite às cegas.
      if (!ativa) return;
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
  const aoDuplicar = async (copia: { id: string; faltam: string[] }): Promise<void> => {
    setDuplicando(false);
    setErro(null);
    // Numa máquina sem o config do CLI não há chave pra registar o convite, e o
    // uuid do mural fica em falta junto com as outras. Sem elas o correio do
    // amor abre vazio e não diz porquê — a pasta em si está inteira, e é isso
    // que a linha tem de dizer primeiro.
    setAviso(
      copia.faltam.length > 0
        ? `${copia.id} gravado na tua máquina. Falta no .env.local: ${copia.faltam.join(", ")} — sem isso o mural de recados abre vazio.`
        : `${copia.id} gravado na tua máquina.`,
    );
    try {
      // O convidado não tinha convite aberto do próprio disco pra devolver ao
      // estado salvo, e o convite.json dele já foi escrito com o doc da sessão.
      if (!convidado) {
        if (dados) await writeConvite(copia.id, dados);
        await desfazerNoDisco();
        await derrubarServidor();
      }
      // A lista tem de já conhecer o convite novo antes de o escolher: enquanto
      // ele não estiver lá, `useSiteValido` devolve o id ao primeiro da lista e
      // a troca de projeto bate de volta sem dizer nada — quem continua a
      // escrever escreve no convite antigo.
      await recarregar();
      if (!convidado) setId(copia.id);
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
        <div className="no-drag flex shrink-0 items-center rounded-full border border-rule bg-surface px-0.5">
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

        {emSessao && (
          <span className="font-narrow text-gauge font-semibold text-muted">
            {convidado ? "grava no anfitrião" : "grava sozinho"}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {sujo && !emSessao && (
            <Button variant="ghost" className="h-9 rounded-full" onClick={descartar}>
              <RotateCcw size={13} /> Descartar
            </Button>
          )}
          <BotaoCoop
            ligado={coop.ligado}
            // O convidado não recebe a lista de pares: do lado dele há sempre o anfitrião.
            outros={convidado ? Math.max(1, coop.estado.pares.length) : coop.estado.pares.length}
            aberto={mostrarCoop}
            onClick={() => setMostrarCoop((v) => !v)}
          />
          <MenuConvite
            convidado={convidado}
            // No convidado é o único jeito de ficar com o convite: a pasta do
            // site está na máquina do anfitrião, não na dele.
            podeSalvarComoNovo={Boolean((id || convidado) && dados)}
            temSite={Boolean(id)}
            onSalvarComoNovo={() => setDuplicando(true)}
            onRenomear={() => setRenomeando(true)}
            onTokenizar={() => setTokenizando(true)}
            onAbrirPasta={() => id && void reveal(id)}
            onApagar={() => setApagando(true)}
          />
          {/* Amarelo é a tinta do "por gravar": o botão só a veste enquanto há
              alguma coisa por gravar, e volta a contorno assim que o disco iguala. */}
          {!emSessao && (
            <Button
              variant={sujo ? "save" : "outline"}
              size="sm"
              className="h-9 rounded-full px-4"
              disabled={!sujo || salvando}
              onClick={() => void salvar()}
            >
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
          {erro && <p className="rounded-lg bg-pencil/10 px-3 py-2 text-[13px] text-pencil">{erro}</p>}
          {aviso && <p className="rounded-lg bg-cyan/10 px-3 py-2 text-[13px] text-text">{aviso}</p>}
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
                    <h2 className="font-narrow font-semibold text-label text-text">
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
                      <span className="flex items-center gap-1.5 font-narrow font-semibold text-label text-muted">
                        <Lock size={12} strokeWidth={1.8} aria-hidden />
                        {bloqueio.nome} está aqui
                      </span>
                    )}
                  </div>
                  <div
                    aria-disabled={bloqueio ? true : undefined}
                    className={cn(bloqueio && "pointer-events-none select-none opacity-40")}
                  >
                    {incompletas.includes(secao) && (
                      <div className="mb-4 flex items-start gap-3">
                        <p className="rounded-lg bg-cyan/10 px-3 py-2 text-[13px] text-text">
                          Esta secção ganhou campos novos desde que este convite foi feito. Trazê-los
                          não mexe no que já está escrito — só acrescenta o que falta.
                        </p>
                        <Button variant="primary" size="sm" onClick={() => completar(secao)}>
                          Trazer os novos
                        </Button>
                      </div>
                    )}
                    <JsonForm
                      dados={dados}
                      secao={secao}
                      onChange={setDados}
                      onPatch={publicar}
                      convidado={convidado}
                      siteId={convidado ? null : id}
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
          onRecarregar={() => void previewRecarregar()}
          onLigar={() => void ligarAoVivo()}
          onParar={() => void desligarAoVivo()}
        />
      </div>

      {tokenizando && id && (
        <Tokenizar
          id={id}
          onFechar={() => setTokenizando(false)}
          onPronto={() => recarregar()}
        />
      )}

      {renomeando && id && (
        <RenomearSite
          id={id}
          onFechar={() => setRenomeando(false)}
          onPronto={(novo) => {
            setRenomeando(false);
            // A pasta mudou debaixo do painel: relê a lista primeiro e só então
            // aponta pro id novo, senão o selector fica a mostrar um site morto
            // ou salta pro primeiro da lista por o id novo ainda não estar lá.
            void recarregar().then(() => setId(novo));
          }}
        />
      )}

      {apagando && id && (
        <ApagarSite
          id={id}
          onFechar={() => setApagando(false)}
          onPronto={() => {
            setApagando(false);
            // O site deixou de existir: relê a lista e larga o id. O
            // `useSiteValido` escolhe outro — apontar para o apagado deixava o
            // painel a ler uma pasta que já não está lá.
            void recarregar().then(() => setId(null));
          }}
        />
      )}

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
