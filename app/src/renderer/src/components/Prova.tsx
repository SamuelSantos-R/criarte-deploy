import { useState, type CSSProperties, type ReactElement } from "react";
import { getIn } from "@/components/JsonForm";

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** A prova usa as vars `--paper*` do Studio; o tema do convite as sobrescreve.
 *  Token invalido nao entra, entao o padrao do Studio segue valendo. */
function papelDoTema(dados: Record<string, unknown>): CSSProperties {
  const tema = (dados.tema ?? {}) as Record<string, unknown>;
  const cor = (chave: string): string | null => {
    const v = tema[chave];
    return typeof v === "string" && HEX.test(v) ? v : null;
  };
  const pares: [string, string | null][] = [
    ["--paper", cor("creme")],
    ["--paper-ink", cor("texto")],
    ["--paper-muted", cor("texto-claro")],
    ["--accent-deep", cor("realce")],
  ];
  return Object.fromEntries(pares.filter(([, v]) => v !== null)) as CSSProperties;
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const texto = (v: unknown): string => (typeof v === "string" ? v : "");

function lista(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Não é o site: é a prova de impressão. Mostra na hora o que o formulário
 * mudou nos campos que importam — nomes, data, chamada, endereços.
 */
export function Prova({ dados, siteId }: { dados: Record<string, unknown>; siteId: string }): ReactElement {
  const noiva = texto(getIn(dados, ["noivos", "noiva"]));
  const noivo = texto(getIn(dados, ["noivos", "noivo"]));
  const iso = texto(dados.data);
  const quando = iso ? new Date(iso) : null;
  const valida = quando && !Number.isNaN(quando.getTime());
  const faltam = valida ? Math.ceil((quando.getTime() - Date.now()) / 86_400_000) : null;

  const monograma = texto(getIn(dados, ["versiculo", "monograma"]));
  const chamada = lista(getIn(dados, ["hero", "chamada"]));
  const eventos = Array.isArray(dados.eventos) ? dados.eventos : [];

  const base = texto(getIn(dados, ["assets", "r2"]));
  const foto = texto(getIn(dados, ["hero", "foto"]));
  const capa = base && foto ? `${base}/${foto}` : null;
  const [falhou, setFalhou] = useState<string | null>(null);

  // Monograma às vezes é caminho de SVG do site, que aqui não resolve — não
  // adianta cuspir "/assets/x.svg" na cara da prova.
  const monogramaTexto = /^\/|\.(svg|png|jpe?g|webp)$/i.test(monograma) ? "" : monograma;

  return (
    // O pr-20 é a faixa que o corte do painel come — texto nenhum entra ali.
    <div
      className="relative bg-paper py-12 pl-10 pr-20 text-paper-ink shadow-[14px_14px_0_0_rgba(0,0,0,0.28)]"
      style={papelDoTema(dados)}
    >
      <div className="mb-8 flex items-baseline justify-between border-b border-paper-ink/20 pb-3">
        <span className="font-mono text-serial uppercase tracking-[0.2em] text-paper-muted">Prova · {siteId}</span>
        {faltam !== null && (
          <span className="font-mono text-serial uppercase tracking-[0.2em] text-paper-muted">
            {faltam >= 0 ? `${faltam} dias` : `há ${Math.abs(faltam)} dias`}
          </span>
        )}
      </div>

      {capa && falhou !== capa && (
        <img
          src={capa}
          alt={`Foto de capa de ${noiva} e ${noivo}`}
          className="mb-8 block h-[190px] w-full object-cover"
          onError={() => setFalhou(capa)}
        />
      )}
      {capa && falhou === capa && (
        <p className="mb-8 flex h-[190px] flex-col items-center justify-center gap-1 border border-dashed border-bad/60 px-6 text-center">
          <span className="font-mono text-serial uppercase tracking-[0.2em] text-bad">Foto do hero não carregou</span>
          <span className="font-mono text-[11px] text-paper-muted">{foto}</span>
        </p>
      )}

      {monogramaTexto && (
        <p className="mb-4 font-display text-[28px] leading-none text-accent-deep">{monogramaTexto}</p>
      )}

      <h1 className="font-display text-[46px] leading-[1.05]">
        {noiva || "—"}
        <span className="mx-2 text-accent-deep">&</span>
        {noivo || "—"}
      </h1>

      {valida && (
        <p className="mt-5 font-mono text-[13px] uppercase tracking-[0.22em] text-paper-muted">
          {quando.getDate()} de {MESES[quando.getMonth()]} de {quando.getFullYear()} ·{" "}
          {String(quando.getHours()).padStart(2, "0")}h{String(quando.getMinutes()).padStart(2, "0")}
        </p>
      )}
      {!valida && iso && <p className="mt-5 font-mono text-[12px] text-bad">Data inválida: {iso}</p>}

      {chamada.length > 0 && (
        <div className="mt-8 border-l-2 border-accent-deep/50 pl-5">
          {chamada.map((linha, i) => (
            <p key={i} className="text-[15px] leading-[1.7]">
              {linha}
            </p>
          ))}
        </div>
      )}

      {eventos.length > 0 && (
        <dl className="mt-10 space-y-4">
          {eventos.map((ev, i) => {
            const e = (ev ?? {}) as Record<string, unknown>;
            return (
              <div key={i} className="flex gap-4 border-t border-paper-ink/15 pt-3">
                <dt className="w-24 shrink-0 font-mono text-serial uppercase tracking-[0.16em] text-paper-muted">
                  {texto(e.titulo) || `Evento ${i + 1}`}
                </dt>
                <dd className="text-[14px] leading-[1.6]">
                  {texto(e.local)}
                  {texto(e.detalhe) && <span className="block text-paper-muted">{texto(e.detalhe)}</span>}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}
