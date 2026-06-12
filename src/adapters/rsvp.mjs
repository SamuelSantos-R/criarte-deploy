// ============================================================================
// RSVP ADAPTER — Base de site RSVP (confirmação de presença)
// ============================================================================
import { BaseAdapter } from "./base.mjs";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { info, warn, c, ok as okLog, section } from "../lib/config.mjs";
import { Spinner } from "../lib/spinner.mjs";

export class RsvpAdapter extends BaseAdapter {
  name = "rsvp";

  detect(stagingDir) {
    const configPath = join(stagingDir, "criarte.config.json");
    if (existsSync(configPath)) {
      try {
        const cfg = JSON.parse(readFileSync(configPath, "utf8"));
        if (cfg.base === "rsvp") return true;
      } catch {}
    }
    return (
      existsSync(join(stagingDir, "src", "lib", "d1.ts")) ||
      existsSync(join(stagingDir, "src", "app", "api", "criar-confirmacao")) ||
      existsSync(join(stagingDir, "app", "api", "criar-confirmacao"))
    );
  }

  getRemovePatterns() {
    return [
      "app/api",
      "src/app/api",
      "pages/api",
      "src/pages/api",
      "src/lib/d1.ts",
      "src/lib/auth.ts",
    ];
  }

  getRequiredEnv() {
    return ["EMAIL_DESTINO", "ADMIN_EMAIL"];
  }

  getMessages() {
    return {
      deployPhase: "💌 Publicar RSVP",
      summaryLabel: "RSVP",
      baseLabel: "Base RSVP detectada",
      autoSub: "auto-provisão + ajuste de fetchs",
    };
  }

