import { useCallback, useEffect, useState, type ReactElement, type ReactNode } from "react";
import { motion } from "framer-motion";
import { FileText, Image, KanbanSquare, Rocket, Settings, Signature, Smartphone, Stamp } from "lucide-react";
import { getSettings, listSites, type Site } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ProvaProvider, useProva } from "@/lib/prova";
import { usarServidor } from "@/lib/servidor";
import { BarraTopo } from "@/components/shell/BarraTopo";
import { ItemTrilho } from "@/components/shell/ItemTrilho";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Convites } from "@/screens/Convites";
import { Deploy } from "@/screens/Deploy";
import { Fotos } from "@/screens/Fotos";
import { Preview } from "@/screens/Preview";
import { Config } from "@/screens/Config";
import { Envelope } from "@/screens/Envelope";
import { Monograma } from "@/screens/Monograma";
import { Quadro } from "@/screens/Quadro";

type Tela = "convites" | "preview" | "deploy" | "fotos" | "envelope" | "monograma" | "quadro" | "config";
type Item = { id: Tela; label: string; Icone: typeof FileText };

const TRABALHO: Item[] = [
  { id: "convites", label: "Convites", Icone: FileText },
  { id: "preview", label: "Preview", Icone: Smartphone },
  { id: "deploy", label: "Publicar", Icone: Rocket },
  { id: "fotos", label: "Fotos", Icone: Image },
];

// Fora do fluxo do site: envelopador e monograma não precisam de raiz nem de convite.
const AVULSO: Item[] = [
  { id: "envelope", label: "Envelopes", Icone: Stamp },
  { id: "monograma", label: "Monogramas", Icone: Signature },
  { id: "quadro", label: "Quadro", Icone: KanbanSquare },
];

/**
 * Uma tela de trabalho nunca é desmontada depois da primeira visita: o preview
 * ao vivo mora dentro dela e desmontar mataria o site aberto (e o log do deploy,
 * e a rolagem do formulário). Trocar de aba é só esconder por CSS.
 */
function Aba({ ativa, children }: { ativa: boolean; children: ReactNode }): ReactElement {
  return (
    <motion.div
      aria-hidden={!ativa}
      // Continua a esconder por `display` e nunca desmonta — o iframe do preview
      // segue vivo. Só opacidade e deslocamento: filtro ou transform que ficasse
      // aplicado prenderia os modais `fixed` dentro do painel.
      initial={false}
      animate={
        ativa
          ? { opacity: 1, y: 0, display: "flex" }
          : { opacity: 0, y: 6, transitionEnd: { display: "none" } }
      }
      transition={{ duration: ativa ? 0.28 : 0, ease: [0.22, 1, 0.36, 1] }}
      className={cn("min-h-0 min-w-0 flex-1 flex-col")}
      style={{ display: ativa ? "flex" : "none" }}
    >
      {children}
    </motion.div>
  );
}

