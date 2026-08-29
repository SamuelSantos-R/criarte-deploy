import { useEffect, useRef, useState, type ReactElement } from "react";
import { CornerDownLeft } from "lucide-react";
import { duplicarSite, type Copia } from "@/lib/api";
import { Button, Field, Input } from "@/components/ui/primitives";

/** Acento vira letra sem acento, o resto que não é [a-z0-9] vira hífen. */
function emSlug(bruto: string): string {
  return bruto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 60);
}

export function SalvarComoNovo({
  origemId,
  categoriaPadrao,
  onFechar,
  onPronto,
}: {
  origemId: string;
  categoriaPadrao: string;
  onFechar: () => void;
  onPronto: (copia: Copia) => void;
}): ReactElement {
  const [categoria, setCategoria] = useState(categoriaPadrao);
  const [slug, setSlug] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [copiando, setCopiando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    campo.current?.focus();
  }, []);

  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !copiando) onFechar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [copiando, onFechar]);

  const valido = /^[a-z0-9][a-z0-9-]*$/.test(slug) && /^[a-z0-9][a-z0-9-]*$/.test(categoria);

  const duplicar = async (): Promise<void> => {
    if (!valido || copiando) return;
    setCopiando(true);
    setErro(null);
    try {
      onPronto(await duplicarSite(origemId, categoria, slug));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setCopiando(false);
    }
  };

  return (
    <div
      className="no-drag fixed inset-0 z-50 flex items-start justify-center bg-ground/80 pt-[18vh]"
      onMouseDown={(e) => e.target === e.currentTarget && !copiando && onFechar()}
    >
      {/* Sem raio e com uma faixa de acento na lateral: é um corte na tela, não
          mais um cartão arredondado igual aos outros. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dup-titulo"
        className="w-[440px] border-l-2 border-accent bg-surface shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)]"
      >
        <div className="border-b border-rule px-6 py-4">
          <h2 id="dup-titulo" className="font-mono text-label uppercase tracking-[0.18em] text-text">
            Salvar como novo
          </h2>
          <p className="mt-1.5 text-[12px] leading-[1.5] text-muted">
            Copia <span className="font-mono text-text">{origemId}</span> pra uma pasta nova. O
            original continua intocado — é ele que você deploya.
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          <Field label="Categoria">
            <Input
              value={categoria}
              onChange={(e) => setCategoria(emSlug(e.target.value))}
              spellCheck={false}
            />
          </Field>
          <Field label="Nome" hint="Minúsculas e hífen. Vira a pasta e o slug no Supabase.">
            <Input
              ref={campo}
              value={slug}
              onChange={(e) => setSlug(emSlug(e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && void duplicar()}
              placeholder="joana-ricardo"
              spellCheck={false}
            />
          </Field>

          <p className="border-l border-rule pl-3 text-[11px] leading-[1.6] text-muted/80">
            Não viajam junto: listas de convidados (<span className="font-mono">.txt</span> da raiz),{" "}
            <span className="font-mono">node_modules</span>, <span className="font-mono">.next</span> e{" "}
            <span className="font-mono">.originais</span>. O{" "}
            <span className="font-mono">SITE_ID</span> é registrado novo no Supabase, senão o mural
            de recados cairia em cima do casal antigo.
          </p>

          {erro && <p className="border-l-2 border-bad pl-3 text-[12px] text-bad">{erro}</p>}
        </div>

        <div className="flex items-center gap-3 border-t border-rule px-6 py-4">
          <span className="truncate font-mono text-[11px] text-muted">
            {valido ? `${categoria}/${slug}` : "—"}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button variant="ghost" disabled={copiando} onClick={onFechar}>
              Cancelar
            </Button>
            <Button variant="primary" disabled={!valido || copiando} onClick={() => void duplicar()}>
              <CornerDownLeft size={13} /> {copiando ? "Copiando…" : "Duplicar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