  /**
   * Prepara o staging RSVP:
   * 1. Verifica/configura RSVP no servidor central
   * 2. Reescreve fetchs do front pra bater nos endpoints centrais
   */
  async prepare(stagingDir, fullSlug, config, targetUrl) {
    const envMap = readEnvLocal(stagingDir);

    // 1) Verifica se RSVP já está configurado no servidor
    let site = undefined;
    if (config.rsvp_admin_token) {
      const sp = new Spinner("Verificando configuração RSVP no servidor...").start();
      site = await fetchRsvpSite(config, fullSlug, targetUrl);
      if (site) {
        sp.succeed(`RSVP já configurado — email destino: ${c.brand}${site.email_destino}${c.reset}`);
      } else if (site === null) {
        sp.clear();
        info("RSVP ainda não configurado para este slug");
      }
      if (site === undefined) sp.clear();
    }

    if (!site) {
      if (!config.rsvp_admin_token) {
        warn("rsvp_admin_token não configurado — pulando provisão automática.");
        info(`Configure com: ${c.cyan}criarte-deploy rsvp-setup${c.reset}`);
      } else if (site === undefined) {
        info(`${c.dim}Pulando provisão RSVP devido a erro de comunicação${c.reset}`);
      } else {
        // ===== Mostrar email DETECTADO antes de registrar =====
        const envEmail = (envMap.EMAIL_DESTINO || envMap.RSVP_EMAIL || envMap.MAIL_TO || envMap.RECIPIENT_EMAIL || "").trim();
        const overrideEmail = (process.env.CRIARTE_RSVP_EMAIL_OVERRIDE || "").trim();
        const detectedEmail = overrideEmail || envEmail;
        const detectedFromTag = overrideEmail ? "flag --rsvp-email" : envEmail ? ".env do projeto" : null;

        console.log();
        console.log(`  ${c.bold}→ E-mail destino do RSVP${c.reset}`);
        if (detectedEmail) {
          console.log(`    ${c.dim}Detectado em ${detectedFromTag}:${c.reset} ${c.brand}${detectedEmail}${c.reset}`);
        } else {
          console.log(`    ${c.dim}Nenhum e-mail detectado no projeto.${c.reset}`);
        }
        const readline = await import("node:readline");
        const ask = createAsk(readline.default);
        let finalEmail = detectedEmail;
        if (!overrideEmail) {
          const change = await ask(`    ${c.bold}Manter este e-mail?${c.reset} ${c.dim}[Y/n/novo-email]${c.reset} → `);
          const t = change.trim();
          if (t && t.includes("@")) finalEmail = t;
          else if (t.toLowerCase() === "n" || t.toLowerCase() === "nao") {
            const novo = await ask(`    Digite o novo e-mail destino: `);
            if (novo.trim().includes("@")) finalEmail = novo.trim();
          }
        }

        const setup = await ask(`    ${c.bold}Registrar RSVP no servidor com ${c.brand}${finalEmail || "(sem email)"}${c.reset}${c.bold}?${c.reset} ${c.dim}[Y/n]${c.reset} → `);
        if (setup.toLowerCase() !== "n" && setup.toLowerCase() !== "nao") {
          console.log();
          const extras = finalEmail ? { emailDestino: finalEmail, adminEmail: finalEmail } : {};
          const sp2 = new Spinner("Registrando RSVP no servidor...").start();
          const r = await provisionRsvpSite(config, fullSlug, envMap, extras, targetUrl);
          if (r.ok) sp2.succeed(`RSVP registrado em ${c.bold}${fullSlug}${c.reset}`);
          else if (r.slug_existe) sp2.warn(`RSVP já estava registrado (${c.dim}ok${c.reset})`);
          else sp2.fail(`Falha ao registrar: ${r.error || "HTTP " + r.status}`);
        } else {
          info(`${c.dim}Pulando registro RSVP (pode configurar depois com rsvp-setup)${c.reset}`);
        }
      }
    } else {
      // ===== Site já existe — comparar e-mail cadastrado vs detectado =====
      const envEmail = (envMap.EMAIL_DESTINO || envMap.RSVP_EMAIL || envMap.MAIL_TO || envMap.RECIPIENT_EMAIL || "").trim();
      const overrideEmail = (process.env.CRIARTE_RSVP_EMAIL_OVERRIDE || "").trim();
      const detectedEmail = overrideEmail || envEmail;
      const cadastrado = site.email_destino || "";
      const divergence = detectedEmail && cadastrado && detectedEmail !== cadastrado;

      console.log(`  ${c.dim}Noivos:${c.reset}          ${site.noivos}`);
      console.log(`  ${c.dim}Data:${c.reset}            ${site.data_evento}`);
      console.log(`  ${c.dim}Login do casal:${c.reset}  ${site.admin_email}`);
      console.log();
      console.log(`  ${c.bold}→ E-mail destino do RSVP${c.reset}`);
      console.log(`    ${c.dim}E-mail no projeto (.env):${c.reset} ${detectedEmail ? c.brand + detectedEmail + c.reset : c.dim + "(não detectado)" + c.reset}${overrideEmail ? c.dim + " [via --rsvp-email]" + c.reset : ""}`);
      console.log(`    ${c.dim}E-mail cadastrado:${c.reset}        ${c.brand}${cadastrado}${c.reset}`);
      if (divergence) {
        console.log(`    ${c.yellow}⚠ Divergência detectada.${c.reset}`);
      }
      console.log();

      const readline = await import("node:readline");
      const ask = createAsk(readline.default);
      let escolha;
      if (overrideEmail && overrideEmail !== cadastrado) {
        escolha = overrideEmail;
        info(`${c.dim}Usando ${c.brand}${overrideEmail}${c.reset}${c.dim} (forçado via --rsvp-email)${c.reset}`);
      } else if (divergence) {
        const ans = await ask(`    ${c.bold}Qual usar?${c.reset} ${c.dim}[C=cadastrado / P=projeto / novo-email]${c.reset} → `);
        const t = ans.trim().toLowerCase();
        if (t === "p" || t === "projeto") escolha = detectedEmail;
        else if (ans.trim().includes("@")) escolha = ans.trim();
        else escolha = cadastrado;
      } else {
        const ans = await ask(`    ${c.bold}Manter ${c.brand}${cadastrado}${c.reset}${c.bold}?${c.reset} ${c.dim}[Y/n/novo-email]${c.reset} → `);
        const t = ans.trim();
        if (t && t.includes("@")) escolha = t;
        else escolha = cadastrado;
      }

      if (escolha !== cadastrado) {
        const sp3 = new Spinner(`Atualizando email destino → ${escolha}...`).start();
        const r = await updateRsvpSite(config, fullSlug, { emailDestino: escolha }, targetUrl);
        if (r.ok) sp3.succeed(`Email destino atualizado para ${c.brand}${escolha}${c.reset}`);
        else sp3.fail(`Falha ao atualizar: ${r.error || "HTTP " + r.status}`);
      } else {
        info(`${c.dim}Mantendo email destino: ${c.brand}${cadastrado}${c.reset}`);
      }
    }

    // 2) Reescreve fetchs
    const sp2 = new Spinner("Reescrevendo chamadas do front pra endpoints centrais...").start();
    const touched = rewriteRsvpFetches(stagingDir);
    sp2.succeed(`${touched} arquivo(s) reescritos`);

    return true;
  }
}

// ============================================================================
// Utilitários RSVP (extraídos do cli.mjs)
// ============================================================================

function readEnvLocal(stagingDir) {
  const map = {};
  const candidates = [".env.local", ".env.production", ".env"];
  for (const f of candidates) {
    const p = join(stagingDir, f);
    if (!existsSync(p)) continue;
    const txt = readFileSync(p, "utf8");
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      v = v.replace(/^\\\$/, "$");
      if (!(m[1] in map)) map[m[1]] = v;
    }
  }
  return map;
}

