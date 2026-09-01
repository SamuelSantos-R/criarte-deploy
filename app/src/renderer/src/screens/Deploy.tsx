import { useEffect, useState, type ReactElement } from "react";
import { Rocket, Square, Stethoscope } from "lucide-react";
import type { Site } from "@/lib/api";
import { useJob } from "@/lib/useJob";
import { Button } from "@/components/ui/primitives";
import { ConfirmarPublicacao } from "@/components/ConfirmarPublicacao";
import { Console } from "@/components/Console";
import { SeletorSite } from "@/components/SeletorSite";
import { Topo } from "@/components/Topo";

export function Deploy({ sites }: { sites: Site[] }): ReactElement {
  const [id, setId] = useState<string | null>(null);
  const [ensaio, setEnsaio] = useState(true);
  const [confirmando, setConfirmando] = useState(false);
  const job = useJob();

  // A lista chega depois do primeiro render.
  useEffect(() => {
    if (id === null && sites[0]) setId(sites[0].id);
  }, [id, sites]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <Topo>
        <SeletorSite
          sites={sites}
          valor={id}
          onChange={setId}
          disabled={job.rodando}
          className="w-[220px]"
        />
        <label className="no-drag flex items-center gap-2">
          <input
            type="checkbox"
            checked={ensaio}
            disabled={job.rodando}
            onChange={(e) => setEnsaio(e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          <span className="font-mono text-label uppercase text-muted">Ensaio</span>
        </label>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            disabled={!id || job.rodando}
            onClick={() => id && void job.rodar({ kind: "check", siteId: id })}
          >
            <Stethoscope size={13} /> Checar
          </Button>
          {job.rodando ? (
            <Button variant="danger" size="sm" onClick={job.cancelar}>
              <Square size={13} /> Parar
            </Button>
          ) : (
            <Button
              variant={ensaio ? "primary" : "danger"}
              size="sm"
              disabled={!id}
              onClick={() => {
                if (!id) return;
                // O ensaio não toca no que está no ar; a publicação passa pelo modal.
                if (ensaio) void job.rodar({ kind: "deploy", siteId: id, dryRun: true });
                else setConfirmando(true);
              }}
            >
              <Rocket size={13} /> {ensaio ? "Ensaiar" : "Publicar"}
            </Button>
          )}
        </div>
      </Topo>

      <Console
        linhas={job.linhas}
        estado={job.estado}
        erro={job.erro}
        vazio="Escolha um site e rode o ensaio primeiro."
      />

      {confirmando && id && (
        <ConfirmarPublicacao
          siteId={id}
          onCancelar={() => setConfirmando(false)}
          onPublicar={() => {
            setConfirmando(false);
            void job.rodar({ kind: "deploy", siteId: id, dryRun: false });
          }}
        />
      )}
    </div>
  );
}
