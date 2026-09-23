import { useEffect, useRef, useState, type ReactElement } from "react";
import { AlertTriangle, Check, Loader2, Rocket, Smartphone, Tablet, X } from "lucide-react";
import { abrirRevisao, aoRevisar, fecharRevisao, type AvisoRevisao, type Revisao } from "@/lib/api";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

// REVISÃO — o convite que foi ao ar quebrado tinha ficado certo no `next dev`:
// a página publicada é outra coisa, com basePath e ficheiros construídos. Aqui
// ela vê o site CONSTRUÍDO, servido na própria máquina, e é isso que aprova.
// Carregar em Publicar mata este servidor e segue o deploy de sempre.

const APARELHOS = [
  { largura: 375, altura: 812, rotulo: "telemóvel", Icone: Smartphone },
  { largura: 414, altura: 896, rotulo: "telemóvel grande", Icone: Smartphone },
  { largura: 768, altura: 1024, rotulo: "tablet", Icone: Tablet },
];

function Apontamento({ aviso }: { aviso: AvisoRevisao }): ReactElement {
  return (
    <li
      className={cn(
        "flex gap-2 rounded-lg px-3 py-2 text-[12px] leading-snug",
        aviso.grave ? "bg-pencil/10 text-pencil" : "bg-surface-2 text-muted",
      )}
    >
      <AlertTriangle size={13} className="mt-px shrink-0" />
      <span>{aviso.texto}</span>
    </li>
  );
}

