import { useEffect, useRef, useState, type ReactElement } from "react";
import { ImageDown, Square } from "lucide-react";
import { trocarPorWebp, type RelatorioWebp, type Site } from "@/lib/api";
import { useJob } from "@/lib/useJob";
import { Button, Input } from "@/components/ui/primitives";
import { Console } from "@/components/Console";
import { SeletorSite } from "@/components/SeletorSite";
import { Topo } from "@/components/Topo";

const kb = (n: number): string =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;

function relatar(r: RelatorioWebp): string[] {
  if (r.trocas.length === 0) {
    return r.semPar.length > 0
      ? [`Nada a trocar — ${r.semPar.length} originais ainda sem .webp ao lado.`]
      : ["Nada a trocar — nenhum original com .webp ao lado."];
  }
  const antes = r.trocas.reduce((s, t) => s + t.bytes, 0);
  const depois = r.trocas.reduce((s, t) => s + t.bytesWebp, 0);
  return [
    ...r.trocas.map(
      (t) => `  ${t.nome} → ${t.webp}   ${kb(t.bytes)} → ${kb(t.bytesWebp)}   ${t.refs} ref(s)`,
    ),
    "",
    `${r.parqueadas} originais parqueados em .originais/ — fora de public/, não vão no deploy.`,
    `${r.arquivos.length} arquivo(s) reescrito(s): ${r.arquivos.join(", ") || "nenhum"}`,
    `O deploy vai ${kb(antes - depois)} mais leve.`,
  ];
}

export function Fotos({ sites }: { sites: Site[] }): ReactElement {
  const [id, setId] = useState<string | null>(null);
  const [max, setMax] = useState(2200);
  const [qualidade, setQualidade] = useState(82);
  const job = useJob();
  // A troca roda uma vez por conversão. Sem a marca, cada re-render depois do
  // "ok" dispararia de novo.
  const trocou = useRef(false);

  // A lista chega depois do primeiro render.
  useEffect(() => {
    if (id === null && sites[0]) setId(sites[0].id);
  }, [id, sites]);

  // Converter e não trocar deixava o site servindo o pesado: o `.webp` nascia
  // ao lado e ninguém apontava pra ele.
  const { estado, anexar } = job;
  useEffect(() => {
    if (estado !== "ok" || !id || trocou.current) return;
    trocou.current = true;
    anexar(["", "Trocando as referências pelos .webp…"]);
    trocarPorWebp(id)
      .then((r) => anexar(relatar(r)))
      .catch((e: Error) => anexar([`falhou ao trocar: ${e.message}`], "err"));
  }, [estado, id, anexar]);

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
              onClick={() => {
                if (!id) return;
                trocou.current = false;
                void job.rodar({ kind: "fotos", siteId: id, max, qualidade });
              }}
            >
              <ImageDown size={13} /> Converter e trocar
            </Button>
          )}
        </div>
      </Topo>

      <Console
        linhas={job.linhas}
        estado={job.estado}
        erro={job.erro}
        vazio="Converte pra .webp e reaponta o site pros novos arquivos."
      />
    </div>
  );
}
