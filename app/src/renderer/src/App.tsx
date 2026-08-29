import { useCallback, useEffect, useState, type ReactElement, type ReactNode } from "react";
import { FileText, Image, Rocket, SlidersHorizontal, Smartphone, Stamp } from "lucide-react";
import { getSettings, listSites, type Site } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Convites } from "@/screens/Convites";
import { Deploy } from "@/screens/Deploy";
import { Fotos } from "@/screens/Fotos";
import { Preview } from "@/screens/Preview";
import { Config } from "@/screens/Config";
import { Envelope } from "@/screens/Envelope";

type Tela = "convites" | "preview" | "deploy" | "fotos" | "envelope" | "config";
type Item = { id: Tela; label: string; Icone: typeof FileText };

const TRABALHO: Item[] = [
  { id: "convites", label: "Convites", Icone: FileText },
  { id: "preview", label: "Preview", Icone: Smartphone },
  { id: "deploy", label: "Publicar", Icone: Rocket },
  { id: "fotos", label: "Fotos", Icone: Image },
];

// Fora do fluxo do site: o envelopador não precisa de raiz nem de convite.
const AVULSO: Item[] = [
  { id: "envelope", label: "Envelopador 3000", Icone: Stamp },
  { id: "config", label: "Config", Icone: SlidersHorizontal },
];

function Botao({
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
  const { label, Icone } = item;
  return (
    <button
      disabled={bloqueado}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-current={ativo ? "page" : undefined}
      className={cn(
        "no-drag relative flex h-[38px] w-11 items-center justify-center transition-colors",
        "disabled:pointer-events-none disabled:opacity-25",
        ativo ? "text-text" : "text-muted hover:text-text",
      )}
    >
      <span className={cn("absolute left-0 h-4 w-[2px]", ativo ? "bg-sage" : "bg-transparent")} />
      <Icone size={17} strokeWidth={1.6} />
    </button>
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

export default function App(): ReactElement {
  const [sitesRoot, setSitesRoot] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [tela, setTela] = useState<Tela>("convites");
  // Monta na primeira visita e nunca mais desmonta. Ver <Aba>.
  const [visitadas, setVisitadas] = useState<Tela[]>(["convites"]);

  const irPara = (destino: Tela): void => {
    setTela(destino);
    setVisitadas((v) => (v.includes(destino) ? v : [...v, destino]));
  };

  const recarregar = useCallback(() => {
    listSites()
      .then((s) => {
        setSites(s);
        setErro(null);
      })
      .catch((e: Error) => setErro(e.message));
  }, []);

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
    <div className="grain relative flex h-screen w-screen overflow-hidden bg-ground">
      {/* pt-[66px] abre espaço pros semáforos do macOS, que flutuam sobre o trilho. */}
      <nav
        aria-label="Seções"
        className="drag-region flex w-11 shrink-0 flex-col items-center border-r border-rule bg-surface pb-4 pt-[66px]"
      >
        {TRABALHO.map((item) => (
          <Botao
            key={item.id}
            item={item}
            ativo={tela === item.id}
            bloqueado={semRaiz}
            onClick={() => irPara(item.id)}
          />
        ))}

        <span className="mt-auto" />
        {erro && <span title={erro} aria-label={`Erro: ${erro}`} className="mb-2 h-1.5 w-1.5 rounded-full bg-bad" />}
        {AVULSO.map((item) => (
          <Botao key={item.id} item={item} ativo={tela === item.id} bloqueado={false} onClick={() => irPara(item.id)} />
        ))}
        <span
          title={`${sites.length} ${sites.length === 1 ? "site" : "sites"}`}
          className="mt-2 font-mono text-serial uppercase tracking-[0.1em] text-accent"
        >
          {String(sites.length).padStart(3, "0")}
        </span>
      </nav>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!pronto && <p className="px-9 pt-24 font-mono text-[12px] text-muted">Abrindo…</p>}
        {pronto && ((semRaiz && tela !== "envelope") || tela === "config") && (
          <Config sitesRoot={sitesRoot} onRoot={trocarRaiz} />
        )}
        {pronto && !semRaiz && visitadas.includes("convites") && (
          <Aba ativa={tela === "convites"}>
            <Convites sites={sites} recarregar={recarregar} />
          </Aba>
        )}
        {pronto && !semRaiz && visitadas.includes("preview") && (
          <Aba ativa={tela === "preview"}>
            <Preview sites={sites} />
          </Aba>
        )}
        {pronto && !semRaiz && visitadas.includes("deploy") && (
          <Aba ativa={tela === "deploy"}>
            <Deploy sites={sites} />
          </Aba>
        )}
        {pronto && !semRaiz && visitadas.includes("fotos") && (
          <Aba ativa={tela === "fotos"}>
            <Fotos sites={sites} />
          </Aba>
        )}
        {pronto && tela === "envelope" && <Envelope />}
      </main>
    </div>
  );
}