export function RevisaoPublicacao({
  siteId,
  validade,
  convidados,
  onFechar,
  onPublicar,
}: {
  siteId: string;
  validade: string;
  convidados?: string | null;
  onFechar: () => void;
  /** Só é chamado depois de o servidor da revisão estar morto. */
  onPublicar: () => void;
}): ReactElement {
  const [revisao, setRevisao] = useState<Revisao | null>(null);
  const [linha, setLinha] = useState("a começar…");
  const [erro, setErro] = useState<string | null>(null);
  const [aparelho, setAparelho] = useState(0);
  const [publicando, setPublicando] = useState(false);
  const [viuOFim, setViuOFim] = useState(false);
  const quadro = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const parar = aoRevisar(setLinha);
    let vivo = true;
    void abrirRevisao(siteId)
      .then((r) => vivo && setRevisao(r))
      .catch((e: Error) => vivo && setErro(e.message));
    return () => {
      vivo = false;
      parar();
      // Sair da revisão por qualquer caminho tem de matar o servidor: dois
      // builds a servir na mesma máquina é como o preview errado nasce.
      void fecharRevisao().catch(() => undefined);
    };
  }, [siteId]);

  const graves = revisao?.avisos.filter((a) => a.grave) ?? [];
  const leves = revisao?.avisos.filter((a) => !a.grave) ?? [];
  const { largura, altura } = APARELHOS[aparelho];

  const publicar = async (): Promise<void> => {
    setPublicando(true);
    // Primeiro mata o servidor, só depois publica — senão fica um `out/` velho
    // a servir enquanto o deploy constrói outro.
    await fecharRevisao().catch(() => undefined);
    onPublicar();
  };

  return (
    <div className="no-drag fixed inset-0 z-50 flex items-center justify-center bg-ground/85 p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Revisão antes de publicar"
        className="flex h-full w-full max-w-[1100px] overflow-hidden rounded-2xl border border-rule bg-surface shadow-flutua"
      >
        {/* O site construído, do tamanho de um telemóvel de verdade. */}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 border-r border-rule bg-surface-2/40 p-5">
          {revisao ? (
            <>
              <div className="flex items-center gap-1 rounded-full border border-rule bg-surface px-1 py-0.5">
                {APARELHOS.map((a, i) => (
                  <button
                    key={a.largura}
                    onClick={() => setAparelho(i)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] transition-colors",
                      i === aparelho ? "bg-surface-2 text-text" : "text-muted hover:text-text",
                    )}
                  >
                    <a.Icone size={12} /> {a.largura}
                  </button>
                ))}
              </div>
              <iframe
                ref={quadro}
                src={revisao.url}
                title="Site construído"
                onLoad={() => setViuOFim(false)}
                className="rounded-[18px] border border-rule bg-white shadow-flutua"
                style={{ width: largura, height: Math.min(altura, 640), maxWidth: "100%" }}
              />
              <p className="font-mono text-[11px] text-muted">
                isto é o site construído, igual ao que vai para o ar — não o preview
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 text-muted">
              {erro ? (
                <>
                  <AlertTriangle size={20} className="text-pencil" />
                  <p className="max-w-[320px] text-center text-[12px] text-pencil">{erro}</p>
                </>
              ) : (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  <p className="max-w-[320px] truncate text-center font-mono text-[11px]">{linha}</p>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex w-[330px] shrink-0 flex-col">
          <div className="flex items-center gap-2 border-b border-rule px-5 py-4">
            <h2 className="font-narrow font-semibold text-label text-text">Revisão</h2>
            <span className="truncate font-mono text-[11px] text-muted">{siteId}</span>
            <button onClick={onFechar} aria-label="Fechar" className="ml-auto p-1 text-muted hover:text-text">
              <X size={14} />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {revisao === null ? (
              <p className="text-[12px] text-muted">
                A construir o site como a VPS o constrói. Demora o mesmo que um deploy — é o mesmo
                trabalho, só que aqui dá para desistir.
              </p>
            ) : revisao.avisos.length === 0 ? (
              <p className="flex items-center gap-2 rounded-lg bg-cyan/10 px-3 py-2 text-[12px] text-text">
                <Check size={14} /> Nada a apontar. Veja com os olhos e publique.
              </p>
            ) : (
              <>
                {graves.length > 0 && (
                  <div>
                    <p className="mb-1.5 font-narrow text-label font-semibold text-pencil">
                      {graves.length} coisa(s) que eu não deixo passar
                    </p>
                    <ul className="space-y-1.5">
                      {graves.map((a, i) => (
                        <Apontamento key={i} aviso={a} />
                      ))}
                    </ul>
                  </div>
                )}
                {leves.length > 0 && (
                  <div>
                    <p className="mb-1.5 font-narrow text-label font-semibold text-muted">
                      {leves.length} coisa(s) para você olhar
                    </p>
                    <ul className="space-y-1.5">
                      {leves.map((a, i) => (
                        <Apontamento key={i} aviso={a} />
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            {revisao && (
              <div className="rounded-lg border border-rule px-3 py-2 text-[11px] leading-relaxed text-muted">
                vai para <span className="font-mono text-text">{siteId}</span> · validade{" "}
                <span className="text-text">{validade}</span>
                {convidados ? (
                  <>
                    {" "}· lista de convidados{" "}
                    <span className="font-mono text-text">{convidados.split("/").pop()}</span>
                  </>
                ) : null}
              </div>
            )}

            {revisao && (
              <label className="flex cursor-pointer items-start gap-2 border-t border-rule pt-4 text-[12px] text-muted">
                <input
                  type="checkbox"
                  checked={viuOFim}
                  onChange={(e) => setViuOFim(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Rolei o convite até ao fim, nos três tamanhos, e está como eu quero.
                </span>
              </label>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-rule px-5 py-4">
            <Button variant="ghost" onClick={onFechar} disabled={publicando}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              className="ml-auto"
              disabled={!revisao || graves.length > 0 || !viuOFim || publicando}
              onClick={() => void publicar()}
            >
              <Rocket size={13} /> {publicando ? "A publicar…" : "Publicar"}
            </Button>
          </div>
          {graves.length > 0 && (
            <p className="px-5 pb-4 text-[11px] leading-snug text-pencil">
              Conserte o que está em vermelho e abra a revisão de novo. Isto é o que faltava no dia
              em que o convite foi ao ar com a flor por cima do contador.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
