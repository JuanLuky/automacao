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
fluxo-completo-com-backend.json  # JSON exportado do workflow principal do n8n, na raiz do repo
                                 # (versionado à parte, importado manualmente na UI do n8n — git push não afeta o n8n rodando)
menu-departamentos.json          # JSON auxiliar (versão anterior/simplificada do menu)
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

`UsersService.create`/`findAll` desestruturam o campo antes de devolver (`Omit<User, 'senha_hash'>`). Isso não existia originalmente — os dois métodos devolviam a entidade crua do TypeORM, vazando o hash bcrypt no JSON. Corrigido em 2026-07-24 ao construir a tela de gestão de usuários. **Manter esse padrão em qualquer novo método do `UsersService` que devolva `User`.** `update`/`setAtivo` (ver seção abaixo) já seguem o mesmo padrão.

### Editar / inativar / excluir usuário (2026-07-27)

`User` ganhou uma segunda coluna além de `ativo`: **`excluido_em`** (nullable, `timestamptz`, mesmo padrão de `Conversation.finalizado_em`). Os dois campos representam estados diferentes de propósito:

- **Inativar** (`PATCH /users/:id/inactivate` → `UsersService.setAtivo(id, false)`): só `ativo = false`. Reversível via **Reativar** (`PATCH /users/:id/reactivate`). O usuário continua aparecendo no `GET /users`, só fica bloqueado de logar (reaproveita a checagem que já existia em `AuthService.login`). Uso esperado: férias, afastamento.
- **Excluir** (`DELETE /users/:id` → `UsersService.remove`): `ativo = false` **e** `excluido_em = now()`. `UsersService.findAll` filtra `WHERE excluido_em IS NULL`, então o usuário some da lista — mas a linha continua no banco (não é um `DELETE` de verdade), porque `Message.atendente_id`/`Conversation.atendente_id` são FK pra `users` e apagar quebraria o histórico. **Não existe "desfazer" excluir pela UI.** Uso esperado: desligamento.

`UsersController` ganhou `PATCH /users/:id` (editar nome/e-mail/senha/setor/papel, `UpdateUserDto` com todos os campos opcionais) além das duas rotas acima.

### Guard de `role: admin` no backend (2026-07-29)

Até aqui, `UsersController` só tinha `JwtAuthGuard` — qualquer atendente autenticado conseguia chamar `PATCH/DELETE /users/:id` direto via API, mesmo o frontend escondendo a tela `/usuarios` de quem não é admin. Corrigido com `RolesGuard` (`backend/src/auth/guards/roles.guard.ts`) + decorator `@Roles(...)` (`backend/src/auth/decorators/roles.decorator.ts`), padrão `Reflector` do NestJS — lê metadata setada por `@Roles` (handler ou controller) e compara com `req.user.role` (já vem no payload do JWT, ver `AuthService.login`). Lança `403 Forbidden` se não bater.

