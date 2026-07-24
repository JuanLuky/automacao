# CLAUDE.md

Contexto do projeto para o Claude Code. Leia isso antes de sugerir qualquer mudança — ele explica as decisões de arquitetura já tomadas, pra evitar sugestões que vão contra o que já foi definido de propósito.

## O que é o projeto

Sistema de atendimento via WhatsApp com **um único número** para toda a empresa. Cliente manda mensagem → recebe um menu de departamentos → escolhe um setor → atendimento entra na fila do setor → um atendente assume → conversa acontece pelo mesmo número, com histórico salvo. MVP deliberadamente simples: sem CRM, sem IA, sem chatbot complexo.

## Stack

| Camada | Tecnologia |
|---|---|
| WhatsApp | Evolution API (self-hosted, Docker) |
| Orquestração de mensageria | n8n (self-hosted, Docker) |
| Backend | NestJS + TypeORM + PostgreSQL |
| Frontend | Next.js (App Router) + TypeScript + TailwindCSS |
| Tempo real | Socket.IO (gateway no backend, client no frontend) |
| Banco | PostgreSQL — 3 databases separados: `evolution_db`, `n8n_db`, `atendimento_db` |

## Estrutura de pastas / repositórios

```
atendimento-whatsapp-infra/   # docker-compose: Postgres, Redis, Evolution API, n8n, pgAdmin
backend/                      # NestJS — dono de toda a regra de negócio
frontend/                     # Next.js — painel do atendente
n8n-workflow/                 # JSON exportado do workflow do n8n (versionado à parte, importado manualmente na UI do n8n)
```

## Separação de responsabilidades (não mexer nisso sem motivo forte)

- **Evolution API**: só fala com o WhatsApp. Não tem regra de negócio.
- **n8n**: só orquestra mensageria — decide se é primeiro contato, manda o menu, repassa pro backend. **Não tem regra de negócio do domínio** (isso é proposital: manter o n8n "burro" mantém a lógica testável em um lugar só, o NestJS).
- **Backend (NestJS)**: dono do domínio. Cria atendimento, gerencia fila, valida transições de status, emite eventos via WebSocket, envia mensagens ao cliente através do adapter `integrations/evolution`.
- **Frontend (Next.js)**: interface do atendente. Não fala direto com a Evolution API — sempre passa pelo backend.

## Backend — estrutura e convenções

```
backend/src/
├── auth/            # login (JWT), guard, strategy
├── users/            # atendentes/admins
├── departments/       # setores (RH, Financeiro, Contabilidade, TI, Comercial)
├── conversations/     # entidade central — status: aguardando | em_atendimento | transferido | finalizado
├── messages/          # histórico + disparo de envio via Evolution quando origem = atendente
├── websocket/          # EventsGateway (Observer) — emite nova_conversa, conversa_atualizada, nova_mensagem, conversa_finalizada
├── integrations/evolution/  # Adapter — só essa classe conhece o formato do payload da Evolution API
└── database/           # data-source.ts (TypeORM) e seed.ts (departamentos padrão + admin)
```

Padrões em uso, e por quê (não adicionar padrões novos sem necessidade real — o projeto evita overengineering de propósito):

- **Repository** (via `@InjectRepository` do TypeORM) — isola query do domínio.
- **Service Layer** — toda regra de negócio (ex: "só assume conversa com status aguardando") vive aqui, nunca no controller.
- **DTOs + class-validator** — toda entrada é validada.
- **Adapter** (`EvolutionService`) — se trocar de provedor de WhatsApp, só essa classe muda.
- **Observer** (`EventsGateway`) — services emitem evento sem saber quem ouve.

### Colunas de data/hora — sempre `timestamptz`, nunca `timestamp`

Todas as colunas de data (`@CreateDateColumn`, `finalizado_em`, etc.) usam `type: 'timestamptz'` explicitamente. **Não voltar pro tipo padrão do TypeORM (`timestamp`, sem timezone)** — descoberto em 2026-07-24: com `timestamp`, o driver `pg` late o valor assumindo o timezone local do processo Node. Nesta máquina o backend roda nativo no Windows (fuso America/Sao_Paulo, UTC-3), então a API devolvia horários 3h adiantados (ex: mensagem das 8h35 aparecia como 11h35 no frontend). Com `timestamptz` o Postgres guarda o instante absoluto e o driver não depende do fuso do processo que está lendo.

