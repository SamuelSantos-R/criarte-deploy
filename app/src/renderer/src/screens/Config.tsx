import { useCallback, useEffect, useState, type ReactElement } from "react";
import { Check, Download, FolderSearch, KeyRound, Minus, PackageCheck, Stethoscope, Upload } from "lucide-react";
import {
  credEstado,
  credExportar,
  credImportar,
  estadoDeps,
  openExternal,
  pickRoot,
  type EstadoCredenciais,
  type EstadoDeps,
} from "@/lib/api";
import { useJob } from "@/lib/useJob";
import { Button, Rule } from "@/components/ui/primitives";
import { Console } from "@/components/Console";
import { AtualizacaoStudio } from "@/components/AtualizacaoStudio";
import { Topo } from "@/components/Topo";

const NODE_URL = "https://nodejs.org/en/download";

/** Sinal nunca é só cor: vem com ícone e palavra, pra ler sem depender de ver verde. */
function Sinal({ ok, children }: { ok: boolean; children: string }): ReactElement {
  return (
    <span className={`inline-flex items-center gap-1.5 ${ok ? "text-text" : "text-muted"}`}>
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
  const [cred, setCred] = useState<EstadoCredenciais | null>(null);
  const [credAviso, setCredAviso] = useState<string | null>(null);

  useEffect(() => {
    credEstado().then(setCred, () => setCred(null));
  }, []);

  const olharDeps = useCallback(() => {
    estadoDeps().then(setDeps, () => setDeps(null));
  }, []);

  // Depois do install a resposta muda, então relê quando o job termina.
  useEffect(olharDeps, [olharDeps, sitesRoot, job.estado]);

  const escolher = async (): Promise<void> => {
    const { sitesRoot: novo } = await pickRoot();
    onRoot(novo);
  };

  const importar = async (): Promise<void> => {
    try {
      const novo = await credImportar();
      if (!novo) return; // cancelou o diálogo
      setCred(novo);
      setCredAviso(
        novo.podePublicar && novo.podeRegistar
          ? "Credenciais guardadas. Esta máquina já regista o mural e publica."
          : `Credenciais guardadas, mas incompletas: falta ${[
              !novo.podeRegistar && "o mural de recados",
              !novo.podePublicar && "a publicação",
            ]
              .filter(Boolean)
              .join(" e ")}.`,
      );
    } catch (e) {
      setCredAviso(`Não deu pra importar: ${(e as Error).message}`);
    }
  };

  const exportar = async (): Promise<void> => {
    try {
      const destino = await credExportar();
      if (destino) setCredAviso(`Guardado em ${destino}. Trata-o como uma senha: são as chaves todas.`);
    } catch (e) {
      setCredAviso(`Não deu pra exportar: ${(e as Error).message}`);
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <Topo>
        <span className="font-narrow font-semibold text-label text-muted">Configurações</span>
      </Topo>

      <div className="border-b border-rule px-8 pb-7">
        <AtualizacaoStudio />

        <Rule>Pasta dos sites</Rule>
        <div className="flex items-center gap-4">
          <code className="min-w-0 flex-1 truncate border-b border-rule bg-surface px-3 py-2 font-mono text-[12px] text-text">
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
              Um <span className="font-mono text-text">node_modules</span> só, na raiz de sites, serve
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
          <div className="mt-3 rounded-xl bg-surface px-4 py-3">
            <p className="text-[13px] text-text">
              Falta o <strong className="font-semibold">Node</strong> nesta máquina — é ele que baixa as
              dependências. Instale uma vez e nunca mais:
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[12px] text-muted">
              <li>Clique no botão abaixo: abre o site do Node.</li>
              <li>Baixe o instalador da sua máquina (o botão grande, versão LTS).</li>
              <li>Abra o ficheiro transferido e vá em Continuar até ao fim.</li>
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

        <Rule>Credenciais da equipa</Rule>
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-muted">
              São elas que deixam registar o mural de recados e publicar. Quem já tem exporta o
              ficheiro e envia; quem entra na equipa importa-o aqui — nada de digitar chave nenhuma.
            </p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[12px]">
              <Sinal ok={cred?.temFicheiro === true}>ficheiro</Sinal>
              <Sinal ok={cred?.podeRegistar === true}>mural</Sinal>
              <Sinal ok={cred?.podePublicar === true}>publicar</Sinal>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <Button variant="outline" size="md" onClick={() => void importar()}>
              <KeyRound size={13} /> Importar…
            </Button>
            <Button
              variant="outline"
              size="md"
              disabled={cred?.temFicheiro !== true}
              onClick={() => void exportar()}
            >
              <Upload size={13} /> Exportar…
            </Button>
          </div>
        </div>
        {credAviso && <p className="mt-3 rounded-lg bg-cyan/10 px-3 py-2 text-[13px] text-text">{credAviso}</p>}

        <Rule>Diagnóstico</Rule>
        <div className="flex items-center gap-4">
          <p className="flex-1 text-[13px] text-muted">
            Roda <span className="font-mono text-text">crd doctor</span> pra conferir dependências e credenciais.
          </p>
          <Button variant="outline" size="md" disabled={job.rodando} onClick={() => void job.rodar({ kind: "doctor" })}>
            <Stethoscope size={13} /> Rodar doctor
          </Button>
        </div>
      </div>

      <p className="border-t border-rule px-8 py-2 text-[11px] text-muted">
        Algumas animações vêm de componentes free do{" "}
        <button type="button" className="underline hover:text-text" onClick={() => void openExternal("https://skiper-ui.com")}>
          Skiper UI
        </button>
        .
      </p>

      <Console linhas={job.linhas} estado={job.estado} erro={job.erro} vazio="Saída do doctor e da instalação de dependências aparece aqui." />
    </div>
  );
}
