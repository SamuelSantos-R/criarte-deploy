# Criarte Deploy CLI — AI Context

## Arquitetura

### Estrutura de diretórios
```
criarte-deploy/
├── cli.mjs                  # Entry point + router + comandos
├── src/
│   ├── adapters/            # Sistema de adapters por base
│   │   ├── base.mjs         # Classe abstrata BaseAdapter
│   │   ├── casamento.mjs    # Adapter base casamento
│   │   ├── rsvp.mjs         # Adapter base RSVP
│   │   ├── convite-token.mjs# Convite com token único por convidado (guests.json)
│   │   ├── generico.mjs     # Fallback Next.js genérico
│   │   └── registry.mjs     # detectAdapter() + ordem de detecção
│   ├── ui/
│   │   └── prompts.mjs      # Wrapper @clack/prompts (select/text/confirm por setinha)
│   └── lib/
│       ├── config.mjs       # Constantes, cores, helpers (ok, info, warn, err, boxed, section, ask, screenPhase)
│       └── spinner.mjs      # Classe Spinner (animação terminal)
├── banner.mjs               # ASCII banner
└── package.json
```

### Sistema de Adapters

Cada base de site implementa `BaseAdapter`:

```js
class BaseAdapter {
  name = "generico";                          // Nome da base
  detect(stagingDir) { return false; }         // Detecta se projeto é desta base
  async prepare(stagingDir, slug, config, url) // Prepara staging (RSVP: provisiona, reescreve)
  getRemovePatterns() { return []; }           // Arquivos/dirs server-side a remover
  getRequiredEnv() { return []; }             // Env vars necessárias
  getMessages() { return {}; }                 // Textos customizados no CLI
}
```

### Ordem de detecção
1. `criarte.config.json` com `"base": "rsvp|casamento|..."` (explícito)
2. Heurísticas: rsvp → casamento → generico
3. Fallback: `BaseAdapter` (sem regras especiais)

### Como adicionar uma nova base
1. Criar `src/adapters/nova-base.mjs` estendendo `BaseAdapter`
2. Implementar `detect()`, `getRemovePatterns()`, `getMessages()`
3. Registrar em `registry.mjs` no array `adapters`
4. Se a base precisa de preparação especial, implementar `prepare()`

### Seleção por setinha (@clack via `src/ui/prompts.mjs`)
- **Categoria** (`promptCategory` em `cli.mjs`): busca as categorias já usadas no
  registry (`/api/sites/registry`) e mostra num `select` (↑↓). Opção "➕ Nova
  categoria…" cai num `text` validado por `^[a-z0-9][a-z0-9-]*$`. Fora de TTY ou
  offline → volta pro texto cru (`ask`). Nada trava CI.
- **Lista de convidados** (`resolveGuestFile`/`listGuestTxtCandidates` no adapter
  `convite-token`): escaneia TODOS os `.txt` da raiz do projeto (não só os 4 nomes
  canônicos). Ignora arquivos de saída (`convidados-<slug>-links/novos.txt`) e
  qualquer `.txt` que já seja de links (`?t=`/URL — usar um `-links.txt` como
  entrada corrompeu tokens no passado). 1 candidato → usa direto; vários → `select`
  com contagem de linhas; nenhum → prompt de caminho. Ordem: canônicos primeiro,
  depois pela lista com mais linhas. Flag `--guests-file` continua tendo prioridade.

### Fluxo de deploy (`cmdDirectDeploy`)
1. Parse de args (categoria/slug, --no-wait, --subdomain); categoria/slug interativos usam setinha
2. Detecção de projeto Next.js
3. Análise de arquivos (contagem, tamanho)
4. Expiração
5. Confirmação
6. **Staging**: cópia pro temp dir
7. **Orphan cleanup**: detecta e remove assets não referenciados
8. **Adapter prepare**: detecta base, provisiona RSVP se necessário, reescreve paths
9. **Remove server-side**: API routes e libs (definido pelo adapter)
10. **R2 upload**: assets >100KB pro Cloudflare R2
11. **Envio**: rsync (se configurado) ou HTTP zip POST
12. **Monitor**: poll build status, health check

### Configuração do projeto (`criarte.config.json`)
Opcional no diretório do site:
```json
{
  "base": "rsvp",
  "siteName": "Adelia & Alvaro",
  "framework": "next",
  "assetsStrategy": "r2"
}
```

### Configuração local (`~/.criarte-deploy/config.json`)
```json
{
  "github_token": "...",
  "admin_api_token": "...",
  "panel_url": "https://criartedesing.ao",
  "rsvp_admin_token": "...",
  "resend_api_key": "...",
  "r2": { "endpoint": "...", "bucket": "...", "publicUrl": "...", "accessKeyId": "...", "secretAccessKey": "..." },
  "rsync": { "host": "89.167.110.87", "user": "root", "path": "/data/builds" }
}
```

### Comandos
| Comando | Função |
|---------|--------|
| `criarte-deploy` | Deploy direto (detecta categoria/slug) |
| `criarte-deploy rsvp/adelia-alvaro` | Deploy com slug explícito |
| `criarte-deploy rsvp-setup [slug]` | Configurar RSVP (cria/atualiza no servidor) |
| `criarte-deploy resend-setup` | Configurar Resend API key |
| `criarte-deploy panel` | Configurar URL/token do painel |
| `criarte-deploy login` | Login GitHub + painel |
| `criarte-deploy r2-setup` | Configurar Cloudflare R2 |
| `criarte-deploy ssh-setup` | Configurar SSH/rsync |
| `criarte-deploy doctor` | Diagnóstico completo |
| `criarte-deploy list` | Listar sites publicados |
| `criarte-deploy rm <slug>` | Remover site |
| `criarte-deploy check` | Análise pré-deploy |

### Servidor (sistema-multi-site)
- Next.js 15 standalone, Docker na Hetzner (89.167.110.87)
- Nginx porta 80, Cloudflare TLS
- SQLite pra RSVP (`/data/rsvp.db`)
- Sites servidos de `/data/sites/`
- Build queue em `/data/.build-queue/`
- Middleware com roteamento dinâmico por slug (cache 30s)

### Tokens
| Token | Onde | Uso |
|-------|------|-----|
| `ADMIN_API_TOKEN` | Container env + CLI config | Deploy, upload, build, remove |
| `MULTISITE_ADMIN_TOKEN` | Container env + CLI config (`rsvp_admin_token`) | RSVP provision CRUD |
| `SESSION_SECRET` | Container env | JWT RSVP sessions |
| `RESEND_API_KEY` | Container env (global) + CLI config (opcional) | Emails RSVP |

### Problemas conhecidos e soluções
| Problema | Causa | Solução |
|----------|-------|---------|
| fetch failed no rsync | HTTPS na VPS (só HTTP:80) | deployViaRsync usa HTTP direto |
| Fonte CORS | Bucket R2 sem CORS | Configurar CORS no dashboard Cloudflare |
| Botão confirmar 400 | `/api/rsvp/criar` não detectava slug por Referer | Adicionado slugFromReferer fallback |
| Site novo 404 | Rewrites compilados em build time | Middleware faz roteamento dinâmico |