### Mensagens — assinatura do atendente (2026-07-24)

`Message` tem `atendente_id` (nullable, preenchido só quando `origem = atendente`, sempre igual ao `atendente_id` da conversa no momento do envio — não existe seleção de atendente no payload, já que a rota também é chamada pelo n8n sem noção de usuário logado). `MessagesService.findByConversation`/`create` carregam a relação `atendente.departamento` pra isso.

Além de aparecer no painel (ver frontend), o texto enviado à Evolution API leva um prefixo `*Nome - CÓDIGO*\n` (negrito do WhatsApp) montado em `MessagesService.create` — só no texto que vai pro WhatsApp, o `mensagem` salvo em banco fica limpo. Objetivo: cliente saber com qual atendente do setor está falando. Testado via WhatsApp real em 2026-07-24, validado pelo usuário.

### `GET /users` e `POST /users` nunca retornam `senha_hash`

`UsersService.create`/`findAll` desestruturam o campo antes de devolver (`Omit<User, 'senha_hash'>`). Isso não existia originalmente — os dois métodos devolviam a entidade crua do TypeORM, vazando o hash bcrypt no JSON. Corrigido em 2026-07-24 ao construir a tela de gestão de usuários. **Manter esse padrão em qualquer novo método do `UsersService` que devolva `User`.**

### Rotas sem autenticação (proposital, não é bug)

`GET /conversations/by-phone/:telefone`, `POST /conversations` e `POST /conversations/:id/messages` são públicas porque o **n8n** as chama diretamente (ele não tem login de atendente). Isso é um trade-off de MVP — vale reforçar com uma chave compartilhada n8n↔backend antes de produção real com clientes.

### Ambiente

- `TYPEORM_SYNCHRONIZE=true` em desenvolvimento (cria tabelas automaticamente). **Trocar para migrations antes de produção.**
- Rodar `npm run seed` depois do primeiro start — cria os 5 departamentos (`codigo`: RH, FIN, CONT, TI, COM) e o usuário `admin@empresa.com` / `admin123` (senha a trocar).

## n8n — fluxo atual

Workflow ativo: `Atendimento WhatsApp - Fluxo Completo (com Backend)`.

```
Webhook (path: whatsapp, precisa estar Active para a URL de produção funcionar)
  → Extrai telefone/nome/texto/instance do payload da Evolution API
  → GET /conversations/by-phone/:telefone
       200 (já existe) → POST /conversations/:id/messages (origem: cliente)
       404 (não existe) → texto é 1-5?
            sim → GET /departments → mapeia código → POST /conversations → confirma no WhatsApp
            não → envia o menu de departamentos
```

Pontos de atenção conhecidos:
- Webhook da Evolution API é configurado **por instância** (Manager → Events → Webhook), apontando para `http://n8n:5678/webhook/whatsapp`. **Não habilitar também o `WEBHOOK_GLOBAL_*` no docker-compose ao mesmo tempo** — causa mensagens duplicadas.
- `host.docker.internal` (usado pelo n8n pra chamar o backend, que roda fora do Docker) exige `extra_hosts: ["host.docker.internal:host-gateway"]` no serviço `n8n` do docker-compose, no Linux.
- Node HTTP Request que retorna array (`GET /departments`) — o n8n separa cada elemento em um item diferente. Use `$('NomeDoNode').all().map(i => i.json)` pra reconstruir o array, nunca `$input.item.json` direto.

## Frontend — estrutura e convenções

```
frontend/src/
├── app/
│   ├── page.tsx              # só redireciona: autenticado → /fila, senão → /login
│   ├── login/
│   └── (painel)/              # route group protegido — layout.tsx faz o guard de auth
│       ├── layout.tsx          # topbar (nav, tema, sair) + DepartmentsProvider
│       ├── fila/                # lista por setor, abas aguardando/em_atendimento, botão Assumir
│       ├── conversas/[id]/       # chat: histórico, envio, Transferir, Finalizar
│       ├── dashboard/           # contadores por status (+ breakdown por setor pro admin)
│       └── usuarios/            # só admin — listar + criar atendentes/admins (ver seção própria abaixo)
├── components/
│   ├── LiveQueuePanel.tsx     # amostra ilustrativa na tela de login (dados locais, não é a fila real)
│   └── ui/                    # Button, Field, Select, StatusBadge
├── hooks/         # useAuth (contexto), useTheme, useDepartments (contexto), useSocketEvent
├── lib/           # api.ts (axios + interceptor de token), socket.ts (singleton do socket.io-client), time.ts
└── types/         # espelham as entidades do backend
```

