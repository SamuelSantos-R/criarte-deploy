# Criarte Deploy — Fluxo de Deploy

## Fluxo completo (cmdDirectDeploy)

### 1. Parse de argumentos
- Extrai `--no-wait`, `--subdomain <valor>`
- Detecta categoria e slug dos args posicionais
- Se o arg tem `/` (ex: `rsvp/adelia-alvaro`), auto-detecta categoria e slug

### 2. Detecção de projeto
- Verifica `package.json` → dependência `next` → projeto Next.js
- Se não for Next.js, procura `out/` ou `public/` (site estático)

### 3. Análise
- Conta arquivos e tamanho total no diretório de build
- Exclui `node_modules`, `.next`, `out`, `.git`

### 4. Expiração
- Pergunta data de expiração do site (opcional)
- Opções: sem expiração, 1/3/6/12 meses, data específica

### 5. Confirmação
- Mostra resumo: slug, categoria, tamanho, expiração
- Confirmação `s/N`

### 6. Staging
- Cria diretório temporário
- Copia arquivos excluindo: `node_modules`, `.next`, `out`, `.git`, `.turbo`, `.vscode`, `.idea`, `.cache`, `__pycache__`

### 7. Orphan cleanup
- Escaneia `public/` por arquivos não referenciados no source code
- Se encontrar, lista e pergunta se quer remover

### 8. Adapter prepare
- Detecta qual base (casamento, rsvp, generico):
  1. `criarte.config.json` com `"base"` explícito
  2. Heurísticas (d1.ts, criar-confirmacao para RSVP)
- **RSVP**: consulta servidor, mostra email existente, pergunta manter/alterar
- **RSVP**: reescreve fetchs do front de `/api/criar-confirmacao` → `/api/rsvp/criar`

### 9. Remove server-side
- Remove API routes e libs server-only (definido pelo adapter)
- Exibe lista do que foi removido

### 10. R2 upload (se configurado)
- Assets >100KB em `public/`
- Upload via AWS SDK para Cloudflare R2
- Rewrite de referências no source code
- Remove arquivos locais já no R2

### 11. Envio
- **Rsync** (preferido): `rsync -az --partial --delete` via SSH
- **HTTP zip**: compacta e POST multipart pra `/api/sites/upload`

### 12. Build trigger
- **Rsync**: HTTP POST pra `/api/sites/build-from-path` na VPS
- **HTTP zip**: build é assíncrono no servidor, retorna `buildId`

### 13. Monitor (sem `--no-wait`)
- Poll `/api/builds/status?buildId=...` a cada 5s
- Aguarda status `done` ou `failed`
- Depois de `done`, verifica 200 OK na URL final

### 14. Resultado
- Mostra URL final: `https://criartedesing.ao/<slug>`
- Se tem subdomínio: `https://<subdominio>`

---

## Build no servidor

O servidor recebe o source e faz o build em background:

1. Extrai zip / lê diretório do rsync
2. Detecta se é site estático (`index.html`) ou Next.js (`package.json`)
3. **Next.js**: injeta `next.config.js` com `output: "export"`, `basePath: "/<slug>"`
4. `npm install --include=dev` (120s timeout)
5. `npx next build` (300s timeout)
6. Copia `out/` pra `/data/sites/<slug>/`
7. R2 upload de assets >100KB (via curl, 120s timeout)
8. Path rewrite (adiciona basePath em refs absolutas)
9. Atualiza registry (`sites-registry.json`) e config (`config/sites.json`)
10. Escreve `site.json` com metadata

---

## Como adicionar uma nova base

### 1. Criar adapter
```js
// src/adapters/minha-base.mjs
import { BaseAdapter } from "./base.mjs";
import { existsSync } from "node:fs";
import { join } from "node:path";

export class MinhaBaseAdapter extends BaseAdapter {
  name = "minha-base";

  detect(stagingDir) {
    const cfg = join(stagingDir, "criarte.config.json");
    if (existsSync(cfg)) {
      const c = JSON.parse(readFileSync(cfg, "utf8"));
      if (c.base === "minha-base") return true;
    }
    // Heurística extra aqui
    return existsSync(join(stagingDir, "src", "meu-arquivo-especial.ts"));
  }

  getRemovePatterns() {
    return ["app/api", "src/app/api", "src/lib/server-only.ts"];
  }

  async prepare(stagingDir, fullSlug, config, targetUrl) {
    // Lógica específica da base
    return true;
  }

  getMessages() {
    return { deployPhase: "🚀 Minha Base", baseLabel: "Minha Base detectada" };
  }
}
```

### 2. Registrar no registry
```js
// src/adapters/registry.mjs
import { MinhaBaseAdapter } from "./minha-base.mjs";

const adapters = [
  new MinhaBaseAdapter(),   // ← adicionar antes do RsvpAdapter
  new RsvpAdapter(),
  new CasamentoAdapter(),
  new GenericoAdapter(),
];
```

### 3. No projeto, criar criarte.config.json
```json
{
  "base": "minha-base",
  "siteName": "Nome do Site"
}
```
