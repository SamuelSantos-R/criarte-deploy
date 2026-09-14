import { useState, type ReactElement } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { CampoArquivo } from "@/components/CampoArquivo";
import { CropVisual } from "@/components/CropVisual";
import { Segmentado } from "@/components/ui/Segmentado";
import { Button, Field, Input, Rule, Textarea } from "@/components/ui/primitives";
import { usePreviaDeAsset } from "@/lib/usePreviaDeAsset";
import { cn } from "@/lib/utils";

type Foto = { foto?: string; posicao?: string; zoom?: number };

const PROPORCOES: { id: string; rotulo: string; largura: number; altura: number }[] = [
  { id: "2:3", rotulo: "2:3", largura: 2, altura: 3 },
  { id: "3:4", rotulo: "3:4", largura: 3, altura: 4 },
  { id: "4:5", rotulo: "4:5", largura: 4, altura: 5 },
  { id: "1:1", rotulo: "1:1", largura: 1, altura: 1 },
  { id: "9:16", rotulo: "9:16", largura: 9, altura: 16 },
];
const PADRAO = PROPORCOES[0];

function FotoCard({
  foto,
  siteId,
  aspecto,
  indice,
  onChange,
  onRemover,
  arrastavel,
}: {
  foto: Foto;
  siteId: string | null;
  aspecto: string;
  indice: number;
  onChange: (foto: Foto) => void;
  onRemover: () => void;
  arrastavel: ReactElement;
}): ReactElement {
  const caminho = typeof foto.foto === "string" ? foto.foto : "";
  const { dataUrl, carregando } = usePreviaDeAsset(siteId, caminho);

  return (
    <div className="relative min-w-0 rounded-xl border border-rule bg-surface p-3">
      <div className="mb-2 flex items-center gap-2">
        {arrastavel}
        <span className="font-narrow text-gauge font-semibold text-muted">{String(indice + 1).padStart(2, "0")}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onRemover}
          aria-label={`Remover foto ${indice + 1}`}
          title="Remover"
          className="no-drag p-1 text-muted transition-colors hover:text-pencil"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <CampoArquivo valor={caminho} label="Foto" onChange={(v) => onChange({ ...foto, foto: v })} />

      <div className="mt-2">
        <CropVisual
          dataUrl={dataUrl}
          carregando={carregando}
          posicao={typeof foto.posicao === "string" ? foto.posicao : "center"}
          zoom={typeof foto.zoom === "number" ? foto.zoom : 1}
          aspecto={aspecto}
          onMudar={(posicao, zoom) => onChange({ ...foto, posicao, zoom })}
        />
      </div>
    </div>
  );
}

export function PainelGaleria({
  galeria,
  siteId,
  onChange,
}: {
  galeria: Record<string, unknown>;
  siteId: string | null;
  onChange: (caminho: (string | number)[], valor: unknown) => void;
}): ReactElement {
  const titulo = typeof galeria.titulo === "string" ? galeria.titulo : "";
  const texto = typeof galeria.texto === "string" ? galeria.texto : "";
  const fotos = Array.isArray(galeria.fotos) ? (galeria.fotos as Foto[]) : [];
  const proporcaoBruta = (galeria.proporcao ?? {}) as { largura?: unknown; altura?: unknown };
  const largura = typeof proporcaoBruta.largura === "number" ? proporcaoBruta.largura : PADRAO.largura;
  const altura = typeof proporcaoBruta.altura === "number" ? proporcaoBruta.altura : PADRAO.altura;
  const proporcaoId = PROPORCOES.find((p) => p.largura === largura && p.altura === altura)?.id ?? PADRAO.id;
  const aspecto = `${largura} / ${altura}`;

  const [pegado, setPegado] = useState<number | null>(null);
  const [alvo, setAlvo] = useState<number | null>(null);

  const mover = (de: number, para: number): void => {
    if (de === para || de < 0 || de >= fotos.length || para < 0 || para >= fotos.length) return;
    const copia = [...fotos];
    const [item] = copia.splice(de, 1);
    copia.splice(para, 0, item);
    onChange(["fotos"], copia);
  };

  return (
    <div className="max-w-[640px]">
      <Rule>Texto</Rule>
      <div className="grid grid-cols-1 gap-3">
        <Field label="Título">
          <Input value={titulo} onChange={(e) => onChange(["titulo"], e.target.value)} />
        </Field>
        <Field label="Texto">
          <Textarea rows={3} value={texto} onChange={(e) => onChange(["texto"], e.target.value)} />
        </Field>
      </div>

      <Rule>Formato do cartão</Rule>
      <Segmentado
        rotulo="Formato do cartão"
        valor={proporcaoId}
        onChange={(id) => {
          const p = PROPORCOES.find((x) => x.id === id) ?? PADRAO;
          onChange(["proporcao"], { largura: p.largura, altura: p.altura });
        }}
        opcoes={PROPORCOES.map((p) => ({ valor: p.id, rotulo: p.rotulo }))}
      />
      <p className="mt-1.5 text-[11px] text-muted">Muda todos os cartões da galeria de uma vez.</p>

      <div className="mb-3 mt-8 flex items-center gap-3">
        <span className="text-[13px] font-bold text-text">Fotos</span>
        <span className="font-narrow font-semibold text-gauge text-muted">{String(fotos.length).padStart(2, "0")}</span>
        <span className="h-px flex-1 bg-rule" />
        <Button variant="ghost" onClick={() => onChange(["fotos"], [...fotos, { foto: "", posicao: "center", zoom: 1 }])}>
          <Plus size={13} /> Adicionar
        </Button>
      </div>

      {/* Colunas pelo espaço do painel, não pela janela: com "3 fixas", o preview
          aberto espremia o formulário e a terceira coluna ficava fora de vista —
          duas fotos pareciam não ter cartão. */}
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
        {fotos.map((foto, i) => (
          <div
            key={i}
            onDragOver={(e) => {
              if (pegado === null) return;
              e.preventDefault();
              setAlvo(i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (pegado !== null && alvo !== null) mover(pegado, alvo);
              setPegado(null);
              setAlvo(null);
            }}
            className={cn(
              pegado === i && "opacity-50",
              pegado !== null && alvo === i && pegado !== i && "outline outline-2 outline-cyan",
              "rounded-xl",
            )}
          >
            <FotoCard
              foto={foto}
              siteId={siteId}
              aspecto={aspecto}
              indice={i}
              onChange={(novo) => onChange(["fotos", i], novo)}
              onRemover={() => onChange(["fotos"], fotos.filter((_, k) => k !== i))}
              arrastavel={
                <span
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    setPegado(i);
                  }}
                  onDragEnd={() => {
                    setPegado(null);
                    setAlvo(null);
                  }}
                  className="no-drag cursor-grab p-0.5 text-muted hover:text-text active:cursor-grabbing"
                  aria-label={`Arrastar foto ${i + 1} pra reordenar`}
                  title="Arrastar pra reordenar"
                >
                  <GripVertical size={14} />
                </span>
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