Não existe `GET /conversations/:id` no backend — só `GET /conversations` (lista). A tela de chat busca a conversa via `getConversation(id)` em `lib/api.ts`, que filtra a lista completa client-side. Se um dia isso virar gargalo, a correção é adicionar o endpoint no backend, não replicar esse workaround em outro lugar.

### Regras de negócio no frontend

- **Atendente vê só a fila do próprio setor** (`user.departamento_id` do JWT). **Admin vê todas**, com um `Select` de setor (`user.role === 'admin'` libera o filtro). Essa lógica fica nas páginas de `fila` e `dashboard`, não espalhada pelos componentes.
- O backend **não filtra `GET /conversations` por papel/setor** — quem decide o que o atendente pode ver é o frontend, passando `departamento_id` como query param. Isso é uma confiança propositalmente client-side, coerente com o resto do MVP; não é reforçado no backend.
- Autenticação: token JWT salvo em `localStorage` (chave `atendimento.token`, ver `lib/api.ts`), aplicado via interceptor do axios. `localStorage` é apropriado aqui — é um app real fora do sandbox de artifacts.
- Tema claro/escuro via classe `.dark` no `<html>`, tokens de cor em `globals.css` (`--surface`, `--surface-raised`, `--text-primary` etc.), preferência salva em `localStorage`.
- Tempo real: um único socket (`lib/socket.ts`) compartilhado pela sessão. `useSocketEvent(evento, handler)` assina/desassina no ciclo de vida do componente sem exigir handler memoizado. Nas telas de fila/dashboard, qualquer um dos três eventos (`nova_conversa`, `conversa_atualizada`, `conversa_finalizada`) simplesmente **recarrega a lista** respeitando os filtros atuais — não há merge otimista de estado local. Foi a escolha deliberada pra manter a primeira integração ponta a ponta do WebSocket simples e correta, mesmo custando uma requisição extra por evento.

### Gestão de usuários — `/usuarios` (só admin, 2026-07-24)

Item de nav "Usuários" (`NAV_ADMIN` em `layout.tsx`) só aparece quando `user.role === 'admin'`; a própria página redireciona (`router.replace('/fila')`) se um não-admin acessar a URL direto. Isso é reforço **só no frontend** — igual ao filtro de setor em `fila`/`dashboard`, o backend (`UsersController`) não tem guard de `role: admin`, só `JwtAuthGuard`. Mesmo trade-off de MVP já documentado, não é descuido.

Tela lista usuários (`GET /users`) e tem formulário inline (padrão do "Transferir" em `conversas/[id]`) pra criar (`POST /users`): nome, e-mail, senha, setor (opcional), papel. `lib/api.ts` expõe `getUsers`/`createUser`, tipo `CreateUserPayload` em `types/index.ts`.

**Só criar, ainda não tem editar/inativar/excluir** — ver "Próximos passos".

### Identidade visual (não trocar sem motivo — já foi definida com o usuário)

Marca "Maré" (ícone `Waves` do lucide-react). Paleta em `tailwind.config.ts`: `abyss` (fundo escuro, `#07161F`→`#1B4356`), `tide` (cor de ação — assumir, enviar, online, `#14B8A6`/`#2DD4BF`), `mist` (hierarquia secundária/muted), mais `waiting` (âmbar, status aguardando), `active` (= tide, em atendimento), `closed` (cinza, finalizado) e `alert` (erros). Tipografia: Bricolage Grotesque (`--font-display`, headings) + Inter (`--font-body`, corpo). Tokens de superfície (`--surface`, `--surface-raised`, `--surface-sunken`, `--border`) ficam em `globals.css` e trocam de valor entre claro/escuro via classe `.dark`. Assinatura visual: painel lateral da tela de login (`LiveQueuePanel`) com uma fila de exemplo animada (`animate-queue-in`) e uma linha de "maré" (`animate-tide-sweep`) — reforça que é um sistema ao vivo. A mesma animação `animate-queue-in` é reaproveitada nos itens reais da fila.

