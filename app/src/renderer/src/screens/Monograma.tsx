import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { BookOpen, CloudUpload, Dices, Download, FolderOpen, Plus, Redo2, Undo2 } from "lucide-react";
import { parse, type Font } from "opentype.js";
import {
  bibliotecaAbrir,
  bibliotecaSalvar,
  monogramaAbrirPasta,
  monogramaExportar,
  monogramaFontes,
  monogramaImportarFonte,
  monogramaImportarMoldura,
  monogramaLerFonte,
  monogramaLerMoldura,
  monogramaMolduras,
  monogramaRecursos,
  type CartaoMonograma,
  type FonteMonograma,
  type MolduraLida,
  type MonogramaExportado,
  type RecursosMonograma,
} from "@/lib/api";
import { useHistorico } from "@/lib/useHistorico";
import { achatarGlifo, caixa, desenhar, type Glifo } from "@/lib/monograma/geometria";
import {
  composicaoInicial,
  FONTE_PADRAO,
  montarSvg,
  variar,
  type Composicao,
  type Moldura,
  type MolduraArquivo,
  type Papel,
} from "@/lib/monograma/composicao";
import { lerEdicao, montarEdicao, type Edicao } from "@/lib/monograma/edicao";
import { curvasParaD } from "@/lib/monograma/curvas";
import { medirImagem, paletaDe, paraPng } from "@/lib/monograma/rasterizar";
import { Button } from "@/components/ui/primitives";
import { Topo } from "@/components/Topo";
import { Segmentado } from "@/components/ui/Segmentado";
import { PalcoMonograma } from "@/components/monograma/PalcoMonograma";
import { PainelMonograma } from "@/components/monograma/PainelMonograma";
import { BibliotecaMonogramas } from "@/components/monograma/BibliotecaMonogramas";

const LADO_PNG = 1000;
/** Sorteio que não cruza as letras não é monograma; tenta de novo algumas vezes. */
const TENTATIVAS = 12;

function lerFonteBytes(bytes: Uint8Array): Font {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return parse(buf);
}

type Vista = "biblioteca" | "editor";