Aplicado no controller inteiro: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(UserRole.ADMIN)` em `UsersController` — **todas** as rotas de `/users` (incluindo `GET`) agora exigem admin, não só as destrutivas, porque a tela `/usuarios` já era admin-only por inteiro no frontend. `RolesGuard` é genérico (lê `ROLES_KEY` via `getAllAndOverride`, então também aceita `@Roles` em handlers individuais de outros controllers) — reaproveitar em vez de duplicar essa checagem se outra rota admin-only surgir.

**Continua pendente**: chave compartilhada n8n↔backend nas rotas públicas (`by-phone`, criar conversa/mensagem) — esse guard não mexe nelas, só em `/users`.

### Rotas sem autenticação (proposital, não é bug)

`GET /conversations/by-phone/:telefone`, `POST /conversations` e `POST /conversations/:id/messages` são públicas porque o **n8n** as chama diretamente (ele não tem login de atendente). Isso é um trade-off de MVP — vale reforçar com uma chave compartilhada n8n↔backend antes de produção real com clientes.

### Ambiente

- Schema do banco controlado por **migrations** (`backend/src/database/migrations/`), não por `synchronize` — ver seção própria abaixo.
- Rodar `npm run migration:run` antes do primeiro start num ambiente novo (cria as 4 tabelas), depois `npm run seed` — cria os 5 departamentos (`codigo`: RH, FIN, CONT, TI, COM) e o usuário `admin@empresa.com` / `admin123` (senha a trocar).

### Migrations (2026-07-30 — substituiu `TYPEORM_SYNCHRONIZE`)

`app.module.ts` tem `synchronize: false` fixo (não é mais controlado por env var — `TYPEORM_SYNCHRONIZE` foi removido do `.env`, não tem mais leitor nenhum). O schema agora é 100% controlado por migrations do TypeORM:

- `backend/src/database/data-source.ts`: `DataSource` usado só pela CLI do TypeORM (`npm run typeorm -- <comando>`), lê `DATABASE_URL` do `.env` via `dotenv`, aponta pra `src/database/migrations/*.ts`.
- Scripts em `package.json`: `migration:generate <caminho>` (gera migration por diff entre entidades e o banco apontado em `DATABASE_URL`), `migration:run` (aplica as pendentes) e `migration:revert` (desfaz a última).
- **`InitialSchema1785436093710`** (`src/database/migrations/1785436093710-InitialSchema.ts`) é a migration baseline — criada rodando `migration:generate` contra um banco **vazio temporário** (não contra o `atendimento_db` de desenvolvimento, que já tinha as tabelas criadas pelo antigo `synchronize: true` — gerar direto nele teria produzido uma migration vazia, sem diff). Testada de ponta a ponta nesse banco temporário (`run` → `revert` → `run` de novo, tudo limpo) antes de mexer no banco real.
- **`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` foi adicionado manualmente** no topo do `up()` dessa migration — o `migration:generate` não inclui isso sozinho, mas as PKs (`uuid_generate_v4()` como `DEFAULT`) dependem dela. Sem essa linha, a migration falha num banco novo do zero (o `atendimento_db` atual já tinha a extensão habilitada, criada silenciosamente pelo `synchronize` antigo — por isso o gap só apareceria numa instalação nova).
- **O `atendimento_db` de desenvolvimento não rodou o `up()` dessa migration** — como as 4 tabelas já existiam (criadas pelo `synchronize` antigo, com o schema idêntico ao gerado), rodar a migration ali quebraria com "relation already exists". Em vez disso, foi feito um **baseline adoption**: criada a tabela `migrations` (schema padrão do TypeORM) e inserida manualmente a linha correspondente a essa migration, sem executar o SQL — confirmado depois com `npm run migration:run` reportando `No migrations are pending`. **Nenhum dado existente foi tocado.**
- **Daqui pra frente**: qualquer mudança em entidade precisa de uma migration nova (`npm run migration:generate -- src/database/migrations/NomeDaMudanca`, com o banco de dev já refletindo o estado *anterior* à mudança) — não existe mais auto-sync. Revisar sempre o SQL gerado antes de rodar `migration:run` (o TypeORM erra esporadicamente em nomes de constraint ou em diffs mais complexos de enum).

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

### Debounce de mensagens fragmentadas (2026-07-27)

Cliente sem conversa ativa que manda várias mensagens separadas em sequência (ex: "Oi", "bom dia", "preciso de ajuda") disparava uma execução do workflow **por mensagem** — como nenhuma batia o regex `^[1-5]$`, o cliente recebia o menu de departamentos repetido várias vezes. Corrigido com um "debounce" via Redis, inserido só no ramo `Verificar Conversa Ativa` (404, sem conversa) → antes de `Escolheu Departamento? (1-5)`:

1. Cada execução acumula seu texto num buffer Redis por telefone (`buffer:<telefone>`, TTL 30s) e grava um marcador (`latest:<telefone>` = `{{$execution.id}}`, TTL 30s).
2. Espera 6s (node **Wait - Aguardar Fragmentos**).
3. Relê o marcador: se ainda for o `$execution.id` desta execução, é a última mensagem da rajada — segue o fluxo lendo o buffer completo (node **Combinar Fragmentos**, que substitui `Extrair Dados da Mensagem` como fonte de `texto`/`telefone`/`nome`/`instance` só neste ramo). Se mudou, uma execução mais nova já assumiu — a antiga simplesmente para (branch falso do IF sem conexão).

**Escopo deliberadamente limitado**: só o ramo "sem conversa ativa". Mensagens de um cliente já em atendimento com um atendente humano continuam chegando uma a uma no painel — não tem debounce aí, e mensagens que o atendente manda pelo painel nem passam por esse workflow (vão direto backend → Evolution).

**Testado com WhatsApp real (2026-07-29)**: mensagens fragmentadas foram agrupadas corretamente, sem repetir o menu de departamentos. 6s se mostrou um valor adequado — não precisou ajustar o node **Wait - Aguardar Fragmentos**.

Usa o Redis do `docker-compose.yml` (banco `0`, padrão) — não conflita com o banco `1` que a Evolution API já usa pra cache (`CACHE_REDIS_URI: redis://redis:6379/1`). **Credencial Redis não vem no JSON exportado** (por segurança) — depois de reimportar o workflow, é preciso criar/selecionar uma credencial Redis na UI do n8n (host `redis`, porta `6379`, sem usuário/senha, banco `0`) nos 6 nós novos.

### Incidente: instância WhatsApp desconectada (2026-07-27)

Sintoma: mensagens reais do WhatsApp paravam de aparecer em **Executions** no n8n, mesmo com o webhook configurado certo e o workflow `Active`. Diagnóstico (nesta ordem, vale repetir se acontecer de novo):
1. `curl -X POST http://localhost:5678/webhook/whatsapp` direto com payload de teste → respondeu 200 e gerou execução → **descarta problema no n8n/workflow**.
2. `docker logs evolution_api` → `"conflict","type":"device_removed"` seguido de `LOGOUT` da instância.
3. `GET /instance/connectionState/atendimento-empresa` (Evolution API) → `"state":"close"`.

Causa: a sessão do WhatsApp (dispositivo vinculado) foi removida do lado do celular/WhatsApp — não é bug do sistema. **Solução**: Manager da Evolution API (`http://localhost:8089/manager`) → localizar a instância → reconectar e escanear o QR Code de novo.

### Alerta de desconexão do WhatsApp (2026-07-29)

Depois do incidente acima ter sido percebido só porque o usuário notou que mensagens não chegavam, adicionado um healthcheck periódico no mesmo workflow do n8n — seção independente, com trigger próprio (`Schedule - Checar Conexão a Cada 5min`, não mexe no fluxo de mensagens existente):

```
Schedule (a cada 5min)
  → GET /instance/connectionState/atendimento-empresa (Evolution API)
  → Code - Normalizar Estado da Instância (trata erro de conexão como state "unreachable")
  → IF state != "open"
       sim → Redis: já alertou nos últimos 60min? (chave alerta_enviado:atendimento-empresa)
              não → Enviar E-mail de Alerta (HTML) → Redis: marca alerta_enviado (TTL 3600s)
              sim → não faz nada (evita spam a cada 5min enquanto seguir caída)
       não → Redis: limpa alerta_enviado (reseta, pra alertar de novo numa próxima queda)
```

**Por que e-mail, não WhatsApp**: se a instância principal cair, ela não pode ser usada pra avisar sobre a própria queda (dependência circular). Decisão do usuário (2026-07-29): usar e-mail em vez de manter uma segunda instância Evolution só pra alertas.

Detalhes de implementação:
- Destino fixo `juandev33@gmail.com` (node `Enviar E-mail de Alerta`, `toEmail`) — diferente do e-mail da conta do usuário, foi pedido explicitamente assim.
- Corpo em HTML com estilos inline (compatibilidade de cliente de e-mail), mostra estado reportado e horário (`America/Sao_Paulo`, mesmo padrão de timezone do resto do projeto — ver "Colunas de data/hora" acima) e um botão linkando pro Manager (`http://localhost:8089/manager`).
- **Como toda credencial no n8n, a de SMTP não vem no JSON exportado.** Depois de reimportar o workflow é preciso criar uma credencial de e-mail (SMTP) na UI do n8n e selecioná-la no node `Enviar E-mail de Alerta` — mesmo trade-off já documentado pra credencial Redis. `fromEmail` está fixo em `juandev33@gmail.com` (2026-07-29, decisão do usuário) — **precisa bater com a conta autenticada na credencial SMTP** (Gmail rejeita `From` diferente da conta logada). Envia pra si mesma (remetente = destinatário), aceito pelo usuário. Se usar Gmail como SMTP, a credencial precisa de uma **senha de app** (`myaccount.google.com/apppasswords`, exige verificação em duas etapas ativada), não a senha normal da conta.
- Reaproveita o mesmo Redis (banco `0`) já usado no debounce — precisa da mesma credencial Redis selecionada nos 2 nós novos (`Redis - Verificar Se Já Alertou`, `Redis - Marcar Alerta Enviado`, `Redis - Limpar Alerta (Instância OK)`).

**Testado com instância real (2026-07-30), validado pelo usuário**: workflow reimportado, credencial SMTP (Gmail, senha de app) e credenciais Redis configuradas na UI do n8n, e-mail chegou corretamente na primeira queda.

**Comportamento não óbvio descoberto no teste — o reset do dedup depende de um tick do Schedule, não do evento de reconexão**: a chave `alerta_enviado:atendimento-empresa` (TTL 3600s) só é apagada quando o **Schedule roda e encontra a instância com `state == "open"`** (nó `Redis - Limpar Alerta (Instância OK)`) — não no instante em que a instância reconecta. Em teste manual (cair → alertar → reconectar → derrubar de novo em menos de 5min), nenhum tick do Schedule chegou a rodar com a instância saudável no meio, então o `DELETE` nunca aconteceu e a segunda queda caiu em `IF - Já Alertou Recentemente?` como "sim", pulando o e-mail. Numa queda real isso não deve incomodar (costuma durar bem mais que 5min), mas explica por que testes rápidos de queda/reconexão/queda não geram um segundo e-mail — não é bug, é esperar um tick de 5min com a instância `"open"` no meio, ou os 3600s de TTL expirarem. **Decisão do usuário (2026-07-30): manter como está**, sem reduzir o intervalo do Schedule nem adicionar um segundo gatilho de reset — o caso de borda só aparece em teste manual rápido, não em quedas reais.

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
│       ├── usuarios/            # só admin — listar/criar/editar/inativar/excluir atendentes/admins (ver seção própria abaixo)
│       └── whatsapp/            # só admin — QR Code de conexão da instância (ver seção própria abaixo)
├── components/
│   ├── LiveQueuePanel.tsx     # amostra ilustrativa na tela de login (dados locais, não é a fila real)
│   └── ui/                    # Button, Field, Select, StatusBadge, ConfirmModal
├── hooks/         # useAuth (contexto), useTheme, useDepartments (contexto), useSocketEvent, useNotifications (contexto)
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

### Gestão de usuários — `/usuarios` (só admin, 2026-07-24; editar/inativar/excluir/busca em 2026-07-27)

Item de nav "Usuários" (`NAV_ADMIN` em `layout.tsx`) só aparece quando `user.role === 'admin'`; a própria página redireciona (`router.replace('/fila')`) se um não-admin acessar a URL direto. Isso é reforço **só no frontend** — igual ao filtro de setor em `fila`/`dashboard`, o backend (`UsersController`) não tem guard de `role: admin`, só `JwtAuthGuard`. Mesmo trade-off de MVP já documentado, não é descuido.

Tela lista usuários (`GET /users`) com busca client-side (filtra por nome/e-mail, sem parâmetro novo no backend — mesma lógica de confiança client-side já usada em `fila`/`dashboard`) e um formulário inline reaproveitado tanto pra criar (`POST /users`) quanto pra editar (`PATCH /users/:id`) — o mesmo form alterna de modo conforme o estado `editando`. `lib/api.ts` expõe `getUsers`/`createUser`/`updateUser`/`inactivateUser`/`reactivateUser`/`deleteUser`; tipos `CreateUserPayload`/`UpdateUserPayload` em `types/index.ts`.

Cada linha tem três ações: **Editar** (abre o form preenchido), **Inativar/Reativar** (alterna conforme `u.ativo`, só Inativar pede confirmação — Reativar é sempre reversível) e **Excluir** (soft-delete, ver seção do backend). Inativar e Excluir usam o `ConfirmModal` (ver abaixo); Reativar não, por ser uma ação não-destrutiva.

### Notificações de mensagem — badge + toast (2026-07-29)

Cenário do usuário: atendente está no chat de um cliente A quando um cliente B (conversa `em_atendimento` já assumida, esperando resposta) manda uma mensagem nova — sem alerta, isso só seria percebido se o atendente voltasse pra fila manualmente.

Implementado inteiramente **client-side**, sem nova tabela/coluna no backend — segue a mesma filosofia MVP já documentada (estado efêmero, resetado a cada refresh, igual ao resto do realtime do projeto). Ver "Regras de negócio no frontend" acima sobre o padrão de simplesmente recarregar listas via socket.

- `frontend/src/hooks/useNotifications.tsx`: `NotificationsProvider`, montado em `(painel)/layout.tsx` (dentro de `DepartmentsProvider`, disponível em toda tela protegida). Escuta `nova_mensagem` globalmente e mantém `unreadByConversation: Record<conversationId, count>` + uma pilha de toasts.
- Só reage a mensagens com `origem === "cliente"` **da conversa que o próprio atendente logado tem assumida** (compara `mensagem.conversa_atendente_id === user.id`) — evita alertar sobre atendimento de outra pessoa. E ignora a conversa que já está aberta na tela (`pathname === /conversas/:id`), já que o chat já mostra a mensagem ao vivo.
- **Backend precisou expor 2 campos que só existiam no `Conversation`, não no `Message`**: `MessagesService.create` (`backend/src/messages/messages.service.ts`) monta o payload do evento `nova_mensagem` como `{ ...mensagem, cliente_nome: conversa.cliente_nome, conversa_atendente_id: conversa.atendente_id }` — só no socket, não persiste em `Message` nem muda a resposta HTTP em campos que já existiam. Deliberadamente **não** chamado `atendente_id` pra não colidir com o campo homônimo de `Message` (que é quem *enviou* aquela mensagem, não quem está assumindo a conversa).
- **Badge**: contator estilo WhatsApp (círculo vermelho, cor `alert`) ao lado do nome do cliente na lista da `/fila` (só aparece na aba "Em atendimento", já que só conversas assumidas pelo próprio atendente geram contagem). Zerado via `clearUnread(id)`, chamado num `useEffect` em `conversas/[id]/page.tsx` sempre que a conversa é aberta.
- **Toast**: canto inferior direito da tela (fixed, `z-50`), aparece em qualquer tela do painel, clicável (navega direto pra conversa), tem botão de fechar manual (`X`) e some sozinho depois de 6s (`TOAST_DURATION_MS`).
- **Testado com WhatsApp real em 2026-07-29 e validado pelo usuário** (mensagem de cliente numa conversa assumida → badge na fila + toast no canto, em qualquer rota do painel). Ver bug do content glob do Tailwind logo abaixo — foi o motivo do toast não aparecer na primeira rodada de teste.

#### Bug: toast invisível — `src/hooks/` fora do `content` do Tailwind (2026-07-29)

Primeiro teste real: o badge aparecia, mas o toast não — em nenhuma rota. Causa: `tailwind.config.ts` só tinha `./src/app/**` e `./src/components/**` no array `content`; `useNotifications.tsx` foi o **primeiro arquivo em `src/hooks/` a usar `className`**, então o Tailwind nunca escaneou esse arquivo e não gerou CSS pras classes do toast (`fixed`, `bottom-6`, `right-6`, `z-50`, `animate-queue-in` etc.). O elemento existia no DOM normalmente (por isso o badge, que vem do mesmo `setState`, sempre funcionou) — só ficava sem nenhum estilo, caindo como uma `div` comum no final do fluxo da página, invisível sem rolar até o fim.

**Corrigido** adicionando `"./src/hooks/**/*.{js,ts,jsx,tsx,mdx}"` ao `content` de `tailwind.config.ts`. **Vale lembrar disso pra qualquer pasta nova que passe a ter JSX/`className`** (ex: se `lib/` ou `types/` um dia ganhar um componente) — o Tailwind não avisa em build, ele só silenciosamente não gera a classe.