function rewriteRsvpFetches(stagingDir) {
  const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
  const map = [
    [/(["'`])\/api\/criar-confirmacao\1/g, '$1/api/rsvp/criar$1'],
    [/(["'`])\/api\/notificar-confirmacao\1/g, '$1/api/rsvp/criar$1'],
    [/(["'`])\/api\/listar-confirmacoes\1/g, '$1/api/rsvp/listar$1'],
    [/(["'`])\/api\/deletar-confirmacao\1/g, '$1/api/rsvp/deletar$1'],
    [/(["'`])\/api\/enviar-lista\1/g, '$1/api/rsvp/enviar-lista$1'],
    [/(["'`])\/api\/login\1/g, '$1/api/rsvp/auth/login$1'],
    [/(["'`])\/api\/logout\1/g, '$1/api/rsvp/auth/logout$1'],
    [/(["'`])\/api\/me\1/g, '$1/api/rsvp/auth/me$1'],
    [/(["'`])\/api\/baixar-lista\1/g, '$1/api/rsvp/baixar-pdf$1'],
  ];
  let touched = 0;
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!EXTS.has(extname(e.name))) continue;
      let content = readFileSync(full, "utf8");
      let changed = false;
      for (const [re, to] of map) {
        const next = content.replace(re, to);
        if (next !== content) { content = next; changed = true; }
      }
      if (changed) { writeFileSync(full, content); touched++; }
    }
  })(stagingDir);
  return touched;
}

async function fetchRsvpSite(config, slug, targetUrl) {
  const adminToken = config.rsvp_admin_token;
  if (!adminToken) return undefined;
  let res;
  try {
    res = await fetch(`${targetUrl}/api/rsvp/sites/provision?slug=${encodeURIComponent(slug)}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return undefined;
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    warn(`Servidor retornou HTTP ${res.status} ao consultar RSVP. Verifique o token rsvp_admin_token.`);
    return undefined;
  }
  const data = await res.json().catch(() => null);
  return data?.ok ? data.site : null;
}

async function updateRsvpSite(config, slug, payload, targetUrl) {
  const adminToken = config.rsvp_admin_token;
  if (!adminToken) throw new Error("rsvp_admin_token ausente");
  const res = await fetch(`${targetUrl}/api/rsvp/sites/provision`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ slug, ...payload }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok, status: res.status, error: data.error };
}

async function provisionRsvpSite(config, slug, envMap, extras, targetUrl) {
  const adminToken = config.rsvp_admin_token || extras?.adminToken;
  if (!adminToken) {
    throw new Error("rsvp_admin_token ausente — rode 'criarte-deploy rsvp-setup' primeiro");
  }
  const payload = {
    slug,
    noivos: extras?.noivos || envMap.NEXT_PUBLIC_NOIVOS || "",
    dataEvento: extras?.dataEvento || envMap.NEXT_PUBLIC_DATA_EVENTO || "",
    emailDestino: extras?.emailDestino || envMap.EMAIL_DESTINO || "",
    adminEmail: extras?.adminEmail || envMap.ADMIN_EMAIL || envMap.EMAIL_DESTINO || "",
    adminPasswordHash: extras?.adminPasswordHash || envMap.ADMIN_PASSWORD_HASH || "",
    adminPassword: extras?.adminPassword || "",
    secretPdf: extras?.secretPdf || envMap.CRON_SECRET || `RSVP${Date.now().toString(36).toUpperCase()}`,
    resendApiKey: extras?.resendApiKey || config.resend_api_key || envMap.RESEND_API_KEY || "",
  };
  const res = await fetch(`${targetUrl}/api/rsvp/sites/provision`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok, status: res.status, error: data.error, slug_existe: data.error === "slug_existe" };
}

// Helper mínimo de ask (sem dependência do cli.mjs)
function createAsk(rl) {
  return (question, { hidden, default: def } = {}) => {
    return new Promise((resolve) => {
      const iface = rl.createInterface({ input: process.stdin, output: process.stdout });
      const prompt = question;
      if (hidden) {
        process.stdout.write(prompt);
        process.stdin.setRawMode?.(true);
        let buf = "";
        const onData = (chunk) => {
          const s = chunk.toString();
          if (s === "\r" || s === "\n" || s === "\r\n") {
            process.stdin.removeListener("data", onData);
            process.stdin.setRawMode?.(false);
            process.stdout.write("\n");
            resolve(buf);
            return;
          }
          if (s === "\x7f" || s === "\b") {
            buf = buf.slice(0, -1);
          } else {
            buf += s;
          }
        };
        process.stdin.on("data", onData);
        return;
      }
      iface.question(prompt, (answer) => {
        iface.close();
        resolve(answer || def || "");
      });
    });
  };
}