/** Tela que monta e desmonta: a mesma entrada das abas, sem ficar escondida. */
function Entrada({ children }: { children: ReactNode }): ReactElement {
  return (
    <motion.div
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function Estudio(): ReactElement {
  const [sitesRoot, setSitesRoot] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [tela, setTela] = useState<Tela>("convites");
  // Um site escolhido para o app inteiro. Cada ecrã tinha o seu, e daí saía o
  // pior erro possível sem nada em cena a denunciá-lo: editar um convite a olhar
  // para o preview de outro, a recarregar uma página que nunca ia mudar.
  const [site, setSite] = useState<string | null>(null);
  // Monta na primeira visita e nunca mais desmonta. Ver <Aba>.
  const [visitadas, setVisitadas] = useState<Tela[]>(["convites"]);
  const { marcar } = useProva();
  // O `next dev` é um só para o app inteiro, então quem o anuncia à barra de
  // cor é a casca — não cada ecrã que por acaso o esteja a olhar.
  const servidor = usarServidor();

  useEffect(() => marcar({ site }), [site, marcar]);
  useEffect(() => marcar({ servidor: servidor?.url ?? null }), [servidor?.url, marcar]);

  const irPara = (destino: Tela): void => {
    setTela(destino);
    setVisitadas((v) => (v.includes(destino) ? v : [...v, destino]));
  };

  const recarregar = useCallback(
    () =>
      listSites()
        .then((s) => {
          setSites(s);
          setErro(null);
        })
        .catch((e: Error) => setErro(e.message)),
    [],
  );

  useEffect(() => {
    getSettings()
      .then(({ sitesRoot: raiz }) => {
        setSitesRoot(raiz);
        setPronto(true);
        if (raiz) recarregar();
      })
      .catch(() => setPronto(true));
  }, [recarregar]);

  const trocarRaiz = (raiz: string | null): void => {
    setSitesRoot(raiz);
    if (raiz) recarregar();
    else setSites([]);
  };

  const semRaiz = pronto && !sitesRoot;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-ground text-text">
      <BarraTopo sites={sites.length} />

      <div className="flex min-h-0 min-w-0 flex-1">
        <nav aria-label="Ferramentas" className="flex w-[84px] shrink-0 flex-col items-center px-1.5 pb-3 pt-1">
          {TRABALHO.map((item) => (
            <ItemTrilho
              key={item.id}
              rotulo={item.label}
              Icone={item.Icone}
              ativo={tela === item.id}
              bloqueado={semRaiz}
              onClick={() => irPara(item.id)}
            />
          ))}

          <span className="my-2 h-px w-8 bg-rule" />

          {AVULSO.map((item) => (
            <ItemTrilho
              key={item.id}
              rotulo={item.label}
              Icone={item.Icone}
              ativo={tela === item.id}
              bloqueado={false}
              onClick={() => irPara(item.id)}
            />
          ))}

          <span className="flex-1" />

          {erro && (
            <span
              title={`Não deu para ler a pasta de sites: ${erro}`}
              className="mb-2 h-2 w-2 rounded-full bg-pencil"
              role="status"
              aria-label="Não deu para ler a pasta de sites"
            />
          )}
          <ItemTrilho rotulo="Config" Icone={Settings} ativo={tela === "config"} bloqueado={false} onClick={() => irPara("config")} />
        </nav>

        {/* A área de trabalho: um painel só, macio, apoiado no chão do tema — a prancheta do Canva. */}
        <main className="flex min-h-0 min-w-0 flex-1 pb-3 pr-3">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-rule bg-surface shadow-painel">
            {!pronto && <p className="px-6 pt-16 text-[13px] text-muted">Abrindo…</p>}
            {pronto && ((semRaiz && tela !== "envelope" && tela !== "monograma" && tela !== "quadro") || tela === "config") && (
              <Entrada key="config">
                <Config sitesRoot={sitesRoot} onRoot={trocarRaiz} />
              </Entrada>
            )}
            {pronto && !semRaiz && visitadas.includes("convites") && (
              <Aba ativa={tela === "convites"}>
                <Convites sites={sites} recarregar={recarregar} id={site} setId={setSite} ativa={tela === "convites"} />
              </Aba>
            )}
            {pronto && !semRaiz && visitadas.includes("preview") && (
              <Aba ativa={tela === "preview"}>
                <Preview sites={sites} id={site} setId={setSite} />
              </Aba>
            )}
            {pronto && !semRaiz && visitadas.includes("deploy") && (
              <Aba ativa={tela === "deploy"}>
                <Deploy sites={sites} id={site} setId={setSite} />
              </Aba>
            )}
            {pronto && !semRaiz && visitadas.includes("fotos") && (
              <Aba ativa={tela === "fotos"}>
                <Fotos sites={sites} id={site} setId={setSite} />
              </Aba>
            )}
            {pronto && tela === "envelope" && (
              <Entrada key="envelope">
                <Envelope />
              </Entrada>
            )}
            {pronto && visitadas.includes("quadro") && (
              <Aba ativa={tela === "quadro"}>
                <Quadro sites={sites} />
              </Aba>
            )}
            {/* Montada escondida como as abas do fluxo: trocar de tela não pode apagar o monograma em curso. */}
            {pronto && visitadas.includes("monograma") && (
              <Aba ativa={tela === "monograma"}>
                <Monograma ativa={tela === "monograma"} />
              </Aba>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App(): ReactElement {
  return (
    <ProvaProvider>
      <TooltipProvider delayDuration={300}>
        <Estudio />
      </TooltipProvider>
    </ProvaProvider>
  );
}
