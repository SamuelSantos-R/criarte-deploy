import { useEffect, useState, type ReactElement } from "react";
import QRCode from "qrcode";
import { X } from "lucide-react";
import { Button } from "@/components/ui/primitives";

/**
 * O QR é pra apontar a câmera, não pra conviver com o editor: vem no meio da
 * tela, grande, e sai com Esc. Encostado na lateral do preview ele saía pequeno
 * e ainda roubava a largura de quem estava a ver o convite.
 */
export function ModalQR({
  lan,
  url,
  onFechar,
}: {
  lan: string | null;
  url: string | null;
  onFechar: () => void;
}): ReactElement {
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!lan) return setQr(null);
    let vivo = true;
    QRCode.toDataURL(lan, { margin: 1, width: 640, color: { dark: "#232719", light: "#fdfaf4" } })
      .then((d) => vivo && setQr(d))
      .catch(() => vivo && setQr(null));
    return () => {
      vivo = false;
    };
  }, [lan]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onFechar();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onFechar]);

  return (
    <div
      className="no-drag fixed inset-0 z-50 flex items-center justify-center bg-ground/85 p-8"
      onMouseDown={(e) => e.target === e.currentTarget && onFechar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-titulo"
        className="w-[380px] border-l-2 border-accent bg-surface shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)]"
      >
        <div className="flex items-center gap-3 border-b border-rule px-6 py-4">
          <h2 id="qr-titulo" className="font-mono text-label uppercase tracking-[0.18em] text-text">
            Ver no telefone
          </h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="ml-auto flex h-[28px] w-[28px] items-center justify-center text-muted transition-colors hover:text-text focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-sage"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-6 py-6">
          {qr && lan ? (
            <>
              <img
                src={qr}
                alt={`QR code para abrir ${lan} no telefone`}
                className="block w-full border border-rule"
              />
              <p className="mt-4 break-all font-mono text-[12px] text-text/85">{lan}</p>
              <p className="mt-2 text-[12px] leading-[1.5] text-muted">
                Telefone e Mac no mesmo Wi-Fi. Aponte a câmera.
              </p>
            </>
          ) : (
            <p className="text-[12px] leading-[1.5] text-muted">
              {url
                ? "Sem IP de rede — o Mac não está numa Wi-Fi alcançável pelo telefone."
                : "O QR aparece quando o preview subir."}
            </p>
          )}

          {url && (
            <>
              <span className="mt-7 block font-mono text-label uppercase text-muted">Neste Mac</span>
              <p className="mt-2 break-all font-mono text-[11px] text-text/85">{url}</p>
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-rule px-6 py-3">
          <Button variant="ghost" onClick={onFechar}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
