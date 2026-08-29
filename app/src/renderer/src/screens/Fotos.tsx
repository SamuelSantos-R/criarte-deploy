import { useEffect, useState, type ReactElement } from "react";
import { ImageDown, Square } from "lucide-react";
import type { Site } from "@/lib/api";
import { useJob } from "@/lib/useJob";
import { Button, Input } from "@/components/ui/primitives";
import { Console } from "@/components/Console";
import { SeletorSite } from "@/components/SeletorSite";
import { Topo } from "@/components/Topo";

export function Fotos({ sites }: { sites: Site[] }): ReactElement {
  const [id, setId] = useState<string | null>(null);
  const [max, setMax] = useState(2200);
  const [qualidade, setQualidade] = useState(82);
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
          <span className="font-mono text-label uppercase text-muted">Lado</span>
          <Input
            type="number"
            min={200}
            max={6000}
            value={String(max)}
            disabled={job.rodando}
            onChange={(e) => setMax(Number(e.target.value) || 0)}
            className="w-[84px]"
          />
        </label>
        <label className="no-drag flex items-center gap-2">
          <span className="font-mono text-label uppercase text-muted">Qual.</span>
          <Input
            type="number"
            min={1}
            max={100}
            value={String(qualidade)}
            disabled={job.rodando}
            onChange={(e) => setQualidade(Number(e.target.value) || 0)}
            className="w-[68px]"
          />
        </label>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {job.rodando ? (
            <Button variant="danger" size="sm" onClick={job.cancelar}>
              <Square size={13} /> Parar
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={!id}
              onClick={() => id && void job.rodar({ kind: "fotos", siteId: id, max, qualidade })}
            >
              <ImageDown size={13} /> Converter
            </Button>
          )}
        </div>
      </Topo>

      <Console linhas={job.linhas} estado={job.estado} erro={job.erro} vazio="Nada convertido nesta sessão." />
    </div>
  );
}
