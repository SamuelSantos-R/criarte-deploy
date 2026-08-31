import { createContext, useContext, useState, type DragEvent, type ReactElement } from "react";
import { File as FileIcon, FolderOpen, Upload, X } from "lucide-react";
import { caminhoDe, importAssets, pickAssets } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/primitives";

const SiteAtual = createContext<string | null>(null);
export const ProvedorSite = SiteAtual.Provider;

const EXTENSAO = /\.(jpe?g|png|webp|avif|gif|svg|mp4|webm|mov|mp3|m4a|ogg|wav|woff2?|ttf|otf)$/i;
const CHAVE_DE_ASSET =
  /^(foto|imagem|capa|video|audio|musica|arquivo|fonte|icone|logo|separador|flor|fundo|monograma|poster|thumb)/i;

/** Campo de asset é o que já aponta pra um arquivo, ou o que está vazio mas tem nome de arquivo. */
export function ehAsset(chave: string, valor: string): boolean {
  if (valor.startsWith("http://") || valor.startsWith("https://")) return false;
  return EXTENSAO.test(valor) || (valor === "" && CHAVE_DE_ASSET.test(chave));
}

/**
 * O convite usa duas escritas: `/assets/x.svg` pros leves do public e `x.jpg`
 * cru pros pesados que o deploy manda pro R2. Mantemos a que a chave já usava
 * — quem decide o que sobe pra onde é o `crd deploy`, não o formulário.
 */
function comoEscrever(atual: string, web: string): string {
  if (atual === "" || atual.startsWith("/")) return web;
  return web.replace(/^\/assets\//, "");
}

export function CampoArquivo({
  valor,
  label,
  onChange,
  aceita,
  aceitaNota,
}: {
  valor: string;
  label: string;
  onChange: (valor: string) => void;
  /** Restringe o campo a um subconjunto das extensões. Sem isto, aceita tudo. */
  aceita?: RegExp;
  aceitaNota?: string;
}): ReactElement {
  const siteId = useContext(SiteAtual);
  const [sobre, setSobre] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [nota, setNota] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const aplicar = async (acao: Promise<{ nome: string; web: string }[]>): Promise<void> => {
    setOcupado(true);
    setErro(null);
    setNota(null);
    try {
      const arquivos = await acao;
      if (arquivos.length === 0) return;
      // O ficheiro já foi copiado pra public/assets antes de chegar aqui — recusar
      // agora só impede que o convite passe a apontar pra ele.
      if (aceita && !aceita.test(arquivos[0].nome)) {
        setErro(`${arquivos[0].nome} não serve aqui${aceitaNota ? ` — ${aceitaNota}` : ""}`);
        return;
      }
      onChange(comoEscrever(valor, arquivos[0].web));
      setNota(
        arquivos.length === 1
          ? `${arquivos[0].nome} copiado`
          : `${arquivos[0].nome} + ${arquivos.length - 1} copiados pra public/assets`,
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };

  const soltar = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setSobre(false);
    if (!siteId) return;
    const caminhos = [...e.dataTransfer.files].map(caminhoDe).filter(Boolean);
    if (caminhos.length > 0) void aplicar(importAssets(siteId, caminhos));
  };

  const nome = valor.split("/").pop() ?? "";

  return (
    <div className="block">
      <span className="mb-1.5 block font-mono text-label uppercase text-muted">{label}</span>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setSobre(true);
        }}
        onDragLeave={() => setSobre(false)}
        onDrop={soltar}
        className={cn(
          "no-drag flex items-center gap-2 border border-dashed px-2.5 py-2 transition-colors",
          sobre ? "border-sage bg-sage/10" : "border-rule bg-surface",
          ocupado && "opacity-50",
        )}
      >
        {valor ? (
          <>
            <FileIcon size={13} className="shrink-0 text-muted" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-text" title={valor}>
              {nome}
            </span>
            <button
              onClick={() => {
                onChange("");
                setNota(null);
              }}
              aria-label={`Limpar ${label}`}
              title="Limpar"
              className="shrink-0 p-1 text-muted transition-colors hover:text-bad"
            >
              <X size={13} />
            </button>
          </>
        ) : (
          <>
            <Upload size={13} className="shrink-0 text-muted" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[12px] text-muted">Arraste aqui</span>
          </>
        )}
        <Button
          variant="ghost"
          disabled={!siteId || ocupado}
          onClick={() => siteId && void aplicar(pickAssets(siteId, false))}
        >
          Arquivo
        </Button>
        <Button
          variant="ghost"
          disabled={!siteId || ocupado}
          onClick={() => siteId && void aplicar(pickAssets(siteId, true))}
          aria-label={`Escolher pasta para ${label}`}
        >
          <FolderOpen size={13} /> Pasta
        </Button>
      </div>
      {nota && <span className="mt-1 block font-mono text-[11px] text-ok">{nota}</span>}
      {erro && <span className="mt-1 block font-mono text-[11px] text-bad">{erro}</span>}
    </div>
  );
}