### Conexão do WhatsApp via QR Code no painel — `/whatsapp` (2026-07-30)

Item de nav "WhatsApp" ao lado de "Usuários" em `NAV_ADMIN` (`layout.tsx`), só admin — mesmo reforço client-side já documentado em "Gestão de usuários" (redireciona pra `/fila` se não-admin). Objetivo: evitar que o admin precise abrir o Manager da Evolution API (`localhost:8089/manager`) separadamente pra reconectar o número depois de uma queda.

- **Backend**: novo módulo `backend/src/whatsapp/` (`WhatsappController`, sem `WhatsappService` — é um passthrough fino pro adapter, não tem regra de domínio própria, então não fez sentido criar uma camada de Service só por consistência). Duas rotas, ambas `GET`, guardadas com `JwtAuthGuard` + `RolesGuard` + `@Roles(admin)` (mesmo padrão do `UsersController`): `/whatsapp/status?instance=` (proxy pra `GET /instance/connectionState/:instance` da Evolution) e `/whatsapp/qrcode?instance=` (proxy pra `GET /instance/connect/:instance`, que gera um QR novo). `EvolutionService` ganhou `getConnectionState`/`getQrCode` — devolvem o JSON cru da Evolution API (`Record<string, unknown>`) sem normalizar, porque o formato do payload varia entre versões da Evolution API; quem normaliza (`state ?? instance?.state`) é o frontend.
- **`instance` vem por query param, não fixo no backend** — segue o mesmo padrão já usado em `POST /conversations/:id/messages` (campo `instance` no DTO), onde quem sabe o nome da instância é o frontend (`NEXT_PUBLIC_EVOLUTION_INSTANCE`), não uma env var do backend.
- **Frontend**: `frontend/src/app/(painel)/whatsapp/page.tsx` — busca status a cada 8s (`POLL_INTERVAL_MS`); se não `"open"`, busca um QR Code novo (`getWhatsappQrCode`) e mostra a imagem base64 recebida direto (`<img>`, não `next/image` — é uma data URI gerada dinamicamente pela Evolution, não tem o que otimizar). Botão manual "Gerar novo QR Code"/"Tentar novamente" força um novo ciclo fora do intervalo. Quando `state === "open"`, mostra card de "conectado" e para de buscar QR.
**Testado escaneando um QR real e validado pelo usuário (2026-07-30)** — schema de resposta da Evolution API (`base64`/`state`) bateu com o esperado pelo parsing defensivo do frontend, sem ajuste necessário.