export function Monograma({ ativa }: { ativa: boolean }): ReactElement {
  const hist = useHistorico<Composicao>();
  const [vista, setVista] = useState<Vista>("biblioteca");
  const [rascunho, setRascunho] = useState<Composicao | null>(null);
  const [recursos, setRecursos] = useState<RecursosMonograma | null>(null);
  const [fontes, setFontes] = useState<Record<string, Font>>({});
  const [recentes, setRecentes] = useState<FonteMonograma[]>([]);
  const [lendoFonte, setLendoFonte] = useState(false);
  const [selecionada, setSelecionada] = useState<Papel>("cursiva");
  const [mostrarCruzamentos, setMostrarCruzamentos] = useState(false);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<null | "exportar" | "salvar" | "abrir">(null);
  const [saida, setSaida] = useState<MonogramaExportado | null>(null);
  /** Monograma da biblioteca em edição; null = ainda não foi salvo. */
  const [editando, setEditando] = useState<CartaoMonograma | null>(null);
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const [glifosSalvos, setGlifosSalvos] = useState<Edicao["glifos"] | null>(null);
  const [nomesDeFonte, setNomesDeFonte] = useState<Record<string, string>>({});
  const [versaoBiblioteca, setVersaoBiblioteca] = useState(0);
  const [molduras, setMolduras] = useState<FonteMonograma[]>([]);
  const [lendoMoldura, setLendoMoldura] = useState(false);
  /** A moldura arrastada já decodificada, pela chave — o palco e o export leem daqui. */
  const [molduraLida, setMolduraLida] = useState<{ chave: string; arq: MolduraArquivo; paleta: string[] } | null>(null);

  const { recomecar, definir, desfazer, refazer } = hist;

  useEffect(() => {
    Promise.all([monogramaRecursos(), monogramaFontes(), monogramaMolduras()])
      .then(([r, lista, listaMolduras]) => {
        setMolduras(listaMolduras);
        setRecursos(r);
        setFontes({ serifada: lerFonteBytes(r.serifada), [FONTE_PADRAO]: lerFonteBytes(r.milton) });
        setRecentes(lista);
      })
      .catch((e: Error) => setErro(e.message));
  }, []);

  const comp = rascunho ?? hist.valor;
  const fonteCursiva = comp ? fontes[comp.fonte] : undefined;

  // Achatar curva é o caro; só refaz quando muda a letra ou a fonte, não a cada arraste.
  // Sem a fonte nesta máquina, vale o glifo que veio salvo — se a letra for a mesma.
  const glifoSerifada = useMemo<Glifo | null>(() => {
    if (!comp) return null;
    if (fontes.serifada) return achatarGlifo(fontes.serifada, comp.serifada.char);
    const s = glifosSalvos?.serifada;
    return s && s.char === comp.serifada.char ? s.glifo : null;
  }, [fontes.serifada, comp?.serifada.char, glifosSalvos]); // eslint-disable-line react-hooks/exhaustive-deps
  const glifoCursiva = useMemo<Glifo | null>(() => {
    if (!comp) return null;
    if (fonteCursiva) return achatarGlifo(fonteCursiva, comp.cursiva.char);
    const s = glifosSalvos?.cursiva;
    return s && s.char === comp.cursiva.char && s.fonte === comp.fonte ? s.glifo : null;
  }, [fonteCursiva, comp?.cursiva.char, comp?.fonte, glifosSalvos]); // eslint-disable-line react-hooks/exhaustive-deps

  const desenho = useMemo(() => {
    if (!comp || !glifoSerifada || !glifoCursiva || glifoSerifada.vazio || glifoCursiva.vazio) return null;
    return desenhar(comp, { serifada: glifoSerifada, cursiva: glifoCursiva });
  }, [comp, glifoSerifada, glifoCursiva]);

  const carregarMoldura = useCallback(async (m: MolduraLida): Promise<void> => {
    const tamanho = await medirImagem(m.dataUrl);
    const paleta = await paletaDe(m.dataUrl).catch(() => []);
    setMolduraLida({ chave: m.chave, arq: { dataUrl: m.dataUrl, ...tamanho }, paleta });
  }, []);

  // Monograma aberto ou histórico que volta pra uma moldura arrastada: lê do disco se ainda não está em memória.
  const chaveMoldura = comp?.moldura.tipo === "arquivo" ? comp.moldura.chave : undefined;
  useEffect(() => {
    if (!chaveMoldura || molduraLida?.chave === chaveMoldura) return;
    monogramaLerMoldura(chaveMoldura)
      .then(carregarMoldura)
      .catch((e: Error) => setErro(e.message));
  }, [chaveMoldura, molduraLida?.chave, carregarMoldura]);
  const molduraArquivo = chaveMoldura && molduraLida?.chave === chaveMoldura ? molduraLida.arq : null;

  const mexeu = (): void => {
    setSaida(null);
    setSalvoEm(null);
  };

  const alterar = useCallback(
    (mudanca: Partial<Composicao>, podeJuntar = true) => {
      if (!hist.valor) return;
      setSaida(null);
      setSalvoEm(null);
      definir({ ...hist.valor, ...mudanca }, podeJuntar);
    },
    [hist.valor, definir],
  );

  const novo = (): void => {
    setEditando(null);
    setGlifosSalvos(null);
    setNome("");
    setErro(null);
    mexeu();
    recomecar(composicaoInicial("P", "E"));
    setVista("editor");
  };

  const abrir = async (c: CartaoMonograma): Promise<void> => {
    setErro(null);
    setOcupado("abrir");
    try {
      const { meta, edicao, moldura } = await bibliotecaAbrir(c.id);
      if (moldura) {
        await carregarMoldura(moldura);
        setMolduras(await monogramaMolduras());
      }
      const e = lerEdicao(edicao);
      // Campos que um monograma antigo não tinha nascem com o padrão.
      const base = composicaoInicial(e.comp.serifada.char, e.comp.cursiva.char);
      if (!fontes[e.comp.fonte] && e.comp.fonte !== FONTE_PADRAO) {
        const recente = recentes.find((f) => f.chave === e.comp.fonte);
        if (recente) {
          const f = lerFonteBytes(await monogramaLerFonte(recente.chave));
          setFontes((atual) => ({ ...atual, [recente.chave]: f }));
        }
      }
      setNomesDeFonte((n) => ({ ...n, [e.comp.fonte]: e.fonteNome }));
      setGlifosSalvos(e.glifos);
      setEditando({ ...c, ...meta, png: c.png, svg: c.svg });
      setNome(meta.nome);
      mexeu();
      recomecar({ ...base, ...e.comp, moldura: { ...base.moldura, ...e.comp.moldura } });
      setVista("editor");
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setOcupado(null);
    }
  };

  const escolherMoldura = (m: Pick<Moldura, "tipo" | "chave" | "nome">): void => {
    if (!hist.valor) return;
    const atual = hist.valor;
    // Moldura aperta o miolo: sem encolher, as letras atropelam os ramos.
    const escala = m.tipo !== "nenhuma" && atual.moldura.tipo === "nenhuma" && atual.escala > 0.6 ? 0.55 : atual.escala;
    alterar({ moldura: { escala: atual.moldura.escala, rot: atual.moldura.rot, ...m }, escala }, false);
  };

  const soltarMoldura = async (caminho: string): Promise<void> => {
    setErro(null);
    setLendoMoldura(true);
    try {
      const m = await monogramaImportarMoldura(caminho);
      await carregarMoldura(m);
      setMolduras(await monogramaMolduras());
      escolherMoldura({ tipo: "arquivo", chave: m.chave, nome: m.nome });
    } catch (e) {
      setErro(e instanceof Error ? `Não deu pra ler a moldura: ${e.message}` : String(e));
    } finally {
      setLendoMoldura(false);
    }
  };

  /** Leva o centro do desenho das letras pro centro da prancheta, sem mexer no resto. */
  const centralizar = (): void => {
    const c = desenho && hist.valor ? caixa(desenho.aneis) : null;
    if (!c || !hist.valor) return;
    const dx = 500 - (c.x1 + c.x2) / 2;
    const dy = 500 - (c.y1 + c.y2) / 2;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    const v = hist.valor;
    const arred = (n: number): number => Math.round(n * 10) / 10;
    alterar(
      {
        serifada: { ...v.serifada, x: arred(v.serifada.x + dx / v.escala), y: arred(v.serifada.y + dy / v.escala) },
        cursiva: { ...v.cursiva, x: arred(v.cursiva.x + dx / v.escala), y: arred(v.cursiva.y + dy / v.escala) },
        // Os toques seguem os cruzamentos, senão a troca de quem passa por cima se perde.
        toques: v.toques.map((t) => ({ ...t, x: t.x + dx, y: t.y + dy })),
      },
      false,
    );
  };

  const sortear = (): void => {
    if (!hist.valor || !glifoSerifada || !glifoCursiva) return;
    let nova = variar(hist.valor);
    for (let i = 1; i < TENTATIVAS; i++) {
      if (desenhar(nova, { serifada: glifoSerifada, cursiva: glifoCursiva }).cruzamentos.length >= 2) break;
      nova = variar(hist.valor);
    }
    mexeu();
    definir(nova, false);
  };

  const mover = (papel: Papel, x: number, y: number, fim: boolean): void => {
    if (!hist.valor) return;
    const base = rascunho ?? hist.valor;
    const nova = { ...base, [papel]: { ...base[papel], x, y } };
    if (!fim) return setRascunho(nova);
    setRascunho(null);
    mexeu();
    definir(nova, false);
  };

  const trocarCruzamento = (i: number): void => {
    const c = desenho?.cruzamentos[i];
    if (!c || !hist.valor) return;
    const cima: Papel = c.cima === "cursiva" ? "serifada" : "cursiva";
    const toques = hist.valor.toques.filter((t) => Math.hypot(t.x - c.x, t.y - c.y) >= 30);
    alterar({ toques: [...toques, { x: c.x, y: c.y, cima }] }, false);
  };

  const escolherFonte = async (chave: string): Promise<void> => {
    setErro(null);
    try {
      if (!fontes[chave]) {
        const f = lerFonteBytes(await monogramaLerFonte(chave));
        setFontes((atual) => ({ ...atual, [chave]: f }));
      }
      alterar({ fonte: chave, toques: [] }, false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  const soltarFonte = async (caminho: string): Promise<void> => {
    setErro(null);
    setLendoFonte(true);
    try {
      const nova = await monogramaImportarFonte(caminho);
      // Parse antes de trocar: arquivo que não é fonte não pode derrubar o palco.
      const f = lerFonteBytes(nova.bytes);
      setFontes((atual) => ({ ...atual, [nova.chave]: f }));
      setRecentes(await monogramaFontes());
      alterar({ fonte: nova.chave, toques: [] }, false);
    } catch (e) {
      setErro(e instanceof Error ? `Não deu pra ler a fonte: ${e.message}` : String(e));
    } finally {
      setLendoFonte(false);
    }
  };

  const nomeDaFonte = (chave: string): string =>
    chave === FONTE_PADRAO
      ? "Milton One Bold"
      : (recentes.find((f) => f.chave === chave)?.nome ?? nomesDeFonte[chave] ?? chave);

  /** SVG com curvas e PNG sem fundo — o mesmo par serve pra exportar e pra biblioteca. */
  const gerarArquivos = async (): Promise<{ svg: string; png: string } | null> => {
    if (!comp || !desenho || !recursos) return null;
    const svg = montarSvg(comp, curvasParaD(desenho.aneis), recursos.guirlanda, molduraArquivo);
    return { svg, png: await paraPng(svg, LADO_PNG) };
  };

  const exportar = async (): Promise<void> => {
    setErro(null);
    setOcupado("exportar");
    try {
      const arquivos = await gerarArquivos();
      if (!arquivos || !comp) return;
      const r = await monogramaExportar({ nome: nome.trim() || `${comp.serifada.char}${comp.cursiva.char}`, ...arquivos });
      if (r) setSaida(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  };

  const salvar = async (comoNovo: boolean): Promise<void> => {
    if (!comp || !glifoSerifada || !glifoCursiva) return;
    setErro(null);
    setOcupado("salvar");
    try {
      const arquivos = await gerarArquivos();
      if (!arquivos) return;
      const fonteNome = nomeDaFonte(comp.fonte);
      const cartao = await bibliotecaSalvar({
        id: comoNovo ? null : (editando?.id ?? null),
        nome: nome.trim(),
        iniciais: `${comp.serifada.char}${comp.cursiva.char}`,
        cor: comp.cor,
        fonte: fonteNome,
        moldura: comp.moldura.tipo === "arquivo" ? (comp.moldura.chave ?? null) : null,
        edicao: montarEdicao(comp, fonteNome, { serifada: glifoSerifada, cursiva: glifoCursiva }),
        ...arquivos,
      });
      setEditando(cartao);
      setSalvoEm(cartao.atualizado);
      setVersaoBiblioteca((v) => v + 1);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  };

  // A aba fica montada escondida pra não perder o monograma ao trocar de tela;
  // o atalho só vale com ela à vista e no editor.
  useEffect(() => {
    const atalho = (e: KeyboardEvent): void => {
      if (!ativa || vista !== "editor") return;
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) refazer();
      else desfazer();
    };
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
  }, [ativa, vista, desfazer, refazer]);

  const letraFaltando =
    (glifoSerifada?.vazio && comp?.serifada.char) || (glifoCursiva?.vazio && comp?.cursiva.char) || null;
  const fonteAusente = comp && !glifoCursiva && !fonteCursiva ? nomeDaFonte(comp.fonte) : null;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <Topo>
        <Segmentado
          rotulo="Vista"
          valor={vista}
          onChange={setVista}
          opcoes={[
            { valor: "biblioteca", rotulo: <><BookOpen size={13} /> Biblioteca</> },
            { valor: "editor", rotulo: "Editor", disabled: !comp },
          ]}
        />
        <Button variant="ghost" onClick={novo} disabled={!recursos}>
          <Plus size={13} /> Novo
        </Button>

        {vista === "editor" && (
          <>
            <span className="h-4 w-px bg-rule" />
            <Button variant="primary" onClick={sortear} disabled={!desenho} title="Sortear outra disposição">
              <Dices size={13} /> Variar
            </Button>
            <Button variant="ghost" onClick={desfazer} disabled={!hist.podeDesfazer} title="Desfazer (Cmd+Z)" aria-label="Desfazer">
              <Undo2 size={13} />
            </Button>
            <Button variant="ghost" onClick={refazer} disabled={!hist.podeRefazer} title="Refazer (Cmd+Shift+Z)" aria-label="Refazer">
              <Redo2 size={13} />
            </Button>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              {desenho && (
                <span className="mr-1 font-narrow text-gauge font-semibold text-muted">
                  {desenho.cruzamentos.length} {desenho.cruzamentos.length === 1 ? "cruzamento" : "cruzamentos"}
                </span>
              )}
              <Button variant="ghost" onClick={() => void exportar()} disabled={!desenho || ocupado !== null}>
                <Download size={13} /> {ocupado === "exportar" ? "Exportando…" : "Exportar"}
              </Button>
              {editando && (
                <Button variant="outline" onClick={() => void salvar(true)} disabled={!desenho || ocupado !== null}>
                  Salvar como novo
                </Button>
              )}
              <Button variant="save" onClick={() => void salvar(false)} disabled={!desenho || ocupado !== null}>
                <CloudUpload size={13} /> {ocupado === "salvar" ? "Salvando…" : editando ? "Salvar" : "Salvar na biblioteca"}
              </Button>
            </div>
          </>
        )}
      </Topo>

      {vista === "biblioteca" ? (
        <div className="flex min-h-0 flex-1 flex-col px-6 pt-5">
          {erro && <p className="mb-3 rounded-lg bg-pencil/10 px-3 py-2 font-mono text-[11px] text-pencil">{erro}</p>}
          {ocupado === "abrir" && <p className="mb-3 font-mono text-[12px] text-muted">Abrindo…</p>}
          <BibliotecaMonogramas acao="Abrir" onEscolher={(c) => void abrir(c)} podeApagar versao={versaoBiblioteca} />
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden bg-surface-2/40 p-8">
            {comp && (
              <div className="flex min-h-0 w-full flex-1 items-center justify-center">
                <PalcoMonograma
                  comp={comp}
                  desenho={desenho}
                  guirlanda={recursos?.guirlanda ?? null}
                  molduraArquivo={molduraArquivo}
                  selecionada={selecionada}
                  mostrarCruzamentos={mostrarCruzamentos}
                  onSelecionar={setSelecionada}
                  onMover={mover}
                  onTrocarCruzamento={trocarCruzamento}
                />
              </div>
            )}

            {fonteAusente && (
              <p className="rounded-lg bg-pencil/10 px-3 py-2 text-[12px] text-text">
                A fonte {fonteAusente} não está nesta máquina — arraste o arquivo dela pra trocar a letra.
              </p>
            )}
            {letraFaltando && (
              <p className="rounded-lg bg-pencil/10 px-3 py-2 text-[12px] text-text">A fonte não tem a letra “{letraFaltando}”.</p>
            )}
            {salvoEm && (
              <p className="rounded-lg bg-focus/10 px-3 py-2 text-[12px] text-text">Salvo na biblioteca — {editando?.nome}</p>
            )}
            {saida && (
              <div className="flex items-center gap-3 rounded-lg bg-focus/10 px-3 py-2 text-[12px] text-text">
                <span>{saida.arquivos.join(" · ")}</span>
                <Button variant="ghost" className="px-1" onClick={() => void monogramaAbrirPasta()}>
                  <FolderOpen size={13} /> Abrir pasta
                </Button>
              </div>
            )}
            {erro && <pre className="whitespace-pre-wrap rounded-lg bg-pencil/10 px-3 py-2 font-mono text-[11px] text-pencil">{erro}</pre>}
          </div>

          {comp && (
            <PainelMonograma
              comp={comp}
              alterar={alterar}
              selecionada={selecionada}
              setSelecionada={setSelecionada}
              nome={nome}
              setNome={setNome}
              recentes={recentes}
              fonteAtualNome={nomeDaFonte(comp.fonte)}
              lendoFonte={lendoFonte}
              onEscolherFonte={(chave) => void escolherFonte(chave)}
              onSoltarFonte={(caminho) => void soltarFonte(caminho)}
              mostrarCruzamentos={mostrarCruzamentos}
              setMostrarCruzamentos={setMostrarCruzamentos}
              molduras={molduras}
              lendoMoldura={lendoMoldura}
              onEscolherMoldura={escolherMoldura}
              onSoltarMoldura={(caminho) => void soltarMoldura(caminho)}
              paleta={molduraArquivo && molduraLida ? molduraLida.paleta : []}
              onCentralizar={centralizar}
            />
          )}
        </div>
      )}
    </div>
  );
}
