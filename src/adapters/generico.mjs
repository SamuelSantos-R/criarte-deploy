// ============================================================================
// GENÉRICO ADAPTER — Fallback para qualquer projeto Next.js não reconhecido
// ============================================================================
import { BaseAdapter } from "./base.mjs";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export class GenericoAdapter extends BaseAdapter {
  name = "generico";

  detect(stagingDir) {
    const pkgPath = join(stagingDir, "package.json");
    if (!existsSync(pkgPath)) return false;
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
    ];
  }

  getMessages() {
    return {
      deployPhase: "📦 Publicar site",
      summaryLabel: "Site",
    };
  }
}
