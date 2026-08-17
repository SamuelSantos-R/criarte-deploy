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
│       ├── detect.mjs       # detectBaseInfo() — base estrutural + dica de categoria por conteúdo
│       ├── sections.mjs     # listSections()/disableSections() — toggle de seções pré-deploy
│       └── spinner.mjs      # Classe Spinner (animação terminal)
├── templates/
│   └── convite-token/       # Scaffold do comando `tokenizar` (guest.tsx + guests.example.json)
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

### Nº de pessoas por convite (`pax`)
Linha do `.txt` aceita `Nome|N` (`parseNamePax` no adapter `convite-token`): o
convite passa a valer pra N pessoas. No `guests.json`, pax 1 fica string
(`"Prima Ana"`) e pax > 1 vira `{ name, pax }` — `guestName`/`guestPax` leem os
dois formatos, então listas geradas antes do pax continuam válidas (e o
`guest.tsx` do template expõe `guest.pax`). Regras do merge: linha **sem** `|N`
preserva o pax publicado (não zera), `|N` diferente do que está no ar só atualiza
o número (token intacto), `Antigo => Novo|N` renomeia e ajusta o pax de uma vez.
`|` seguido de não-número vira aviso e cai pra 1. O `-links.txt` marca `(N pessoas)`
no fim da linha e o fallback offline (`loadLocalLinks`) lê isso de volta.
Testes: `tests/convite-token-pax.test.mjs` (`npm test`).

### Detecção de base + sugestão de categoria (`src/lib/detect.mjs`)
`detectBaseInfo(dir)` combina duas camadas antes do deploy:
- **Base estrutural**: `rsvp` (markers d1/api criar-confirmacao) → `convite-token`
  (`guest.tsx` + `guests.example.json` ou `config.base`) → `casamento` (Next) →
  `generico`. `criarte.config.json` com `base` explícito tem prioridade.
- **Categoria por conteúdo** (`guessCategory`): varre até 120 arquivos de texto
  (≤200KB) procurando keywords (chá/chá-de-bebê/debutante/noivado/aniversário/
  casamento — chá antes de casamento). Os sites na VPS são build estático, sem
  markers de src, então a categoria é adivinhada por conteúdo, não por estrutura.
- Compõe `label` tipo "base de chá personalizada detectada". No deploy vira o
  header e `promptCategory(config, baseInfo)` pré-seleciona a sugestão (hint
  "sugerida pela base"), sempre permitindo escolher outra ou "✏️ Personalizado".

### Toggle de seções (`src/lib/sections.mjs`)
`maybeToggleSections(stagingDir)` (opt-in, só em TTY, pula com `CRIARTE_SKIP_SECTIONS`):
extrai os `<Componente/>` self-closing top-level do primeiro `return(...)` da home
(exclui infra: BackgroundParticles, EnvelopeLoader, MuteButton, etc), mostra num
multiselect e comenta no STAGING os desmarcados (`{/* <X/> — desativado… */}`).
Nunca mexe no source original; guard anti-nuke não deixa desativar todas.

### Comando `tokenizar` (Feature A — `cmdTokenizar`)
Injeta a base `convite-token` num convite normal (scaffold determinístico):
copia `templates/convite-token/guest.tsx`→`src/lib`, `guests.example.json`→`public/`,
grava/mescla `criarte.config.json` com `base: convite-token`. Recusa se já é
personalizado (sem `--force`) ou se a base é rsvp/generico. Depois, o deploy normal
com o `.txt` de convidados gera os tokens.

**Ligação do RSVP é MANUAL (o CLI NÃO edita código do convite).** Decisão firme:
um CLI externo mexendo num componente RSVP que ele não escreveu quebra convites
(gera `guests.json` errado, clobber de estado, API de `useGuest` divergente). O
`cmdTokenizar` só copia o scaffold determinístico e **imprime** o passo manual (2
linhas: `import { useGuest }` + `const guest = useGuest()`), calculando o caminho de
import relativo (`relativeImportPath`) e apontando o componente RSVP encontrado
(`findRsvpComponent`). Quem embute a tokenização é a IDE (VS Code) na hora de
construir o convite, não o CLI.

### Fluxo de deploy (`cmdDirectDeploy`)
1. Parse de args (categoria/slug, --no-wait, --subdomain); categoria/slug interativos usam setinha
2. Detecção de projeto Next.js + `detectBaseInfo` (header + sugestão de categoria)
3. Análise de arquivos (contagem, tamanho)
4. Expiração
5. Toggle de seções (opt-in) + Confirmação
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
| `criarte-deploy` | Deploy direto (detecta base, sugere categoria, toggle de seções) |
| `criarte-deploy rsvp/adelia-alvaro` | Deploy com slug explícito |
| `criarte-deploy tokenizar [pasta]` | Injeta a base convite-token num convite normal |
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