### Gestão de setores — `/departamentos` (só admin, 2026-07-31)

Item de nav "Setores" em `NAV_ADMIN` (`layout.tsx`), mesmo reforço client-side dos outros itens admin (`/usuarios`, `/whatsapp`). Motivo: os 5 setores (RH/FIN/CONT/TI/COM) só existiam porque o `seed` os criou — pra adicionar um setor novo ou renomear um existente era preciso mexer direto no banco.

- **Backend** (`DepartmentsController`/`DepartmentsService`): `GET /departments` continua público e devolve só `ativo: true` (n8n e os selects do frontend dependem disso). Rotas novas, todas atrás de `JwtAuthGuard` + `RolesGuard` + `@Roles(admin)` — mesmo padrão do `UsersController`: `GET /departments/all` (lista completa, inclusive inativos, só pra essa tela poder reativar), `POST /departments`, `PATCH /departments/:id` (nome/código), `PATCH /departments/:id/inactivate`, `PATCH /departments/:id/reactivate`. `POST /departments` **antes só tinha `JwtAuthGuard`** — qualquer atendente autenticado conseguia criar setor; corrigido junto pro mesmo padrão admin-only.
- **Sem exclusão definitiva** — só inativar/reativar (reaproveitando o `ativo` que a entidade já tinha, sem precisar de coluna nova nem migration). Motivo: `conversations.departamento_id` é FK **obrigatória** (não-nullable) pra `departments`; um hard-delete quebraria qualquer conversa histórica vinculada a esse setor. Mesmo raciocínio de fundo do soft-delete de usuário, mas aqui nem existe o segundo estado (`excluido_em`) — um setor não tem o equivalente a "desligamento", só "não usar mais".
- **Frontend**: `frontend/src/app/(painel)/departamentos/page.tsx`, mesmo esqueleto de `/usuarios` (busca client-side por nome/código, form inline que alterna criar/editar, `ConfirmModal` só pra inativar — reativar não pede confirmação, mesmo padrão de usuários). `lib/api.ts` expõe `getDepartmentsAdmin`/`createDepartment`/`updateDepartment`/`inactivateDepartment`/`reactivateDepartment`.
- **Atenção ao editar `codigo`**: o fluxo do n8n mapeia as opções `1-5` do menu do WhatsApp pra um `codigoPorOpcao` **fixo no JSON do workflow** (`'1':'RH', '2':'FIN', '3':'CONT', '4':'TI', '5':'COM'`), casado contra o campo `codigo` retornado por `GET /departments` (ver nó "Mapear Departamento" em `fluxo-completo-com-backend.json`). Mudar o `codigo` de um setor existente sem atualizar esse nó quebra o menu pra aquela opção. O formulário mostra um aviso inline quando o código é alterado. **Nome pode ser editado livremente** (é só o que aparece pro atendente/cliente) — foi o caso de uso original ("renomear TI pra Suporte").
- **Setor novo (ex: "Jurídico") não aparece sozinho no menu do WhatsApp**: o texto do menu (`"1 - RH\n2 - Financeiro..."`) e o `codigoPorOpcao` do n8n só cobrem as opções já existentes — são hardcoded no workflow, não vêm de `GET /departments`. Criar um setor pela tela cadastra ele normalmente (aparece em filtros de fila/dashboard, pode receber usuários, pode ser destino de transferência manual), mas **não** vira uma opção numerada pro cliente escolher sozinho sem editar o workflow do n8n também.
  - Avaliadas duas abordagens (ver histórico de conversa de 2026-07-31): tornar o menu 100% dinâmico (leria `GET /departments` e geraria número/texto na hora, mas exige mover o node `Buscar Departamentos` pra antes do IF de escolha e muda a numeração dos setores já existentes) vs. edição manual pontual (só adiciona a opção nova no `codigoPorOpcao` e no texto, mesmo padrão já usado pras 5 opções originais). **Decisão do usuário: manual**, por ser mudança menor e sem efeito colateral na numeração dos setores existentes.
  - Passo a passo com o código pronto pra colar nos dois nodes (`Mapear Departamento` e o node HTTP que envia o menu) está em `n8n-novo-setor.md` (raiz do repo) — repetir esse processo a cada setor novo que precise aparecer no WhatsApp. **Testado e validado pelo usuário em 2026-07-31.**

