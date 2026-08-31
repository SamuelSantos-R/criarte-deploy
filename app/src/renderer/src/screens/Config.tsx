import { useCallback, useEffect, useState, type ReactElement } from "react";
import { Check, Download, FolderSearch, Minus, PackageCheck, Stethoscope } from "lucide-react";
import { estadoDeps, openExternal, pickRoot, type EstadoDeps } from "@/lib/api";
import { useJob } from "@/lib/useJob";
import { Button, Rule } from "@/components/ui/primitives";
import { Console } from "@/components/Console";
import { Topo } from "@/components/Topo";

const NODE_URL = "https://nodejs.org/en/download";

/** Sinal nunca é só cor: vem com ícone e palavra, pra ler sem depender de ver verde. */
function Sinal({ ok, children }: { ok: boolean; children: string }): ReactElement {
  return (
    <span className={`inline-flex items-center gap-1.5 ${ok ? "text-text/85" : "text-muted"}`}>
      {ok ? <Check size={12} /> : <Minus size={12} />}
      {children}
    </span>
  );
}

export function Config({
  sitesRoot,
  onRoot,
}: {
  sitesRoot: string | null;
  onRoot: (raiz: string | null) => void;
}): ReactElement {
  const job = useJob();
  const [deps, setDeps] = useState<EstadoDeps | null>(null);

  const olharDeps = useCallback(() => {
    estadoDeps().then(setDeps, () => setDeps(null));
  }, []);

  // Depois do install a resposta muda, então relê quando o job termina.
  useEffect(olharDeps, [olharDeps, sitesRoot, job.estado]);

  const escolher = async (): Promise<void> => {
    const { sitesRoot: novo } = await pickRoot();
    onRoot(novo);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <Topo>
        <span className="font-mono text-label uppercase tracking-[0.18em] text-muted">Configurações</span>
      </Topo>

      <div className="border-b border-rule px-8 pb-7">
        <Rule>Pasta dos sites</Rule>
        <div className="flex items-center gap-4">
          <code className="min-w-0 flex-1 truncate border-b border-rule bg-surface px-3 py-2 font-mono text-[12px] text-text/85">
            {sitesRoot ?? "não configurada"}
          </code>
          <Button variant="outline" size="md" onClick={() => void escolher()}>
            <FolderSearch size={13} /> Escolher…
          </Button>
        </div>
        <p className="mt-2 text-[12px] text-muted">
          Aponte para <span className="font-mono">sistema-multi-site/sites</span> — o app lê{" "}
          <span className="font-mono">categoria/slug</span> dentro dela.
        </p>

        <Rule>Dependências dos convites</Rule>
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-muted">
              Um <span className="font-mono text-text/85">node_modules</span> só, na raiz de sites, serve
              todos os convites — convite novo já abre no preview sem instalar nada.
            </p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[12px]">
              <Sinal ok={deps?.raiz != null}>pasta</Sinal>
              <Sinal ok={deps?.temManifesto === true}>manifesto</Sinal>
              <Sinal ok={deps?.temNext === true}>next</Sinal>
              <Sinal ok={deps?.npm != null}>node</Sinal>
            </div>
          </div>
          <Button
            variant="outline"
            size="md"
            disabled={job.rodando || deps?.raiz == null || deps?.npm == null}
            onClick={() => void job.rodar({ kind: "deps" })}
          >
            <PackageCheck size={13} /> {deps?.temNext === true ? "Reinstalar" : "Instalar"}
          </Button>
        </div>

        {deps != null && deps.npm == null && (
          <div className="mt-3 border-l-2 border-accent bg-surface px-4 py-3">
            <p className="text-[13px] text-text/85">
              Falta o <strong className="font-semibold">Node</strong> nesta máquina — é ele que baixa as
              dependências. Instale uma vez e nunca mais:
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[12px] text-muted">
              <li>Clique no botão abaixo: abre o site do Node.</li>
              <li>Baixe o instalador de macOS (o botão grande, versão LTS).</li>
              <li>Abra o ficheiro <span className="font-mono">.pkg</span> e vá em Continuar até ao fim.</li>
              <li>Feche o Criarte Studio, abra de novo e volte aqui.</li>
            </ol>
            <Button
              variant="outline"
              size="md"
              className="mt-3"
              onClick={() => void openExternal(NODE_URL)}
            >
              <Download size={13} /> Abrir nodejs.org
            </Button>
          </div>
        )}

        <Rule>Diagnóstico</Rule>
        <div className="flex items-center gap-4">
          <p className="flex-1 text-[13px] text-muted">
            Roda <span className="font-mono text-text/85">crd doctor</span> pra conferir dependências e credenciais.
          </p>
          <Button variant="outline" size="md" disabled={job.rodando} onClick={() => void job.rodar({ kind: "doctor" })}>
            <Stethoscope size={13} /> Rodar doctor
          </Button>
        </div>
      </div>

      <Console linhas={job.linhas} estado={job.estado} erro={job.erro} vazio="Saída do doctor e da instalação de dependências aparece aqui." />
    </div>
  );
}
