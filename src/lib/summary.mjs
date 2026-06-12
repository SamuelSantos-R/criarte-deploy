// ============================================================================
// SUMMARY — resumo final do deploy
// ============================================================================
const c = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  ok: "\x1b[38;2;100;180;120m", warn: "\x1b[38;2;230;180;100m", err: "\x1b[38;2;230;100;120m",
  brand: "\x1b[38;2;200;160;90m", cyan: "\x1b[38;2;130;180;220m",
};

function row(label, value, color = c.brand) {
  console.log(`  ${c.dim}${label.padEnd(16)}${c.reset} ${color}${value}${c.reset}`);
}

function formatBytes(n) {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatDuration(ms) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${s % 60}s`;
}

export function printSummary(m, { manifestPath } = {}) {
  const ok = m.status === "success";
  const head = ok ? `${c.ok}${c.bold}✓ Deploy concluído${c.reset}` : `${c.err}${c.bold}✕ Deploy falhou${c.reset}`;
  console.log();
  console.log(head);
  console.log();
  row("Domínio", m.domain);
  row("Categoria", m.category);
  row("Slug", m.slug);
  row("URL final", m.finalUrl, c.cyan);
  row("Base", m.base || "—");
  row("Ação", m.action);
  if (m.commitSha) row("Commit", m.commitSha.slice(0, 7));
  row("Duração", formatDuration(m.durationMs));
  console.log();
  if (m.r2.prefix) {
    console.log(`  ${c.bold}R2${c.reset}`);
    row("  prefix", m.r2.prefix);
    row("  enviados", String(m.r2.uploaded.length), m.r2.uploaded.length ? c.ok : c.dim);
    row("  pulados", String(m.r2.skipped.length), c.dim);
    row("  falhas", String(m.r2.failed.length), m.r2.failed.length ? c.err : c.dim);
    row("  tamanho", formatBytes(m.r2.totalBytes));
    if (m.r2.failed.length) {
      console.log(`  ${c.err}  ↑ falhas:${c.reset}`);
      for (const f of m.r2.failed.slice(0, 5)) {
        console.log(`    ${c.dim}-${c.reset} ${f.path} ${c.dim}(${f.error})${c.reset}`);
      }
    }
    console.log();
  }
  if (m.healthChecks.length) {
    console.log(`  ${c.bold}Health checks${c.reset}`);
    for (const h of m.healthChecks) {
      const mark = h.ok ? `${c.ok}✓${c.reset}` : `${c.err}✕${c.reset}`;
      console.log(`  ${mark} ${h.label.padEnd(20)} ${c.dim}${h.url} → ${h.status}${c.reset}`);
    }
    console.log();
  }
  if (manifestPath) {
    console.log(`  ${c.dim}Manifest:${c.reset} ${c.dim}${manifestPath}${c.reset}`);
  }
  console.log();
}