### Busca de conversas finalizadas — aba "Finalizadas" na fila (2026-07-31)

Antes, `/fila` só listava `aguardando`/`em_atendimento` — depois de finalizada, achar "aquela conversa de terça-feira com o cliente X" exigia ir direto no banco. Adicionada uma terceira aba "Finalizadas" em `TABS` (`fila/page.tsx`), com os mesmos filtros de setor que as outras abas (atendente só vê o próprio setor, admin escolhe), mais busca por nome/telefone (`debounce` de 400ms) e um intervalo de datas (`De`/`Até`).

- **Backend**: `ConversationsService.findAll` trocou o `find()` simples por um `QueryBuilder`, com dois filtros novos e opcionais: `busca` (`ILIKE` em `cliente_nome` OU `telefone`) e `data_inicio`/`data_fim` (comparação em `criado_em`, não `finalizado_em` — assim o filtro de data funciona pra qualquer status, não só finalizado). Expostos em `ConversationsController.findAll` como query params, atrás do `JwtAuthGuard` já existente na rota — nenhuma mudança de autenticação/autorização, só filtros a mais na mesma rota `GET /conversations`.
- **Abrir uma conversa finalizada reaproveita a tela de chat existente** (`conversas/[id]/page.tsx`) sem nenhuma mudança — ela já escondia Transferir/Finalizar e desabilitava o campo de envio quando `status === 'finalizado'` (implementado antes, pra quando uma conversa era finalizada enquanto o atendente ainda estava na tela). Serve tanto pra visualização ao vivo quanto pra consulta de histórico.
- **Bug de fuso horário encontrado e corrigido durante o teste manual desta feature**: o filtro de data inicial usava `new Date('2026-07-24')` (que o JS interpreta como meia-noite em **UTC**) seguido de `.setHours(0,0,0,0)` (que ajusta a hora **local**) — com o processo rodando em America/Sao_Paulo (UTC-3, ver "Colunas de data/hora" acima), meia-noite UTC já é 21h do dia anterior aqui, então o `setHours` acabava zerando a hora **do dia errado**, um dia pra trás do pedido. Testado contra dados reais do Postgres (`docker exec postgres psql ...`) antes e depois da correção: buscar "24/07" batia 0 resultado (deveria bater 4) até trocar para `inicioDoDiaLocal`/`fimDoDiaLocal` (`conversations.service.ts`), que constroem o `Date` a partir dos componentes ano/mês/dia (`new Date(ano, mes-1, dia, ...)`, que já nasce no fuso local) em vez de fazer parse de string. **Vale lembrar disso em qualquer filtro de data futuro no backend** — o padrão seguro é sempre montar o `Date` a partir de componentes numéricos, nunca fazer parse de uma string `YYYY-MM-DD` e depois `setHours` em cima.

