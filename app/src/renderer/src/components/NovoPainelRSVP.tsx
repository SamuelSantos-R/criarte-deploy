import { useEffect, useRef, useState, type ReactElement } from "react";
import { CornerDownLeft } from "lucide-react";
import { criarPainel } from "@/lib/api";
import { Button, Field, Input } from "@/components/ui/primitives";

/** Acento vira letra sem acento, o resto que não é [a-z0-9] vira hífen. */
function emSlug(bruto: string): string {
  return bruto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 60);
}

/**
 * O painel RSVP nasce do molde que viaja dentro do app, não da cópia de outro
 * painel: numa máquina onde ainda não existe nenhum, duplicar não era opção.
 */
export function NovoPainelRSVP({
  onFechar,
  onPronto,
}: {
  onFechar: () => void;
  onPronto: (id: string) => void;
}): ReactElement {
  const [slug, setSlug] = useState("");
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => campo.current?.focus(), []);

  const valido = /^[a-z0-9][a-z0-9-]*$/.test(slug);

  const criar = async (): Promise<void> => {
    if (!valido || criando) return;
    setCriando(true);
    setErro(null);
    try {
      const { id } = await criarPainel(slug);
      onPronto(id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setCriando(false);
    }
  };

  return (
    <div
      className="no-drag fixed inset-0 z-50 flex items-start justify-center bg-ground/80 pt-[18vh]"
      onMouseDown={(e) => e.target === e.currentTarget && !criando && onFechar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="painel-titulo"
        className="w-[440px] rounded-2xl border border-rule bg-surface shadow-flutua"
      >
        <div className="border-b border-rule px-6 py-4">
          <h2 id="painel-titulo" className="font-narrow font-semibold text-label text-text">
            Novo painel RSVP
          </h2>
          <p className="mt-1.5 text-[12px] leading-normal text-muted">
            A página de confirmação de presença, com a prancheta das molduras e o Google Forms. Vai
            nascer em <span className="font-mono text-text">rsvp/</span>, ao lado dos convites.
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          <Field label="Nome do par" hint="Minúsculas e hífen. Vira a pasta e o nome na página.">
            <Input
              ref={campo}
              value={slug}
              onChange={(e) => setSlug(emSlug(e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && void criar()}
              placeholder="leodalena-mauro"
              spellCheck={false}
            />
          </Field>

          <p className="border-l border-rule pl-3 text-[11px] leading-[1.6] text-muted">
            O endereço do Google Forms começa vazio: sem ele o botão de confirmar não tem onde
            gravar. Preenche na secção <span className="font-mono">google form</span> antes de
            publicar.
          </p>

          {erro && <p className="rounded-lg bg-pencil/10 px-3 py-2 text-[12px] text-pencil">{erro}</p>}
        </div>

        <div className="flex items-center gap-3 border-t border-rule px-6 py-4">
          <span className="truncate font-mono text-[11px] text-muted">
            {valido ? `rsvp/${slug}` : "—"}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button variant="ghost" disabled={criando} onClick={onFechar}>
              Cancelar
            </Button>
            <Button variant="primary" disabled={!valido || criando} onClick={() => void criar()}>
              <CornerDownLeft size={13} /> {criando ? "Criando…" : "Criar painel"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
