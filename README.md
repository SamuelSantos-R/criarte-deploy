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
1. Perguntar a **categoria** (ex: `casamento`)
2. Perguntar o **nome** do site (ex: `joao-maria`)
3. Mostrar um resumo e pedir confirmação
4. Subir tudo pro GitHub automaticamente
5. Mostrar o link onde o site vai aparecer em ~5min

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
5. O CI do GitHub Actions builda + deploya na Discloud automático

A pessoa nunca vê o monorepo. Só precisa do site finalizado e do CLI.
