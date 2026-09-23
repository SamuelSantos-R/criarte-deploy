import { useEffect, useRef, useState, type ReactElement } from "react";
import { FileImage, FolderOpen, Loader2, Play, Square } from "lucide-react";
import {
  animarEnvelope,
  aoAnimar,
  cancelarEnvelope,
  escolherConvite,
  mostrarVideo,
  type PassoAnimacao,
} from "@/lib/api";
import { Button } from "@/components/ui/primitives";
import { Topo } from "@/components/Topo";
import { cn } from "@/lib/utils";

// ANIMAR ENVELOPE — o convite fechado, com o lacre, vira um vídeo de abertura:
// o papel desdobra-se e a arte aparece. É o vídeo que vai no Envelopador 3000.

const VELOCIDADES = [
  { segundos: 4, rotulo: "rápido" },
  { segundos: 6, rotulo: "normal" },
  { segundos: 9, rotulo: "lento" },
];

function tempo(s: number): string {
  return s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, "0")}`;
}

export function EnvelopeAnimado(): ReactElement {
  const [convite, setConvite] = useState<string | null>(null);
  const [segundos, setSegundos] = useState(6);
  const [passo, setPasso] = useState<PassoAnimacao | null>(null);
  const [feito, setFeito] = useState<{ ficheiro: string; nome: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const trabalhando = passo !== null && !feito;
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => aoAnimar(setPasso), []);

  const animar = async (): Promise<void> => {
    if (!convite) return;
    setErro(null);
    setFeito(null);
    setPasso({ fase: "prepare", fracao: 0, segundos: 0 });
    try {
      setFeito(await animarEnvelope(convite, segundos));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setPasso(null);
    }
  };

  const pct = Math.round((passo?.fracao ?? 0) * 100);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <Topo>
        <span className="font-narrow text-label font-semibold text-muted">Animar envelope</span>
        <span className="ml-2 text-[11px] text-muted">
          O convite fechado vira vídeo de abertura — é o que entra no Envelopador.
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {trabalhando ? (
            <Button variant="danger" size="sm" onClick={() => void cancelarEnvelope()}>
              <Square size={13} /> Parar
            </Button>
          ) : (
            <Button variant="primary" size="sm" disabled={!convite} onClick={() => void animar()}>
              <Play size={13} /> Animar
            </Button>
          )}
        </div>
      </Topo>

      <div className="flex min-h-0 flex-1 gap-4 p-5">
        <div className="flex w-[330px] shrink-0 flex-col gap-4">
          <div>
            <span className="mb-1.5 block font-narrow text-label font-semibold text-muted">convite com o lacre</span>
            <button
              onClick={() => void escolherConvite().then((f) => f && (setConvite(f), setFeito(null)))}
              disabled={trabalhando}
              className="no-drag flex w-full items-center gap-2 rounded-xl border border-dashed border-rule bg-surface px-3 py-3 text-left transition-colors hover:border-focus disabled:opacity-50"
            >
              <FileImage size={15} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-text">
                {convite ? convite.split("/").pop() : "escolher a imagem…"}
              </span>
            </button>
            <p className="mt-1.5 text-[11px] leading-snug text-muted">
              A imagem inteira do convite, com o lacre de cera. O motor acha o lacre sozinho; sem
              ele, recusa e diz.
            </p>
          </div>

          <div>
            <span className="mb-1.5 block font-narrow text-label font-semibold text-muted">
              tempo da abertura
            </span>
            <div className="flex items-center gap-1 rounded-full border border-rule bg-surface p-0.5">
              {VELOCIDADES.map((v) => (
                <button
                  key={v.segundos}
                  disabled={trabalhando}
                  onClick={() => setSegundos(v.segundos)}
                  className={cn(
                    "flex-1 rounded-full px-2 py-1 font-mono text-[11px] transition-colors",
                    v.segundos === segundos ? "bg-surface-2 text-text" : "text-muted hover:text-text",
                  )}
                >
                  {v.rotulo} · {v.segundos}s
                </button>
              ))}
            </div>
          </div>

          {trabalhando && (
            <div className="rounded-xl border border-rule p-3">
              <div className="flex items-center gap-2 text-[12px] text-text">
                <Loader2 size={13} className="animate-spin" />
                {passo?.quadro ? `quadro ${passo.quadro} de ${passo.total}` : "a preparar o convite…"}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full bg-cyan transition-[width]" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1.5 font-mono text-[11px] text-muted">
                {pct}% · {tempo(passo?.segundos ?? 0)}
              </p>
            </div>
          )}

          {erro && <p className="rounded-lg bg-pencil/10 px-3 py-2 text-[12px] text-pencil">{erro}</p>}

          {feito && (
            <div className="rounded-xl border border-rule p-3">
              <p className="font-mono text-[11px] text-muted">pronto</p>
              <p className="mt-0.5 break-all font-mono text-[12px] text-text">{feito.nome}</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => void mostrarVideo(feito.ficheiro)}
              >
                <FolderOpen size={13} /> Mostrar na pasta
              </Button>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-center rounded-2xl border border-rule bg-surface-2/40">
          {feito ? (
            <video
              ref={video}
              src={`file://${feito.ficheiro}`}
              controls
              autoPlay
              loop
              className="max-h-full max-w-full rounded-xl"
            />
          ) : (
            <p className="max-w-[280px] text-center text-[12px] leading-relaxed text-muted">
              {convite
                ? "Escolha o tempo e carregue em Animar. O vídeo aparece aqui quando ficar pronto."
                : "Escolha o convite com o lacre para começar."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
