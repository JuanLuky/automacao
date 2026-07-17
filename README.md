# Infra — Fase 0: Postgres + Evolution API + n8n

Este `docker-compose.yml` sobe toda a infraestrutura de apoio do projeto de atendimento WhatsApp: um Postgres compartilhado (com 3 bancos separados), Redis (exigido pela Evolution API), a própria Evolution API, o n8n e opcionalmente um pgAdmin para inspecionar os bancos.

O backend NestJS **não está aqui** — ele roda fora do Docker (ou você adiciona depois), conectando no `atendimento_db` já criado por este compose.

## Como usar

1. Copie o arquivo de variáveis:
   ```bash
   cp .env.example .env
   ```
2. Abra o `.env` e troque **todas** as senhas/chaves marcadas como "troque".
3. Dê permissão de execução ao script de inicialização do banco:
   ```bash
   chmod +x init-db.sh
   ```
4. Suba os containers:
   ```bash
   docker compose up -d
   ```
5. Acompanhe os logs até tudo subir:
   ```bash
   docker compose logs -f
   ```

## O que cada serviço expõe

| Serviço | URL local | Para quê |
|---|---|---|
| Postgres | `localhost:5432` | 3 databases: `evolution_db`, `n8n_db`, `atendimento_db` |
| Redis | `localhost:6379` | cache da Evolution API |
| Evolution API | `http://localhost:8080` | painel/API do WhatsApp |
| n8n | `http://localhost:5678` | editor de fluxos (login = `N8N_USER`/`N8N_PASSWORD` do `.env`) |
| pgAdmin | `http://localhost:5050` | inspecionar os bancos (opcional — pode remover do compose se não quiser) |

## Próximos passos depois de subir

1. **Criar a instância no Evolution API**: acesse `http://localhost:8080`, autentique com a `EVOLUTION_API_KEY`, crie uma instância e escaneie o QR Code com o WhatsApp de teste.
2. **Conferir o webhook**: a Evolution API já está configurada (`WEBHOOK_GLOBAL_URL`) para mandar todo evento de mensagem recebida para `http://n8n:5678/webhook/whatsapp`. Esse endpoint só existe depois que você criar o workflow correspondente no n8n com um nó "Webhook" nesse path.
3. **Conectar o backend NestJS**: quando for configurar o `.env` do backend (Fase 1), aponte a `DATABASE_URL` para:
   ```
   postgresql://postgres:SUA_SENHA@localhost:5432/atendimento_db
   ```

## Por que um Postgres só, com 3 bancos, em vez de 3 containers de banco

Simplicidade operacional: em um MVP, rodar 3 instâncias de Postgres separadas só adiciona overhead de memória e de backup sem benefício real. Isolar por **database** (não por schema) já garante que a Evolution API, o n8n e o seu domínio nunca colidem em nome de tabela, e cada um pode ser migrado/versionado de forma independente. Se um dia a escala justificar, é só apontar `DATABASE_CONNECTION_URI` da Evolution API para um Postgres dedicado — nada no domínio muda.

## Observação sobre a imagem da Evolution API

A imagem usada é `evoapicloud/evolution-api:v2.1.1` (build oficial mais recente encontrada na documentação da Evolution Foundation no momento em que este compose foi montado). Antes de ir para produção, vale conferir se há uma versão mais nova em <https://github.com/EvolutionAPI/evolution-api> e travar a tag explicitamente (evite `:latest` em produção, para não tomar um breaking change sem querer).
