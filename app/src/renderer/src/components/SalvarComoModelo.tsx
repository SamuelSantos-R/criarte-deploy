import { useEffect, useRef, useState, type ReactElement } from "react";
import { CornerDownLeft } from "lucide-react";
import { modelosSalvar, type Categoria, type ModeloConvite } from "@/lib/api";
import { Button, Field, Input } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { CATEGORIAS, categoriaDoSite } from "../../../shared/categorias";

/**
 * Guarda o convite aberto como molde no R2. Grava o que está no disco: quem
 * tiver edições por gravar é avisado antes, para o modelo não nascer atrás da
 * tela.
 */
export function SalvarComoModelo({
  siteId,
  porGravar,
  onFechar,
  onPronto,
}: {
  siteId: string;
  porGravar: boolean;
  onFechar: () => void;
  onPronto: (modelo: ModeloConvite) => void;
}): ReactElement {
  const inicial: Categoria = categoriaDoSite(siteId) ?? "casamento";
  const [categoria, setCategoria] = useState<Categoria>(inicial);
  const [nome, setNome] = useState("");
  const [nota, setNota] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    campo.current?.focus();
  }, []);

  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !gravando) onFechar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [gravando, onFechar]);

  const salvar = async (): Promise<void> => {
    if (!nome.trim() || gravando) return;
    setGravando(true);
    setErro(null);
    try {
      onPronto(await modelosSalvar(siteId, { nome, categoria, nota }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setGravando(false);
    }
  };

  return (
    <div
      className="no-drag fixed inset-0 z-50 flex items-start justify-center bg-ground/80 pt-[18vh]"
      onMouseDown={(e) => e.target === e.currentTarget && !gravando && onFechar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modelo-titulo"
        className="w-[440px] rounded-2xl border border-rule bg-surface shadow-flutua"
      >
        <div className="border-b border-rule px-6 py-4">
          <h2 id="modelo-titulo" className="font-narrow font-semibold text-label text-text">
            Salvar como modelo
          </h2>
          <p className="mt-1.5 text-[12px] leading-normal text-muted">
            Guarda <span className="font-mono text-text">{siteId}</span> na biblioteca do R2 para nascer
            convite novo dele em qualquer máquina. O convite em si não muda.
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          {porGravar && (
            <p className="rounded-lg bg-cyan/10 px-3 py-2 text-[12px] text-text">
              Há edições por gravar — o modelo leva o que está no disco. Salve antes se quiser que vão.
            </p>
          )}
          <div role="radiogroup" aria-label="Tipo de convite" className="flex rounded-full border border-rule p-0.5">
            {CATEGORIAS.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={categoria === c.id}
                onClick={() => setCategoria(c.id)}
                className={cn(
                  "flex-1 rounded-full py-1.5 text-[12.5px] transition-colors",
                  categoria === c.id ? "bg-surface-2 font-semibold text-text" : "text-muted hover:text-text",
                )}
              >
                {c.rotulo}
              </button>
            ))}
          </div>
          <Field label="Nome do modelo">
            <Input
              ref={campo}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void salvar()}
              placeholder="Clássico verde-oliva"
            />
          </Field>
          <Field label="Nota" hint="Opcional — o que distingue este modelo.">
            <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="com história e cronograma" />
          </Field>

          <p className="border-l border-rule pl-3 text-[11px] leading-[1.6] text-muted">
            Ficam de fora: nomes dos noivos e dos pais (viram “Noiva”, “Pai da noiva”…), a tradução em
            inglês, listas de convidados, o <span className="font-mono">guests.json</span> e o{" "}
            <span className="font-mono">SITE_ID</span> do mural. As fotos vão — troque-as no convite novo.
          </p>

          {erro && <p className="rounded-lg bg-pencil/10 px-3 py-2 text-[12px] text-pencil">{erro}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-rule px-6 py-4">
          <Button variant="ghost" disabled={gravando} onClick={onFechar}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!nome.trim() || gravando} onClick={() => void salvar()}>
            <CornerDownLeft size={13} /> {gravando ? "Subindo…" : "Salvar modelo"}
          </Button>
        </div>
      </div>
    </div>
  );
}
