// ============================================================================
// CASAMENTO ADAPTER — Base de site de casamento (padrão)
// ============================================================================
import { BaseAdapter } from "./base.mjs";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export class CasamentoAdapter extends BaseAdapter {
  name = "casamento";

  detect(stagingDir) {
    const configPath = join(stagingDir, "criarte.config.json");
    if (existsSync(configPath)) {
      try {
        const cfg = JSON.parse(readFileSync(configPath, "utf8"));
        if (cfg.base === "casamento") return true;
      } catch {}
    }
    const pkgPath = join(stagingDir, "package.json");
    if (!existsSync(pkgPath)) return false;
    if (existsSync(join(stagingDir, "src", "lib", "d1.ts"))) return false;
    if (existsSync(join(stagingDir, "src", "app", "api", "criar-confirmacao"))) return false;
    if (existsSync(join(stagingDir, "app", "api", "criar-confirmacao"))) return false;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      return !!(pkg.dependencies?.next || pkg.devDependencies?.next);
    } catch {
      return false;
    }
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

  getMessages() {
    return {
      deployPhase: "📦 Publicar site",
      summaryLabel: "Site",
    };
  }
}