## Variáveis de ambiente (visão geral — cada pasta tem seu próprio `.env.example`)

| Variável | Onde | Observação |
|---|---|---|
| `POSTGRES_PASSWORD` | infra | usada em `DATABASE_URL` do backend também |
| `EVOLUTION_API_KEY` | infra + backend + n8n (nos nós HTTP) | precisa ser **idêntica** nos três lugares |
| `JWT_SECRET` | backend | gerar com `openssl rand -hex 32`, não usar valor de exemplo |
| `NEXT_PUBLIC_API_URL` | frontend | `http://localhost:3000` em dev |
| `NEXT_PUBLIC_WS_URL` | frontend | endpoint do Socket.IO, normalmente igual à API |
| `NEXT_PUBLIC_EVOLUTION_INSTANCE` | frontend | nome da instância enviado como `instance` ao responder mensagem (`origem: atendente`) |

## Status atual do projeto

- [x] Backend NestJS completo e compilando (auth, departments, users, conversations, messages, websocket, integração Evolution)
- [x] Workflow do n8n integrado de ponta a ponta com o backend
- [x] Frontend Next.js — login + painel protegido completos: fila por setor (com Assumir), chat (histórico + envio + Transferir + Finalizar), dashboard de contagens. Todos os três telas já ligadas ao Socket.IO.
- [x] `tsc --noEmit` e `npm run build` do frontend passam limpos; todas as rotas do painel respondem 200 num `next start` sem backend rodando (sem crash de SSR)
- [x] Infra local via Docker Compose validada em 2026-07-24 (Postgres/Redis/Evolution/n8n/pgAdmin saudáveis) e backend NestJS conectado a ela — login, `GET /departments`, criar conversa, assumir, finalizar e handshake do Socket.IO testados via curl. Ver "Ambiente de desenvolvimento" abaixo pros ajustes específicos desta máquina.
- [x] Frontend testado manualmente pelo navegador contra o backend + Postgres reais (2026-07-24): login → fila → Assumir → chat → Transferir/Finalizar, com Socket.IO ao vivo. Validado pelo usuário.
- [x] Fluxo real via WhatsApp testado (2026-07-24), webhook por instância configurado no Manager da Evolution API (Events → Webhook → `http://n8n:5678/webhook/whatsapp`). Validado pelo usuário.
- [x] Mensagens do atendente levam assinatura "Nome - CÓDIGO" no WhatsApp do cliente (2026-07-24), testado via WhatsApp real e validado pelo usuário. Ver "Mensagens — assinatura do atendente" acima.
- [x] Tela `/usuarios` (só admin): listar + criar usuários, com correção de `senha_hash` vazando na resposta da API. Ver "Gestão de usuários" acima. **Ainda falta editar/inativar/excluir — próxima tarefa pedida pelo usuário.**

## Ambiente de desenvolvimento

Docker reinstalado em 2026-07-24 (Docker version 29.6.2, Compose v5.3.1, daemon ativo). O bloqueio anterior (Docker Desktop desinstalado) não existe mais — `docker compose up` pode ser tentado normalmente.

`backend/.env` foi criado nesta data com `DATABASE_URL` apontando para `localhost:5433/atendimento_db` (porta 5433, não 5432 — ver motivo abaixo; o backend roda fora do Docker, então usa a porta publicada pelo compose, não o hostname `postgres`), `EVOLUTION_API_URL=http://localhost:8089` e `EVOLUTION_API_KEY` copiada do `.env` da raiz. `JWT_SECRET` foi gerado com `openssl rand -hex 32` — trocar antes de produção real.

Corrigido também `WEBHOOK_GLOBAL_ENABLED` no `docker-compose.yml` (estava `"true"`, o que contradizia o aviso deste próprio arquivo sobre mensagens duplicadas quando o webhook global e o webhook por instância estão ativos ao mesmo tempo). Agora está `"false"` — o webhook precisa ser configurado por instância no Manager da Evolution API (Events → Webhook) antes do teste ponta a ponta.

