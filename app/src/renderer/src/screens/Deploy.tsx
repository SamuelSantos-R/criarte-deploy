import { useEffect, useRef, useState, type ReactElement } from "react";
import { Rocket, Square, Stethoscope } from "lucide-react";
import type { Site } from "@/lib/api";
import { useJob } from "@/lib/useJob";
import { useSiteValido } from "@/lib/useSiteValido";
import { Button } from "@/components/ui/primitives";
import { ConfirmarPublicacao } from "@/components/ConfirmarPublicacao";
import {
  OpcoesDeploy,
  OPCOES_PADRAO,
  expiresDe,
  validadeEmPalavras,
  type Opcoes,
} from "@/components/OpcoesDeploy";
import { Console } from "@/components/Console";
import { SeletorSite } from "@/components/SeletorSite";
import { Topo } from "@/components/Topo";

export function Deploy({ sites }: { sites: Site[] }): ReactElement {
  const [id, setId] = useState<string | null>(null);
  const [ensaio, setEnsaio] = useState(true);
  const [opcoes, setOpcoes] = useState<Opcoes>(OPCOES_PADRAO);
  const [confirmando, setConfirmando] = useState(false);
  const job = useJob();

  useSiteValido(sites, id, setId);

  const expires = expiresDe(opcoes);
  // Data pela metade trava o botão: melhor não publicar do que publicar com a
  // validade que o padrão escolheu sozinho.
  const pronto = id !== null && expires !== null;

  // O ensaio termina com o mesmo "concluído" de uma publicação a sério, e o
  // "--dry-run" fica dez ecrãs acima no log. Dá para sair daqui convencido de
  // que se publicou — e o site no ar continua o de ontem.
  const foiEnsaio = useRef(false);
  useEffect(() => {
    if (job.estado !== "ok" || !foiEnsaio.current) return;
    foiEnsaio.current = false;
    job.anexar([
      "",
      "──────────────────────────────────────────────",
      "  ISTO FOI UM ENSAIO — nada foi publicado.",
      "  Desmarque «Ensaio» e carregue em Publicar.",
      "──────────────────────────────────────────────",
    ]);
  }, [job.estado, job]);

  const disparar = (dryRun: boolean): void => {
    if (!id || expires === null) return;
    foiEnsaio.current = dryRun;
    void job.rodar({
      kind: "deploy",
      siteId: id,
      dryRun,
      expires,
      ...(opcoes.subdominio.trim() ? { subdomain: opcoes.subdominio.trim() } : {}),
      ...(opcoes.convidados ? { guestsFile: opcoes.convidados } : {}),
    });
  };

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
              disabled={!pronto}
              title={pronto ? undefined : "Preencha a data de validade"}
              onClick={() => {
                // O ensaio não toca no que está no ar; a publicação passa pelo modal.
                if (ensaio) disparar(true);
                else setConfirmando(true);
              }}
            >
              <Rocket size={13} /> {ensaio ? "Ensaiar" : "Publicar"}
            </Button>
          )}
        </div>
      </Topo>

      <OpcoesDeploy valor={opcoes} onChange={setOpcoes} travado={job.rodando} />

      <Console
        linhas={job.linhas}
        estado={job.estado}
        erro={job.erro}
        vazio="Escolha um site e rode o ensaio primeiro."
      />

      {confirmando && id && (
        <ConfirmarPublicacao
          siteId={id}
          validade={validadeEmPalavras(opcoes)}
          convidados={opcoes.convidados}
          onCancelar={() => setConfirmando(false)}
          onPublicar={() => {
            setConfirmando(false);
            disparar(false);
          }}
        />
      )}
    </div>
  );
}
