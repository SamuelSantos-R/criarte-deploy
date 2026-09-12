import { useCallback, useEffect, useState, type ReactElement, type ReactNode } from "react";
import { FileText, Image, Rocket, Signature, SlidersHorizontal, Smartphone, Stamp } from "lucide-react";
import { getSettings, listSites, type Site } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ProvaProvider, useProva } from "@/lib/prova";
import { usarServidor } from "@/lib/servidor";
import { BarraDeCor } from "@/components/BarraDeCor";
import { Convites } from "@/screens/Convites";
import { Deploy } from "@/screens/Deploy";
import { Fotos } from "@/screens/Fotos";
import { Preview } from "@/screens/Preview";
import { Config } from "@/screens/Config";
import { Envelope } from "@/screens/Envelope";
import { Monograma } from "@/screens/Monograma";

type Tela = "convites" | "preview" | "deploy" | "fotos" | "envelope" | "monograma" | "config";
type Item = { id: Tela; label: string; nota: string; Icone: typeof FileText };

// Os semáforos do macOS flutuam por cima da margem de chapa; no Windows não
// existem e o slug tem de encostar à esquerda. PRODUCT.md proíbe assumir um.
const MAC = navigator.userAgent.includes("Macintosh");

const TRABALHO: Item[] = [
  { id: "convites", label: "Convites", nota: "montar e afinar", Icone: FileText },
  { id: "preview", label: "Preview", nota: "ver no aparelho", Icone: Smartphone },
  { id: "deploy", label: "Publicar", nota: "pôr no ar", Icone: Rocket },
  { id: "fotos", label: "Fotos", nota: "galeria do convite", Icone: Image },
];

// Fora do fluxo do site: envelopador e monograma não precisam de raiz nem de convite.
const AVULSO: Item[] = [
  { id: "envelope", label: "Envelopador 3000", nota: "", Icone: Stamp },
  { id: "monograma", label: "Monogramas", nota: "", Icone: Signature },
  { id: "config", label: "Config", nota: "", Icone: SlidersHorizontal },
];

/**
 * Instrumento rotulado. Aceso, a linha inverte para a mesa de luz — é o único
 * sítio claro da coluna, e custa zero tinta de processo. Quem entra de vez em
 * quando lê o nome; não tem de decifrar um ícone.
 */
function Instrumento({
  item,
  ativo,
  bloqueado,
  onClick,
}: {
  item: Item;
  ativo: boolean;
  bloqueado: boolean;
  onClick: () => void;
}): ReactElement {
  const { label, nota, Icone } = item;
  return (
    <button
      disabled={bloqueado}
      onClick={onClick}
      aria-current={ativo ? "page" : undefined}
      className={cn(
        "no-drag flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-0",
        "disabled:pointer-events-none disabled:opacity-30",
        ativo ? "light bg-ground text-text" : "text-muted hover:bg-surface-2 hover:text-text",
      )}
    >
      <Icone size={15} strokeWidth={1.75} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium leading-tight">{label}</span>
        {nota && (
          <span className={cn("block truncate text-[10px] leading-tight", ativo ? "text-muted" : "text-muted")}>
            {nota}
          </span>
        )}
      </span>
    </button>
  );
}

function Grupo({ children }: { children: ReactNode }): ReactElement {
  return <div className="flex flex-col">{children}</div>;
}

function Etiqueta({ children }: { children: ReactNode }): ReactElement {
  return (
    <span className="px-3 pb-1.5 pt-4 font-narrow text-gauge font-semibold uppercase text-muted">
      {children}
    </span>
  );
}

