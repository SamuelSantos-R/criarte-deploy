import { type ReactElement } from "react";
import { CampoArquivo } from "@/components/CampoArquivo";
import { CropVisual } from "@/components/CropVisual";
import { Field, Input, Rule } from "@/components/ui/primitives";
import { usePreviaDeAsset } from "@/lib/usePreviaDeAsset";

/**
 * Retrato de telemóvel (9:16) — é como a capa é vista quase sempre. Enquadrar
 * aqui é aproximado de propósito; a prova mesmo é o preview ao vivo ao lado,
 * que mostra o aparelho escolhido de verdade.
 */
const ASPECTO_HERO = "9 / 16";

export function PainelHero({
  hero,
  siteId,
  onChange,
}: {
  hero: Record<string, unknown>;
  siteId: string | null;
  onChange: (caminho: (string | number)[], valor: unknown) => void;
}): ReactElement {
  const foto = typeof hero.foto === "string" ? hero.foto : "";
  const posicao = typeof hero.posicao === "string" ? hero.posicao : "center";
  const zoom = typeof hero.zoom === "number" ? hero.zoom : 1.25;
  const pretoEBranco = hero.pretoEBranco !== false;
  const chamadaBruta = Array.isArray(hero.chamada) ? hero.chamada : [];
  const chamada: string[] = [
    typeof chamadaBruta[0] === "string" ? chamadaBruta[0] : "",
    typeof chamadaBruta[1] === "string" ? chamadaBruta[1] : "",
  ];
  const { dataUrl, carregando } = usePreviaDeAsset(siteId, foto);

  return (
    <div className="max-w-[560px]">
      <Rule>Foto de capa</Rule>
      <CampoArquivo valor={foto} label="Foto" onChange={(v) => onChange(["foto"], v)} />

      <div className="mt-3">
        <CropVisual
          dataUrl={dataUrl}
          carregando={carregando}
          // O código do convite escala 1.25× por padrão — sem isso a régua abria em 1× e a
          // capa "encolhia" na hora, mesmo sem ninguém ter mexido em nada.
          posicao={posicao}
          zoom={zoom}
          aspecto={ASPECTO_HERO}
          onMudar={(novaPosicao, novoZoom) => {
            onChange(["posicao"], novaPosicao);
            onChange(["zoom"], novoZoom);
          }}
        />
      </div>

      <label className="mt-4 flex items-center gap-2">
        <input
          type="checkbox"
          checked={pretoEBranco}
          onChange={(e) => onChange(["pretoEBranco"], e.target.checked)}
          className="no-drag h-4 w-4 accent-cyan"
        />
        <span className="text-[13px] text-text">Preto e branco</span>
      </label>

      <Rule>Chamada</Rule>
      <div className="grid grid-cols-1 gap-3">
        <Field label="Primeira linha">
          <Input value={chamada[0] ?? ""} onChange={(e) => onChange(["chamada", 0], e.target.value)} />
        </Field>
        <Field label="Segunda linha">
          <Input value={chamada[1] ?? ""} onChange={(e) => onChange(["chamada", 1], e.target.value)} />
        </Field>
      </div>
    </div>
  );
}
