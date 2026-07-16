# 🌸 Criarte Deploy

CLI pra publicar sites no sistema multi-site da Criarte. Sem precisar baixar o repositório do `multisite-system`.

---

## Instalação (no PC dela, uma única vez)

### Pré-requisitos
- **Node.js 18+** instalado (baixar em https://nodejs.org se não tiver)
- **Git** instalado (já vem no Mac; no Windows baixar em https://git-scm.com)

### Passo 1 — Instalar o CLI

```bash
npm install -g github:SamuelSantos-R/criarte-deploy
```

> ⚠️ Substitua `SamuelSantos-R/criarte-deploy` pelo nome real do repositório depois que você subir.

### Passo 2 — Fazer login (só na primeira vez)

```bash
criarte-deploy login
```

O CLI vai te dar um link pra criar um **token do GitHub**, é só seguir o passo-a-passo na tela. Demora 1 minuto.

✅ **Pronto!** A partir de agora ela pode publicar qualquer site finalizado.

---

## Uso do dia-a-dia

Quando terminar um site novo (ex: `~/Desktop/joao-maria`), só fazer:

```bash
cd ~/Desktop/joao-maria
criarte-deploy
```

O CLI vai:
1. Perguntar a **categoria** — mostra as que já existem numa lista de **setinha** (↑↓ + Enter), ou escolha "➕ Nova categoria…" pra digitar uma nova
2. Perguntar o **nome** do site (ex: `joao-maria`)
3. Mostrar um resumo e pedir confirmação
4. Subir tudo pro GitHub automaticamente
5. Mostrar o link onde o site vai aparecer em ~5min

### Convites com token por convidado (base `convite-token`)

Se o projeto usa tokenização por convidado, o CLI procura sozinho os arquivos
`.txt` da pasta (não só nomes fixos como `convidados.txt`):

- **1 arquivo `.txt`** → usa ele direto.
- **Vários `.txt`** → mostra uma lista de **setinha** pra escolher qual é a lista
  de convidados (com a contagem de linhas de cada um pra não errar). Também dá pra
  escolher "Digitar outro caminho…" ou "Nenhum — subir só em prévia".
- **Nenhum `.txt`** → pede o caminho na mão (vazio = prévia sem tokens).

Os arquivos de saída (`convidados-<slug>-links.txt` / `-novos.txt`) e ruído como
`robots.txt` são ignorados automaticamente — não aparecem na lista.

### Comandos disponíveis

| Comando | O que faz |
|---|---|
| `criarte-deploy login` | Configura o token (só 1ª vez) |
| `criarte-deploy` | Publica o site da pasta atual (interativo) |
| `criarte-deploy <cat> <nome>` | Publica direto sem perguntar |
| `criarte-deploy list` | Mostra todos os sites publicados |
| `criarte-deploy help` | Mostra ajuda |

### Exemplo direto

```bash
cd ~/Desktop/joao-maria
criarte-deploy casamento joao-maria
```

---

## Configuração

A config (token) fica salva em `~/.criarte-deploy/config.json` (permissão `600`, só o usuário lê).

Pra trocar o token ou conta: `criarte-deploy login` novamente.

---

## Como funciona por baixo

1. Clona o `multisite-system` numa pasta temporária do sistema (`/tmp/...`)
2. Copia a pasta do site pra `sites/<categoria>/<nome>/` (ignorando `node_modules`, `.next`, `.env`, etc)
3. Commita + faz push usando o token salvo
4. Apaga o temp
5. **Discloud + Coolify** monitoram o repo 24h, detectam o push, buildam e fazem restart automático
6. O CLI polla a URL final até ela responder 200 (ou 4min fixos pra re-deploys)

A pessoa nunca vê o monorepo. Só precisa do site finalizado e do CLI.
