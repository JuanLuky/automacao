# Configurando o projeto numa máquina nova

Roteiro pra colocar o Maré de pé do zero — clonou o repo, e agora? Siga na ordem. Se algo já foi feito, pule.

> Histórico de decisões e convenções de arquitetura ficam em [`CLAUDE.md`](./CLAUDE.md) — este arquivo é só o passo a passo operacional.

## 0. Pré-requisitos

- Docker + Docker Compose (v2, plugin `docker compose`, não `docker-compose` v1)
- Node.js 20.x e npm (mesma versão usada nos `Dockerfile` de backend/frontend — `node:20-bookworm-slim`)
- Nenhum outro serviço já ocupando as portas: `5433` (Postgres), `6379` (Redis), `8089` (Evolution API), `5678` (n8n), `5050` (pgAdmin), `3000` (backend), `3001` (frontend)

## 1. Variáveis de ambiente

**Nenhum `.env` vem no git** (cada pasta tem seu próprio `.gitignore` cobrindo isso — não existe `.env.example` versionado hoje). Criar os três abaixo do zero.

### `.env` (raiz — alimenta `docker-compose.yml` + `docker-compose.app.yml`)

```bash
# Postgres
POSTGRES_DB=postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=            # trocar

# Evolution API
EVOLUTION_API_KEY=            # gerar uma chave forte — precisa ser IDÊNTICA em backend/.env e na credencial HTTP do n8n
EVOLUTION_SERVER_URL=http://localhost:8089

# n8n (login básico do editor)
N8N_USER=
N8N_PASSWORD=

# pgAdmin
PGADMIN_EMAIL=
PGADMIN_PASSWORD=

# Backend (usado pelo docker-compose.app.yml)
JWT_SECRET=                   # gerar com: openssl rand -hex 32
JWT_EXPIRES_IN=7d

# Frontend (build args — embutidos no bundle em build-time, exigem rebuild se mudar)
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=http://localhost:3000
NEXT_PUBLIC_EVOLUTION_INSTANCE=           # precisa bater com o nome da instância criada no passo 5
```

### `backend/.env` (usado só se rodar o backend nativo, fora do container)

```bash
DATABASE_URL=postgresql://postgres:SUA_SENHA@localhost:5433/atendimento_db
TYPEORM_SYNCHRONIZE=false

JWT_SECRET=                   # mesmo valor do .env da raiz
JWT_EXPIRES_IN=7d

EVOLUTION_API_URL=http://localhost:8089
EVOLUTION_API_KEY=            # idêntica ao .env da raiz

PORT=3000
```

### `frontend/.env.local` (usado só se rodar o frontend nativo, `npm run dev`)

```bash
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=http://localhost:3000
NEXT_PUBLIC_EVOLUTION_INSTANCE=
```

## 2. Instalar dependências

```bash
cd backend && npm install
cd ../frontend && npm install
```

Só necessário se for rodar nativo (`start:dev`/`dev`) em algum momento — os containers instalam as próprias dependências no build. Mas rodar aqui também não faz mal e deixa pronto pra debugar localmente depois.

## 3. Subir a infraestrutura

**Ordem importa.** `docker-compose.app.yml` referencia a rede `automacao_atendimento-network` como `external: true` — ela só existe depois que `docker-compose.yml` sobe sozinho pela primeira vez. Subir os dois arquivos juntos numa máquina nova falha com:

```
network automacao_atendimento-network declared as external, but could not be found
```

Passo a passo correto:

```bash
# 1. Infra base primeiro (cria a rede + Postgres, Redis, Evolution API, n8n, pgAdmin)
docker compose -f docker-compose.yml up -d

# 2. Backend + frontend containerizados, na mesma rede
docker compose -f docker-compose.yml -f docker-compose.app.yml up -d --build backend frontend
```

Depois da primeira vez, pode subir tudo junto normalmente (`docker compose -f docker-compose.yml -f docker-compose.app.yml up -d`) — a rede já existe.

Conferir que todos os 7 containers estão `Up`:

```bash
docker compose -f docker-compose.yml -f docker-compose.app.yml ps
```

## 4. Migrations + seed (backend nativo, fora do container)

Migrations rodam sempre nativas, mesmo com backend containerizado — a imagem de produção não carrega `ts-node`/devDependencies.

```bash
cd backend
npm run migration:run
npm run seed
```

O seed cria: 5 departamentos padrão (RH, Financeiro, Contabilidade, TI, Comercial), usuário `admin@empresa.com` / `admin123` (**trocar a senha depois do primeiro login**), horário de funcionamento padrão, rótulos de papéis (N1/N2/N3), mensagens automáticas e respostas rápidas padrão.

## 5. Configurar a Evolution API

1. Acessar `http://localhost:8089`, autenticar com `EVOLUTION_API_KEY`.
2. Criar uma instância — o **nome dela** precisa bater com `NEXT_PUBLIC_EVOLUTION_INSTANCE` no `.env`.
3. Escanear o QR Code com o WhatsApp que vai atender.
4. **Configurar o webhook por instância** (Manager → instância → Events → Webhook): URL `http://n8n:5678/webhook/whatsapp`.
   - **Não habilitar `WEBHOOK_GLOBAL_*`** junto com isso — duplica mensagem (o `docker-compose.yml` já vem com `WEBHOOK_GLOBAL_ENABLED: "false"`, não mexer).

## 6. Configurar o n8n

1. Acessar `http://localhost:5678`, login com `N8N_USER`/`N8N_PASSWORD`.
2. Importar `fluxo-completo-com-backend.json` (raiz do repo).
3. **Reconfigurar credenciais** — não vêm no JSON exportado:
   - Redis (banco `0`, usado pro debounce de 6s de mensagens fragmentadas)
   - SMTP (usado só pro e-mail de alerta do healthcheck de conexão)
   - Header/API key da Evolution API nos nós HTTP Request — mesmo valor de `EVOLUTION_API_KEY`
4. Conferir a URL que os nós HTTP Request usam pra chamar o backend — o JSON exportado usa `http://host.docker.internal:3000` (backend rodando nativo, fora do Docker, no ambiente onde foi originalmente montado):
   - Se o backend também estiver containerizado (passo 3 acima), ele já está na mesma rede Docker que o n8n — pode trocar por `http://backend:3000` nos nós, ou manter `host.docker.internal:3000` se o Docker desta máquina resolver esse hostname automaticamente (Docker Desktop resolve; Docker Engine puro no Linux pode exigir `extra_hosts: ["host.docker.internal:host-gateway"]` no serviço `n8n` do `docker-compose.yml`).
5. Ativar (`Active`) o workflow.

## 7. Teste ponta a ponta

Mandar uma mensagem de um número de teste pro WhatsApp conectado → deve chegar o menu de setores → escolher um setor → conversa deve aparecer em `/atendimentos` no painel (`http://localhost:3001`, login `admin@empresa.com`/`admin123`).

## Problemas conhecidos (já apareceram antes)

- **`credsStore` do Docker CLI**: se `docker compose` reclamar de credencial, checar `~/.docker/config.json` — remover a chave `"credsStore": "desktop"` se o binário `docker-credential-desktop` não estiver no PATH.
- **Porta 5432 ocupada**: por isso o Postgres do compose publica em `5433:5432` no host — se outra máquina não tiver conflito, pode simplificar pra `5432:5432`, mas aí ajustar todos os `.env` que apontam `5433`.
- **`NEXT_PUBLIC_*` não muda depois de build**: são build args, embutidos no bundle. Mudou algum? Precisa `docker compose ... build frontend` de novo, restart sozinho não pega.
