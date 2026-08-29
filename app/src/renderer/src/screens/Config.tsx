import { type ReactElement } from "react";
import { FolderSearch, Stethoscope } from "lucide-react";
import { pickRoot } from "@/lib/api";
import { useJob } from "@/lib/useJob";
import { Button, Rule } from "@/components/ui/primitives";
import { Console } from "@/components/Console";
import { Topo } from "@/components/Topo";

export function Config({
  sitesRoot,
  onRoot,
}: {
  sitesRoot: string | null;
  onRoot: (raiz: string | null) => void;
}): ReactElement {
  const job = useJob();

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

      <Console linhas={job.linhas} estado={job.estado} erro={job.erro} vazio="Rode o doctor para ver o diagnóstico." />
    </div>
  );
}
