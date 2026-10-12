// Sem nada do Electron: os testes correm em Node puro contra cópias dos convites.

/**
 * Em memória: o botão do Studio escreve o ♥ no INÍCIO do nome ("♥ João"), e os
 * Versiculo.tsx anteriores ao botão só o sabiam desenhar no fim ("João ♥") — o
 * coração saía com a margem do lado errado e o espaço a sobrar. Os ainda mais
 * velhos nem o conheciam, e no iPhone ele virava emoji vermelho. Conserto no
 * sítio, não troca do ficheiro: o resto do versículo de cada convite fica como
 * foi desenhado.
 */
const CORACAO_SPAN =
  '<span key={i} className={parts.slice(0, i).every((p) => p.trim() === "") ? "text-[0.78em] mr-[0.28em]" : "text-[0.78em] ml-0.5"} style={{ fontVariantEmoji: "text", verticalAlign: "0.08em" }}>{"♥\\uFE0E"}</span>';

export function coracaoDosPais(codigo: string): string {
  // Já sabia do ♥, mas só no fim.
  let novo = codigo.replace("split(/(\\([^)]*\\)|\\s*♥\\uFE0E?)/g)", "split(/(\\([^)]*\\)|\\s*♥\\uFE0E?\\s*)/g)");
  novo = novo.replace(
    /(if \(part\.includes\("♥"\)\) \{\s*return \(\s*<span\s+key=\{i\}\s+)className="text-\[0\.78em\] ml-0\.5"/,
    '$1className={parts.slice(0, i).every((p) => p.trim() === "") ? "text-[0.78em] mr-[0.28em]" : "text-[0.78em] ml-0.5"}',
  );
  // Nunca soube do ♥: entra um ramo antes dos parênteses.
  if (!novo.includes("♥") && novo.includes("line.split(/(\\([^)]*\\))/g)")) {
    novo = novo
      .replace("line.split(/(\\([^)]*\\))/g)", "line.split(/(\\([^)]*\\)|\\s*♥\\uFE0E?\\s*)/g)")
      .replace(
        /\{parts\.map\(\(part, i\) =>(\s*)part\.startsWith\("\("\)/,
        (_m, esp: string) => `{parts.map((part, i) =>${esp}part.includes("♥") ? (${esp}  ${CORACAO_SPAN}${esp}) : part.startsWith("(")`,
      );
  }
  return novo;
}
