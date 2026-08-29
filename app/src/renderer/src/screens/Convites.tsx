import { useEffect, useMemo, useState, type ReactElement } from "react";
import { FolderOpen, Save } from "lucide-react";
import { readConvite, reveal, writeConvite, type Site } from "@/lib/api";
import { iconeDe, rotulo } from "@/lib/secoes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/primitives";
import { JsonForm } from "@/components/JsonForm";
import { ProvedorSite } from "@/components/CampoArquivo";
import { Prova } from "@/components/Prova";
import { SeletorSite } from "@/components/SeletorSite";
import { Topo } from "@/components/Topo";

function Regua({
  chaves,
  atual,
  onEscolher,
}: {
  chaves: string[];
  atual: string | null;
  onEscolher: (chave: string) => void;
}): ReactElement {
  return (
    <nav aria-label="Seções do convite" className="w-[136px] shrink-0 overflow-y-auto border-r border-rule py-2">
      {chaves.map((chave, i) => {
        const Icone = iconeDe(chave);
        const ativo = chave === atual;
        return (
          <button
            key={chave}
            onClick={() => onEscolher(chave)}
            aria-current={ativo ? "true" : undefined}
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
            <span className="truncate">{rotulo(chave)}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function Convites({ sites, recarregar }: { sites: Site[]; recarregar: () => void }): ReactElement {
  const comConvite = useMemo(() => sites.filter((s) => s.temConvite), [sites]);
  const [id, setId] = useState<string | null>(null);
  const [dados, setDados] = useState<Record<string, unknown> | null>(null);
  const [original, setOriginal] = useState<string>("");
  const [secao, setSecao] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // A lista chega depois do primeiro render — abre o convite mais recente.
  useEffect(() => {
    if (id === null && comConvite[0]) setId(comConvite[0].id);
  }, [id, comConvite]);

  useEffect(() => {
    if (!id) return;
    let vivo = true;
    setDados(null);
    setSecao(null);
    setErro(null);
    readConvite(id)
      .then((d) => {
        if (!vivo) return;
        setDados(d);
        setOriginal(JSON.stringify(d));
        setSecao(Object.keys(d)[0] ?? null);
      })
      .catch((e: Error) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [id]);

  const chaves = dados ? Object.keys(dados) : [];
  const sujo = dados !== null && JSON.stringify(dados) !== original;

  const salvar = async (): Promise<void> => {
    if (!id || !dados || salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      await writeConvite(id, dados);
      setOriginal(JSON.stringify(dados));
      recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  useEffect(() => {
    const atalho = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void salvar();
      }
    };
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
  });

  return (
    <ProvedorSite value={id}>
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <Topo>
        <SeletorSite sites={sites} valor={id} onChange={setId} somenteConvite className="w-[220px]" />
        {sujo && (
          <span className="font-mono text-serial uppercase tracking-[0.18em] text-accent">alterado</span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
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
        {dados && secao && <Regua chaves={chaves} atual={secao} onEscolher={setSecao} />}

        <section className="min-w-0 flex-1 overflow-auto px-7 pb-16 pt-6">
          {erro && <p className="border-l-2 border-bad pl-3 text-[13px] text-bad">{erro}</p>}
          {!id && <p className="text-[13px] text-muted">Escolha um site com convite.json.</p>}
          {id && !dados && !erro && <p className="font-mono text-[12px] text-muted">Lendo convite.json…</p>}
          {dados && secao && <JsonForm dados={dados} secao={secao} onChange={setDados} />}
        </section>

        {/* A prova sangra pra fora do painel de propósito — folha em cima da mesa. */}
        <aside className="relative w-[404px] shrink-0 overflow-y-auto overflow-x-hidden border-l border-rule bg-surface">
          {dados && id ? (
            <div className="-mr-12 ml-7 mt-9 pb-24">
              <Prova dados={dados} siteId={id} />
            </div>
          ) : (
            <p className="px-7 py-9 text-[13px] text-muted">A prova aparece quando um convite estiver aberto.</p>
          )}
        </aside>
      </div>
    </div>
    </ProvedorSite>
  );
}
