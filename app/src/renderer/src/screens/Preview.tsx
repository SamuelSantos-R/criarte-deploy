import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import QRCode from "qrcode";
import { Monitor, RefreshCw, RotateCw, Smartphone, Square, Tablet } from "lucide-react";
import {
  previewHide,
  previewMount,
  previewReload,
  previewStart,
  previewStop,
  type Site,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/primitives";
import { SeletorSite } from "@/components/SeletorSite";
import { Topo } from "@/components/Topo";

type Aparelho = { id: string; nome: string; l: number; a: number; dpr: number; movel: boolean };

// Pontos reais em CSS px — os mesmos que o Safari usa. Não é caixa estreita:
// o dpr e o toque vão junto, senão `pointer: coarse` mente no preview.
const APARELHOS: Aparelho[] = [
  { id: "se", nome: "iPhone SE", l: 375, a: 667, dpr: 2, movel: true },
  { id: "13", nome: "iPhone 13 / 14", l: 390, a: 844, dpr: 3, movel: true },
  { id: "15p", nome: "iPhone 15 Pro", l: 393, a: 852, dpr: 3, movel: true },
  { id: "15pm", nome: "iPhone 15 Pro Max", l: 430, a: 932, dpr: 3, movel: true },
  { id: "mini", nome: "iPad mini", l: 744, a: 1133, dpr: 2, movel: true },
  { id: "air", nome: "iPad Air", l: 820, a: 1180, dpr: 2, movel: true },
  { id: "pro", nome: 'iPad Pro 12.9"', l: 1024, a: 1366, dpr: 2, movel: true },
  { id: "desktop", nome: "Desktop", l: 1440, a: 900, dpr: 1, movel: false },
];

function iconeDe(a: Aparelho): typeof Smartphone {
  if (!a.movel) return Monitor;
  return a.l >= 700 ? Tablet : Smartphone;
}

export function Preview({ sites }: { sites: Site[] }): ReactElement {
  const [id, setId] = useState<string | null>(null);
  const [aparelho, setAparelho] = useState<Aparelho>(APARELHOS[2]);
  const [deitado, setDeitado] = useState(false);
  const [servidor, setServidor] = useState<{ url: string; lan: string | null } | null>(null);
  const [subindo, setSubindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const palco = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id === null && sites[0]) setId(sites[0].id);
  }, [id, sites]);

  const largura = deitado ? aparelho.a : aparelho.l;
  const altura = deitado ? aparelho.l : aparelho.a;

  // A vista vive no processo principal, sobreposta ao palco — ela não sabe
  // rolar junto com o React, então reposicionamos a cada mudança de tamanho.
  const posicionar = useCallback(() => {
    const el = palco.current;
    if (!el || !servidor) return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    previewMount(
      { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
      { largura, altura, dpr: aparelho.dpr, movel: aparelho.movel },
    )
      .then(({ zoom: z }) => setZoom(z))
      .catch((e: Error) => setErro(e.message));
  }, [servidor, largura, altura, aparelho.dpr, aparelho.movel]);

  useEffect(() => {
    posicionar();
    const obs = new ResizeObserver(posicionar);
    if (palco.current) obs.observe(palco.current);
    window.addEventListener("resize", posicionar);
    return () => {
      obs.disconnect();
      window.removeEventListener("resize", posicionar);
    };
  }, [posicionar]);

  // Sair da tela tem que tirar a vista da frente — ela flutua sobre tudo.
  useEffect(() => () => void previewHide().catch(() => {}), []);

  useEffect(() => {
    const alvo = servidor?.lan;
    if (!alvo) return setQr(null);
    QRCode.toDataURL(alvo, { margin: 1, width: 220, color: { dark: "#1a1e16", light: "#f5ede0" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [servidor]);

  const subir = async (): Promise<void> => {
    if (!id) return;
    setSubindo(true);
    setErro(null);
    try {
      const s = await previewStart(id);
      setServidor({ url: s.url, lan: s.lan });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSubindo(false);
    }
  };

  const derrubar = async (): Promise<void> => {
    await previewStop().catch(() => {});
    setServidor(null);
    setQr(null);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <Topo>
        <SeletorSite
          sites={sites}
          valor={id}
          onChange={(novo) => {
            void derrubar();
            setId(novo);
          }}
          disabled={subindo}
          className="w-[200px]"
        />
        <div className="no-drag flex items-center gap-1">
          {APARELHOS.map((a) => {
            const Icone = iconeDe(a);
            const ativo = a.id === aparelho.id;
            return (
              <button
                key={a.id}
                onClick={() => setAparelho(a)}
                title={`${a.nome} · ${a.l}×${a.a}`}
                aria-label={a.nome}
                aria-pressed={ativo}
                className={cn(
                  "relative flex h-[30px] w-[30px] items-center justify-center transition-colors",
                  ativo ? "text-text" : "text-muted hover:text-text",
                )}
              >
                <span
                  className={cn(
                    "absolute bottom-0 h-[2px] w-4",
                    ativo ? "bg-sage" : "bg-transparent",
                  )}
                />
                <Icone size={15} strokeWidth={1.6} />
              </button>
            );
          })}
        </div>
        <span className="font-mono text-serial uppercase tracking-[0.16em] text-muted">
          {largura}×{altura} · {Math.round(zoom * 100)}%
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
          <Button variant="ghost" disabled={!servidor} onClick={() => void previewReload()}>
            <RefreshCw size={13} /> Recarregar
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
        {/* O palco é só um buraco medido: quem desenha o site é a vista do main. */}
        <div ref={palco} className="min-w-0 flex-1 bg-surface-2/40 p-6">
          {!servidor && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
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
          )}
        </div>

        <aside className="w-[248px] shrink-0 overflow-y-auto border-l border-rule px-5 py-6">
          <span className="font-mono text-label uppercase text-muted">Ver no telefone</span>
          {qr && servidor?.lan ? (
            <>
              <img
                src={qr}
                alt={`QR code para abrir ${servidor.lan} no telefone`}
                className="mt-3 block w-full border border-rule"
              />
              <p className="mt-3 break-all font-mono text-[11px] text-text/85">{servidor.lan}</p>
              <p className="mt-2 text-[12px] leading-[1.5] text-muted">
                Telefone e Mac no mesmo Wi-Fi. Aponte a câmera.
              </p>
            </>
          ) : (
            <p className="mt-3 text-[12px] leading-[1.5] text-muted">
              {servidor
                ? "Sem IP de rede — o Mac não está numa Wi-Fi alcançável pelo telefone."
                : "O QR aparece quando o preview subir."}
            </p>
          )}

          {servidor && (
            <>
              <span className="mt-8 block font-mono text-label uppercase text-muted">Neste Mac</span>
              <p className="mt-2 break-all font-mono text-[11px] text-text/85">{servidor.url}</p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