/** Margem de chapa: a faixa gravada no topo que diz que folha está sob o vidro. */
function MargemDeChapa({ sites }: { sites: number }): ReactElement {
  const { prova } = useProva();
  return (
    <header
      className="drag-region flex h-[44px] shrink-0 items-center gap-3 border-b border-rule bg-surface-2 pr-4"
      style={{ paddingLeft: MAC ? 84 : 16 }}
    >
      <span className="font-narrow text-gauge font-semibold uppercase text-muted">Criarte Studio</span>
      <span className="h-3 w-px bg-rule-strong" />
      {prova.site ? (
        <span className="truncate font-narrow text-[15px] font-semibold uppercase tracking-[0.1em] text-text">
          {prova.site}
        </span>
      ) : (
        <span className="font-narrow text-[15px] uppercase tracking-[0.1em] text-muted">
          sem convite na mesa
        </span>
      )}
      <span
        className="gauge ml-auto font-narrow text-gauge font-semibold uppercase text-muted"
        title={`${sites} ${sites === 1 ? "convite" : "convites"} na raiz`}
      >
        {String(sites).padStart(3, "0")} convites
      </span>
    </header>
  );
}

/**
 * Uma tela de trabalho nunca é desmontada depois da primeira visita: o preview
 * ao vivo mora dentro dela e desmontar mataria o site aberto (e o log do deploy,
 * e a rolagem do formulário). Trocar de aba é só esconder por CSS.
 */
function Aba({ ativa, children }: { ativa: boolean; children: ReactNode }): ReactElement {
  return (
    <div
      aria-hidden={!ativa}
      // `hidden` some do layout mas mantém o nó — o iframe do preview continua vivo.
      className={cn("min-h-0 min-w-0 flex-1 flex-col", ativa ? "flex" : "hidden")}
    >
      {children}
    </div>
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
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-ground">
      <MargemDeChapa sites={sites.length} />

      <div className="flex min-h-0 min-w-0 flex-1">
        <nav
          aria-label="Instrumentos"
          className="flex w-[208px] shrink-0 flex-col border-r border-rule bg-surface"
        >
          <Etiqueta>Bancada</Etiqueta>
          <Grupo>
            {TRABALHO.map((item) => (
              <Instrumento
                key={item.id}
                item={item}
                ativo={tela === item.id}
                bloqueado={semRaiz}
                onClick={() => irPara(item.id)}
              />
            ))}
          </Grupo>

          <span className="flex-1" />

          {erro && (
            <p
              title={erro}
              className="mx-3 mb-2 border-l-2 border-pencil bg-surface-2 px-2 py-1.5 text-[11px] leading-snug text-text"
            >
              <span className="mb-0.5 block font-narrow text-gauge font-semibold uppercase text-muted">
                Não deu para ler a raiz
              </span>
              <span className="line-clamp-2">{erro}</span>
            </p>
          )}

          <Etiqueta>À parte</Etiqueta>
          <Grupo>
            {AVULSO.map((item) => (
              <Instrumento
                key={item.id}
                item={item}
                ativo={tela === item.id}
                bloqueado={false}
                onClick={() => irPara(item.id)}
              />
            ))}
          </Grupo>
          <span className="h-3" />
        </nav>

        {/* A mesa de luz: a única região clara, e onde tudo se lê e se edita. */}
        <main className="light flex min-h-0 min-w-0 flex-1 flex-col bg-ground text-text">
          {!pronto && <p className="px-6 pt-16 font-mono text-[12px] text-muted">Abrindo…</p>}
          {pronto && ((semRaiz && tela !== "envelope" && tela !== "monograma") || tela === "config") && (
            <Config sitesRoot={sitesRoot} onRoot={trocarRaiz} />
          )}
          {pronto && !semRaiz && visitadas.includes("convites") && (
            <Aba ativa={tela === "convites"}>
              <Convites
                sites={sites}
                recarregar={recarregar}
                id={site}
                setId={setSite}
                ativa={tela === "convites"}
              />
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
          {pronto && tela === "envelope" && <Envelope />}
          {/* Montada escondida como as abas do fluxo: trocar de tela não pode apagar o monograma em curso. */}
          {pronto && visitadas.includes("monograma") && (
            <Aba ativa={tela === "monograma"}>
              <Monograma ativa={tela === "monograma"} />
            </Aba>
          )}
        </main>
      </div>

      <BarraDeCor />
    </div>
  );
}

export default function App(): ReactElement {
  return (
    <ProvaProvider>
      <Estudio />
    </ProvaProvider>
  );
}
