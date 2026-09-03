import { useState, type ReactElement } from "react";
import { useSiteValido } from "@/lib/useSiteValido";
import { QrCode, RefreshCw, RotateCw, Square } from "lucide-react";
import { type Site, previewRepintar} from "@/lib/api";
import { derrubarServidor, subirServidor, usarServidor } from "@/lib/servidor";
import { cn } from "@/lib/utils";
import { ModalQR } from "@/components/ModalQR";
import { APARELHOS, Palco, type Aparelho } from "@/components/Palco";
import { Button } from "@/components/ui/primitives";
import { SeletorAparelho } from "@/components/SeletorAparelho";
import { SeletorSite } from "@/components/SeletorSite";
import { Topo } from "@/components/Topo";

export function Preview({
  sites,
  id,
  setId,
}: {
  sites: Site[];
  id: string | null;
  setId: (novo: string | null) => void;
}): ReactElement {
  // Abre no desktop: o convite nasce largo e o telefone é a conferência
  // depois. Abrir num iPhone deixava o site como uma tira creme no meio do nada.
  const [aparelho, setAparelho] = useState<Aparelho>(APARELHOS[APARELHOS.length - 1]);
  const [qrAberto, setQrAberto] = useState(false);
  const [deitado, setDeitado] = useState(false);
  const rodando = usarServidor();
  // A outra tela pode ter tomado o dev server pra outro site: aí este painel
  // volta a mostrar o botão de subir em vez de um iframe apontando pro vazio.
  const servidor = rodando?.siteId === id ? rodando : null;
  const [subindo, setSubindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useSiteValido(sites, id, setId);

  const largura = deitado ? aparelho.a : aparelho.l;
  const altura = deitado ? aparelho.l : aparelho.a;

  const subir = async (): Promise<void> => {
    if (!id) return;
    setSubindo(true);
    setErro(null);
    try {
      await subirServidor(id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSubindo(false);
    }
  };

  const derrubar = async (): Promise<void> => {
    await derrubarServidor();
    setQrAberto(false);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <Topo>
        <SeletorSite
          sites={sites}
          valor={id}
          // Sem derrubar nada: quem não é o site do servidor já cai no estado vazio.
          onChange={setId}
          disabled={subindo}
          className="w-[200px]"
        />
        <SeletorAparelho valor={aparelho} onChange={setAparelho} className="w-[210px]" />
        <span className="font-mono text-serial uppercase tracking-[0.16em] text-muted">
          {largura}×{altura}
        </span>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            disabled={!servidor}
            onClick={() => setDeitado((d) => !d)}
            aria-label="Girar"
            title="Girar"
          >
            <RotateCw size={13} />
          </Button>
          <Button variant="ghost" disabled={!servidor} onClick={() => void previewRepintar()}>
            <RefreshCw size={13} /> Recarregar
          </Button>
          <Button
            variant="ghost"
            disabled={!servidor}
            aria-pressed={qrAberto}
            onClick={() => setQrAberto((a) => !a)}
            className={cn(qrAberto && "bg-surface-2 text-text")}
          >
            <QrCode size={13} /> Telefone
          </Button>
          {servidor ? (
            <Button variant="danger" size="sm" onClick={() => void derrubar()}>
              <Square size={13} /> Parar
            </Button>
          ) : (
            <Button variant="primary" size="sm" disabled={!id || subindo} onClick={() => void subir()}>
              {subindo ? "Subindo…" : "Subir preview"}
            </Button>
          )}
        </div>
      </Topo>

      <div className="flex min-h-0 min-w-0 flex-1">
        <Palco
          url={servidor?.url ?? null}
          aparelho={aparelho}
          deitado={deitado}
          className="relative min-w-0 flex-1 overflow-hidden bg-surface-2/40"
        >
          <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
            {subindo ? (
              <p className="font-mono text-[12px] text-muted">
                Subindo o Next do site… a primeira vez demora.
              </p>
            ) : (
              <>
                <p className="text-[13px] text-muted">Escolha o site e suba o preview.</p>
                <p className="font-mono text-[11px] text-muted/70">
                  Roda o `next dev` da pasta do site — nada vai pro servidor.
                </p>
              </>
            )}
            {erro && (
              <pre className="mt-3 max-w-[560px] whitespace-pre-wrap border-l-2 border-bad pl-3 text-left font-mono text-[11px] text-bad">
                {erro}
              </pre>
            )}
          </div>
        </Palco>

      </div>

      {qrAberto && (
        <ModalQR
          lan={servidor?.lan ?? null}
          url={servidor?.url ?? null}
          onFechar={() => setQrAberto(false)}
        />
      )}
    </div>
  );
}