### `docker compose up` validado em 2026-07-24 — ajustes necessários nesta máquina

- **Credencial do Docker CLI**: `~/.docker/config.json` tinha `"credsStore": "desktop"` apontando pro binário `docker-credential-desktop`, que não estava no PATH — bloqueava qualquer `docker compose up` (até pull de imagem pública). Removida a chave `credsStore` (não havia nada em `auths` mesmo, então nada foi perdido).
- **Porta 5432 já ocupada**: esta máquina tem um **PostgreSQL nativo do Windows rodando como serviço** (`postgresql-x64-13`, Automatic, não relacionado a este projeto — não mexer nele). Ele disputa a porta 5432 do host com o proxy do Docker Desktop, e IPv4 (`127.0.0.1`) caía no Postgres nativo em vez do container, causando `password authentication failed`. Solução: o Postgres do `docker-compose.yml` agora publica em **`5433:5432`** no host (containers continuam se falando por `postgres:5432` na rede interna, sem mudança). `backend/.env` usa `localhost:5433`.
- **Volume `postgres_data` com resíduo de tentativa anterior**: o volume já existia com `evolution_db` criado, então `init_db.sh` (que só roda em datadir vazio) não recriou `n8n_db` nem `atendimento_db` — n8n crashou até isso ser corrigido manualmente (`CREATE DATABASE n8n_db; CREATE DATABASE atendimento_db;`). Se algum dia for preciso resetar do zero, `docker volume rm automacao_postgres_data` força o `init_db.sh` a rodar de novo (destrutivo — não fazer sem confirmar com o usuário).
- **Backend via `npm run start:dev` não funciona no Git Bash** desta máquina (erro `'"node"' não é reconhecido` — problema de resolução de PATH do shim do npm no MSYS). Funciona normalmente via PowerShell (`cmd /c "npm run start:dev"` ou diretamente).

Depois desses ajustes: os 5 containers sobem saudáveis, `npm run seed` cria os 5 departamentos + admin, login/`GET departments`/`POST conversations`/`assume`/`finish`/Socket.IO handshake testados manualmente via curl e funcionando ponta a ponta no nível de API. **Ainda não testado**: o frontend consumindo isso ao vivo, e o fluxo real via WhatsApp/Evolution/n8n (falta configurar o webhook por instância no Manager da Evolution API).

## Próximos passos (pedido pelo usuário em 2026-07-24, ainda não iniciado)

Depois da tela `/usuarios` (listar + criar), adicionar: **editar usuário**, **Filtro de busca**, **inativar usuário**. Nada disso existe ainda no backend — `UsersController` só tem `GET` e `POST`. Pontos a considerar ao implementar (não decisões já tomadas, só contexto pra próxima sessão):

- `User.ativo` (boolean, default `true`) **já existe na entity** (`users/entities/user.entity.ts`) mas não é lido em lugar nenhum hoje — nem no login (`AuthService.login` já checa `!user.ativo` e barra login, isso já funciona), nem exposto pela API, nem editável. "Inativar" provavelmente é só um `PATCH` que vira esse campo `false`, reaproveitando a checagem que já existe no login.
- "Excluir" de verdade (`DELETE`) esbarra em `Message.atendente_id` e `Conversation.atendente_id`, que são FK pra `users` — apagar um usuário com histórico de mensagens/conversas vai quebrar ou exigir `ON DELETE SET NULL`/restrição. Vale considerar se "excluir" devia ser só "inativar" disfarçado, para que não quebre o sistema, porém ao excluir quero que ao excluir somente inative porém não apareça na lista do GET ALL USERS.

## O que evitar sugerir

- Não introduzir CRM, IA/chatbot complexo, ou features fora do MVP definido — o projeto é intencionalmente enxuto.
- Não mover regra de negócio para o n8n.
- Não usar `localStorage`/`sessionStorage` se algum componente for viver como artifact React dentro do Claude.ai — só neste projeto standalone isso é seguro.
- Não remover a separação Adapter (`integrations/evolution`) mesmo que pareça "simplificação" — é o que isola o domínio de uma troca futura de provedor de WhatsApp.
