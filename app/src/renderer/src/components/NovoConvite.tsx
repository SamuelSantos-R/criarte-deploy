import { useEffect, useRef, useState, type ReactElement } from "react";
import { CornerDownLeft, X } from "lucide-react";
import {
  modelosApagar,
  modelosCriar,
  modelosListar,
  type Categoria,
  type Copia,
  type ModeloConvite,
} from "@/lib/api";
import { Button, Field, Input } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { CATEGORIAS } from "../../../shared/categorias";

function emSlug(bruto: string): string {
  return bruto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 60);
}

const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Convite novo a partir de um modelo da biblioteca. Antes o único caminho era
 * duplicar o convite de outro casal e apagar-lhe os nomes à mão; o modelo já
 * vem sem casal, e está no R2 — a mesma lista em todas as máquinas.
 */
export function NovoConvite({
  onFechar,
  onPronto,
}: {
  onFechar: () => void;
  onPronto: (copia: Copia) => void;
}): ReactElement {
  const [categoria, setCategoria] = useState<Categoria>("casamento");
  const [modelos, setModelos] = useState<ModeloConvite[] | null>(null);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    modelosListar()
      .then(setModelos)
      .catch((e: unknown) => {
        setModelos([]);
        setErro(e instanceof Error ? e.message : String(e));
      });
  }, []);

  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !criando) onFechar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [criando, onFechar]);

  const daCategoria = (modelos ?? []).filter((m) => m.categoria === categoria);
  const info = CATEGORIAS.find((c) => c.id === categoria) ?? CATEGORIAS[0];
  const rotuloDe = info.rotulo;
  // Trocar de categoria não pode deixar escolhido um modelo que já nem aparece.
  const modelo = daCategoria.find((m) => m.id === escolhido) ?? null;
  const valido = modelo !== null && /^[a-z0-9][a-z0-9-]*$/.test(slug);

  const criar = async (): Promise<void> => {
    if (!valido || criando || !modelo) return;
    setCriando(true);
    setErro(null);
    try {
      onPronto(await modelosCriar(modelo.id, categoria, slug));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setCriando(false);
    }
  };

  const apagar = (m: ModeloConvite): void => {
    if (!window.confirm(`Apagar o modelo "${m.nome}"? Some em todas as máquinas. Os convites já criados com ele não mudam.`)) return;
    modelosApagar(m.id)
      .then(() => setModelos((atual) => (atual ?? []).filter((x) => x.id !== m.id)))
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)));
  };

  return (
    <div
      className="no-drag fixed inset-0 z-50 flex items-start justify-center bg-ground/80 pt-[12vh]"
      onMouseDown={(e) => e.target === e.currentTarget && !criando && onFechar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="novo-titulo"
        className="w-[520px] rounded-2xl border border-rule bg-surface shadow-flutua"
      >
        <div className="border-b border-rule px-6 py-4">
          <h2 id="novo-titulo" className="font-narrow font-semibold text-label text-text">
            Novo convite
          </h2>
          <p className="mt-1.5 text-[12px] leading-normal text-muted">
            Nasce de um modelo da biblioteca, já sem o casal. Um modelo novo sai de qualquer convite
            em <span className="text-text">⋯ → Salvar como modelo</span>.
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div role="radiogroup" aria-label="Tipo de convite" className="flex rounded-full border border-rule p-0.5">
            {CATEGORIAS.map((c) => {
              const quantos = (modelos ?? []).filter((m) => m.categoria === c.id).length;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={categoria === c.id}
                  onClick={() => setCategoria(c.id)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-[12.5px] transition-colors",
                    categoria === c.id ? "bg-surface-2 font-semibold text-text" : "text-muted hover:text-text",
                  )}
                >
                  {c.rotulo}
                  {modelos !== null && (
                    <span className="font-narrow font-semibold text-gauge text-muted">{quantos}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="max-h-[240px] space-y-1.5 overflow-y-auto" role="listbox" aria-label="Modelos">
            {modelos === null && <p className="text-[12px] text-muted">Lendo a biblioteca…</p>}
            {modelos !== null && daCategoria.length === 0 && (
              <p className="rounded-lg bg-cyan/10 px-3 py-2 text-[12px] leading-[1.6] text-text">
                A biblioteca de {rotuloDe.toLowerCase()} ainda está vazia. Abra um convite que sirva de
                molde e use <b>⋯ → Salvar como modelo</b>, escolhendo {rotuloDe.toLowerCase()}.
              </p>
            )}
            {daCategoria.map((m) => (
              <div key={m.id} className="group relative">
                <button
                  type="button"
                  role="option"
                  aria-selected={modelo?.id === m.id}
                  onClick={() => {
                    setEscolhido(m.id);
                    campo.current?.focus();
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    modelo?.id === m.id ? "border-text bg-surface-2" : "border-rule hover:border-muted",
                  )}
                >
                  <span className="h-7 w-7 shrink-0 rounded-full border border-rule" style={{ background: m.cor ?? "transparent" }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-text">{m.nome}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {m.nota || "—"} · {mb(m.bytes)}
                      {m.autor ? ` · ${m.autor}` : ""}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => apagar(m)}
                  aria-label={`Apagar o modelo ${m.nome}`}
                  title="Apagar da biblioteca"
                  className="absolute right-2 top-1/2 hidden -translate-y-1/2 p-1.5 text-muted hover:text-pencil group-hover:block focus-visible:block"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>

          <Field label="Nome" hint="Minúsculas e hífen. Vira a pasta e o slug no Supabase.">
            <Input
              ref={campo}
              value={slug}
              onChange={(e) => setSlug(emSlug(e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && void criar()}
              placeholder={info.exemplo}
              spellCheck={false}
            />
          </Field>

          {erro && <p className="rounded-lg bg-pencil/10 px-3 py-2 text-[12px] text-pencil">{erro}</p>}
        </div>

        <div className="flex items-center gap-3 border-t border-rule px-6 py-4">
          <span className="truncate font-mono text-[11px] text-muted">{valido ? `${categoria}/${slug}` : "—"}</span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button variant="ghost" disabled={criando} onClick={onFechar}>
              Cancelar
            </Button>
            <Button variant="primary" disabled={!valido || criando} onClick={() => void criar()}>
              <CornerDownLeft size={13} /> {criando ? "Baixando o modelo…" : "Criar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
