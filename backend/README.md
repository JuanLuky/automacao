# Backend — Sistema de Atendimento WhatsApp (NestJS)

## Pré-requisitos

- Node.js 20+
- A infra da Fase 0 já rodando (`docker compose up -d` na pasta `atendimento-whatsapp-infra`) — este backend depende do Postgres (`atendimento_db`) e da Evolution API já configurados lá.

## Setup

```bash
npm install
cp .env.example .env
```

Abra o `.env` e ajuste:

- `DATABASE_URL` → troque a senha pela mesma `POSTGRES_PASSWORD` que você definiu no `.env` da infra.
- `JWT_SECRET` → qualquer string aleatória forte.
- `EVOLUTION_API_KEY` → a mesma chave (já trocada) do `.env` da infra.
- `EVOLUTION_API_URL` → `http://localhost:8080` (se o backend roda fora do Docker, o que é o caso por padrão nesse setup).

## Criando o banco (schema) e os dados iniciais

O schema é criado por migrations do TypeORM (`src/database/migrations/`), não por `synchronize` (fica sempre `false` em `app.module.ts`).

1. Rode as migrations pra criar as tabelas:
   ```bash
   npm run migration:run
   ```
2. Em outro terminal, rode o seed (cria os 5 departamentos e um usuário admin):
   ```bash
   npm run seed
   ```
   Login gerado: `admin@empresa.com` / senha `admin123` — **troque essa senha assim que possível** (ainda não existe endpoint de "trocar senha" no MVP; se precisar, dá pra gerar um novo hash com bcrypt e fazer um `UPDATE` direto no banco por enquanto).

## Rodando

```bash
npm run start:dev
```

A API sobe em `http://localhost:3000`.

## Testando rapidamente

```bash
# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@empresa.com","senha":"admin123"}'

# Listar departamentos (pega o token do passo anterior se quiser testar rotas protegidas)
curl http://localhost:3000/departments
```

## Conectando com o n8n (fecha o fluxo completo)

Agora que o backend existe, os nós HTTP Request do workflow do n8n precisam ser atualizados para chamar de verdade os endpoints abaixo, em vez de só mandar texto fixo pela Evolution API:

| O que o n8n precisa fazer | Endpoint |
|---|---|
| Checar se já existe conversa ativa | `GET http://host.docker.internal:3000/conversations/by-phone/:telefone` |
| Criar conversa quando cliente escolhe o setor | `POST http://host.docker.internal:3000/conversations` |
| Repassar mensagem de conversa já existente | `POST http://host.docker.internal:3000/conversations/:id/messages` (com `origem: "cliente"`) |

> **Atenção (Linux):** `host.docker.internal` só funciona nativamente no Docker Desktop (Mac/Windows). No Linux, é preciso adicionar ao serviço `n8n` do `docker-compose.yml` da infra:
> ```yaml
> extra_hosts:
>   - "host.docker.internal:host-gateway"
> ```
> depois recriar o container (`docker compose up -d --force-recreate n8n`).

Os IDs de departamento usados no `POST /conversations` são os `id` (UUID) retornados por `GET /departments` — não o número "1 a 5" do menu. O workflow do n8n vai precisar mapear "1" → UUID do RH, etc. (uma opção simples: chamar `GET /departments` uma vez e guardar o mapeamento código→UUID num nó Set, já que os `codigo` que o seed criou são `RH`, `FIN`, `CONT`, `TI`, `COM`).

## Endpoints disponíveis

Veja a tabela completa no documento de arquitetura (`arquitetura-atendimento-whatsapp.md`), seção 7.