### `ConfirmModal` — substituiu `window.confirm` (2026-07-27)

`components/ui/ConfirmModal.tsx`: modal de confirmação renderizado via `createPortal` em `document.body`, com Escape/clique no backdrop pra cancelar, prop `loading` (spinner no botão de confirmar enquanto a ação assíncrona roda) e `variant="danger"` (vermelho, ícone de alerta) pra ações destrutivas. Motivo: `window.confirm` tem aparência de navegador, destoando da identidade visual do painel.

Usado em três lugares hoje: **Finalizar conversa** (`conversas/[id]/page.tsx`), **Inativar** e **Excluir usuário** (`usuarios/page.tsx`, `variant="danger"` só no Excluir). Qualquer confirmação nova no painel deve reaproveitar esse componente, não voltar pro `window.confirm`.

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
- [x] Tela `/usuarios` (só admin): listar, criar, **editar, inativar/reativar e excluir (soft-delete)** usuários, com busca client-side e correção de `senha_hash` vazando na resposta da API. Ver "Gestão de usuários" e "Editar / inativar / excluir usuário" acima.
- [x] `ConfirmModal` substituindo `window.confirm` em Finalizar conversa, Inativar e Excluir usuário (2026-07-27). Ver seção própria acima.
- [x] Debounce de mensagens fragmentadas no n8n (via Redis), aplicado só no ramo sem conversa ativa (2026-07-27), **testado com WhatsApp real em 2026-07-29 e validado pelo usuário** — 6s funcionou bem, sem necessidade de ajuste. Ver "Debounce de mensagens fragmentadas" acima.
- [x] Guard de `role: admin` em todas as rotas de `/users` no backend (2026-07-29), via `RolesGuard` + `@Roles`. Ver "Guard de `role: admin` no backend" acima.
- [x] Healthcheck de conexão do WhatsApp no n8n (2026-07-29), a cada 5min, com alerta por e-mail (dedup via Redis, TTL 1h) quando a instância cai. Workflow reimportado, credenciais SMTP e Redis configuradas, **testado com instância real e validado pelo usuário em 2026-07-30**. Ver "Alerta de desconexão do WhatsApp" acima, incluindo o comportamento do reset do dedup (depende de um tick do Schedule com a instância saudável, não do evento de reconexão em si).
- [x] Badge de mensagens não lidas na fila + toast de notificação no canto da tela (2026-07-29), pra avisar quando um cliente de uma conversa já assumida manda mensagem enquanto o atendente está em outra tela/conversa. **Testado com WhatsApp real e validado pelo usuário** — ver "Notificações de mensagem" acima, incluindo o bug do content glob do Tailwind (`src/hooks/` fora do scan) que fazia o toast ficar invisível na primeira rodada de teste.
- [x] Tela `/whatsapp` (só admin): conectar a instância via QR Code direto no painel, sem abrir o Manager da Evolution API. **Testado escaneando um QR real e validado pelo usuário em 2026-07-30**. Ver "Conexão do WhatsApp via QR Code no painel" acima.
- [x] Migrations do TypeORM substituindo `TYPEORM_SYNCHRONIZE` (2026-07-30) — `synchronize: false` fixo, migration baseline gerada e testada (run/revert/run) num banco temporário, adotada no `atendimento_db` de dev via bookkeeping (sem tocar dado nenhum). Ver "Migrations" acima.
- [x] Tela `/departamentos` (só admin): criar/renomear/inativar/reativar setores pela UI, sem precisar mexer no banco (2026-07-31). Sem exclusão definitiva (FK obrigatória de `conversations`). Testado via curl contra o Postgres de dev (create/update/inactivate/reactivate, guard 401 sem token). Ver "Gestão de setores" acima, incluindo o aviso sobre `codigo`.
- [x] Aba "Finalizadas" na fila, com busca por nome/telefone e intervalo de datas (2026-07-31) — reaproveita a tela de chat existente (já era somente-leitura pra conversas finalizadas). Testado via curl contra dados reais do Postgres de dev. Ver "Busca de conversas finalizadas" acima, incluindo um bug de fuso horário no filtro de data encontrado e corrigido nesse teste.
- [x] Setor novo aparecendo no menu do WhatsApp: processo manual (adicionar a opção em `codigoPorOpcao` e no texto do menu no n8n) documentado passo a passo em `n8n-novo-setor.md`, com o código pronto pra colar. **Testado e validado pelo usuário em 2026-07-31** — repetir esse arquivo a cada setor novo cadastrado em `/departamentos` que precise virar opção no WhatsApp.

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

## Próximos passos

Itens das sessões de 2026-07-24/27/29/30/31 (editar/inativar/excluir/busca em `/usuarios`, debounce de fragmentos testado com WhatsApp real, healthcheck de desconexão com alerta por e-mail, tela de QR Code do WhatsApp, migrations substituindo `TYPEORM_SYNCHRONIZE`, CRUD de setores, busca de conversas finalizadas, setor novo no menu do WhatsApp via `n8n-novo-setor.md`) **já concluídos** — ver "Status atual do projeto" acima.

Sugestões levantadas pelo Claude (ainda **não** pedidas pelo usuário — avaliar antes de implementar):

- **Chave compartilhada n8n↔backend** — trade-off de MVP já documentado (ver "Rotas sem autenticação" acima), continua pendente antes de produção real. Decisão do usuário em 2026-07-30: manter assim por enquanto, corrigir só perto de produção.
- **Revisar outras pastas fora de `src/app`/`src/components`/`src/hooks`** (ex: se `lib/` ganhar algum dia um componente com `className`) contra o `content` do `tailwind.config.ts` — ver bug do toast invisível em "Notificações de mensagem" acima; o Tailwind não avisa em build quando uma pasta fica de fora do scan.
- **Menu dinâmico do WhatsApp (ler `GET /departments` em vez de `codigoPorOpcao` fixo)** — avaliado em 2026-07-31 e descartado por ora a favor do processo manual (`n8n-novo-setor.md`), por mudar a numeração dos setores já existentes e exigir mudança estrutural no workflow. Reconsiderar só se o cadastro de setores pela UI virar frequente o bastante pra doer editar o n8n a cada um.

## O que evitar sugerir

- Não introduzir CRM, IA/chatbot complexo, ou features fora do MVP definido — o projeto é intencionalmente enxuto.
- Não mover regra de negócio para o n8n.
- Não usar `localStorage`/`sessionStorage` se algum componente for viver como artifact React dentro do Claude.ai — só neste projeto standalone isso é seguro.
- Não remover a separação Adapter (`integrations/evolution`) mesmo que pareça "simplificação" — é o que isola o domínio de uma troca futura de provedor de WhatsApp.
