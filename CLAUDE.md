# CLAUDE.md

Contexto do projeto para o Claude Code. Leia isso antes de sugerir qualquer mudança — ele explica as decisões de arquitetura já tomadas, pra evitar sugestões que vão contra o que já foi definido de propósito.

## Idioma

**Sempre responder em português** (pedido explícito do usuário, 2026-08-05) — independente do idioma da mensagem ou de trechos em inglês no código/commits.

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

**Mesmo vazamento existia em `MessagesService` (corrigido em 2026-08-07)**: `create`/`findByConversation` anexam `Message.atendente` (relação `User`) sem desestruturar `senha_hash` — achado durante o teste da feature de mídia em 2026-08-05, afetando tanto a resposta HTTP de `POST/GET .../messages` (rota pública) quanto o payload do evento de socket `nova_mensagem`. Corrigido com a mesma técnica (função `semSenha()` local em `messages.service.ts`, com overloads pra preservar null/undefined) — não reaproveitou o `Omit<User,'senha_hash'>` do `UsersService` porque ali a entidade já vem sem a relação carregada; aqui é a relação `atendente` que precisa ser saneada antes de sair. **Mesmo padrão a manter em qualquer serviço novo que carregue `User` via relação.**

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
       404 (não existe) → GET /departments → texto escolhe um setor válido? (menu dinâmico, ver "Menu dinâmico do WhatsApp" abaixo)
            sim → POST /conversations → confirma no WhatsApp
            não → envia o menu de departamentos (numerado dinamicamente a partir de GET /departments)
```

(diagrama simplificado — não mostra a checagem de horário de funcionamento nem o debounce de fragmentos, ambos descritos nas seções próprias abaixo)

Pontos de atenção conhecidos:
- Webhook da Evolution API é configurado **por instância** (Manager → Events → Webhook), apontando para `http://n8n:5678/webhook/whatsapp`. **Não habilitar também o `WEBHOOK_GLOBAL_*` no docker-compose ao mesmo tempo** — causa mensagens duplicadas.
- `host.docker.internal` (usado pelo n8n pra chamar o backend, que roda fora do Docker) exige `extra_hosts: ["host.docker.internal:host-gateway"]` no serviço `n8n` do docker-compose, no Linux.
- Node HTTP Request que retorna array (`GET /departments`) — o n8n separa cada elemento em um item diferente. Use `$('NomeDoNode').all().map(i => i.json)` pra reconstruir o array, nunca `$input.item.json` direto.

### Debounce de mensagens fragmentadas (2026-07-27)

Cliente sem conversa ativa que manda várias mensagens separadas em sequência (ex: "Oi", "bom dia", "preciso de ajuda") disparava uma execução do workflow **por mensagem** — como nenhuma batia a checagem de escolha de setor, o cliente recebia o menu de departamentos repetido várias vezes. Corrigido com um "debounce" via Redis, inserido só no ramo `Verificar Conversa Ativa` (404, sem conversa) → antes de `Escolheu Departamento Válido?` (nome atual do IF — ver "Menu dinâmico do WhatsApp" abaixo; até 2026-08-05 se chamava `Escolheu Departamento? (1-5)`):

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
│       ├── conversas/[id]/       # chat: histórico, envio, Transferir, Finalizar (grupo: sem essas duas, ver "Grupos do WhatsApp" abaixo)
│       ├── grupos/               # lista de grupos do WhatsApp (sem fila/setor, aberta a todos) — ver seção própria abaixo
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

`GET /conversations/:id` existe no backend desde a feature de Grupos (2026-08-15, ver "Grupos do WhatsApp" abaixo) — a tela de chat busca a conversa via `getConversation(id)` em `lib/api.ts`, que chama esse endpoint direto. Antes disso, buscava a lista inteira (`GET /conversations`) e filtrava client-side; esse workaround não existe mais.

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

**Generalizado em 2026-08-07**: revisão confirmou que `lib/`/`types/` ainda não tinham nenhum arquivo com `className`, então não havia vazamento *atual* — mas o `content` continuava listando pasta por pasta, exatamente o padrão que causou esse bug. Trocado por um único glob `["./src/**/*.{js,ts,jsx,tsx,mdx}"]`, cobrindo `src/` inteiro de uma vez. Qualquer pasta nova (`lib/`, `types/` ou outra) que passe a ter JSX/`className` já entra automaticamente no scan — elimina essa classe de bug em vez de precisar lembrar de atualizar o array a cada pasta nova. `tsc --noEmit` e `npm run build` confirmados limpos depois da troca.

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
- **`codigo` de um setor não é mais usado pelo menu do WhatsApp** (ver "Menu dinâmico do WhatsApp" abaixo — desde 2026-08-05 o menu lê `GET /departments` direto, sem mapeamento fixo por código). Editar `codigo` livremente não quebra mais o menu; o campo continua existindo só como identificador curto interno. **Nome pode ser editado livremente** (é só o que aparece pro atendente/cliente) — foi o caso de uso original ("renomear TI pra Suporte").
- **Setor novo (ex: "Jurídico") aparece sozinho no menu do WhatsApp automaticamente** — desde o menu dinâmico, criar um setor pela tela já é suficiente pra ele virar uma opção numerada, sem editar nada no n8n. Ver "Menu dinâmico do WhatsApp" abaixo.

### Busca de conversas finalizadas — aba "Finalizadas" na fila (2026-07-31)

Antes, `/fila` só listava `aguardando`/`em_atendimento` — depois de finalizada, achar "aquela conversa de terça-feira com o cliente X" exigia ir direto no banco. Adicionada uma terceira aba "Finalizadas" em `TABS` (`fila/page.tsx`), com os mesmos filtros de setor que as outras abas (atendente só vê o próprio setor, admin escolhe), mais busca por nome/telefone (`debounce` de 400ms) e um intervalo de datas (`De`/`Até`).

- **Backend**: `ConversationsService.findAll` trocou o `find()` simples por um `QueryBuilder`, com dois filtros novos e opcionais: `busca` (`ILIKE` em `cliente_nome` OU `telefone`) e `data_inicio`/`data_fim` (comparação em `criado_em`, não `finalizado_em` — assim o filtro de data funciona pra qualquer status, não só finalizado). Expostos em `ConversationsController.findAll` como query params, atrás do `JwtAuthGuard` já existente na rota — nenhuma mudança de autenticação/autorização, só filtros a mais na mesma rota `GET /conversations`.
- **Abrir uma conversa finalizada reaproveita a tela de chat existente** (`conversas/[id]/page.tsx`) sem nenhuma mudança — ela já escondia Transferir/Finalizar e desabilitava o campo de envio quando `status === 'finalizado'` (implementado antes, pra quando uma conversa era finalizada enquanto o atendente ainda estava na tela). Serve tanto pra visualização ao vivo quanto pra consulta de histórico.
- **Bug de fuso horário encontrado e corrigido durante o teste manual desta feature**: o filtro de data inicial usava `new Date('2026-07-24')` (que o JS interpreta como meia-noite em **UTC**) seguido de `.setHours(0,0,0,0)` (que ajusta a hora **local**) — com o processo rodando em America/Sao_Paulo (UTC-3, ver "Colunas de data/hora" acima), meia-noite UTC já é 21h do dia anterior aqui, então o `setHours` acabava zerando a hora **do dia errado**, um dia pra trás do pedido. Testado contra dados reais do Postgres (`docker exec postgres psql ...`) antes e depois da correção: buscar "24/07" batia 0 resultado (deveria bater 4) até trocar para `inicioDoDiaLocal`/`fimDoDiaLocal` (`conversations.service.ts`), que constroem o `Date` a partir dos componentes ano/mês/dia (`new Date(ano, mes-1, dia, ...)`, que já nasce no fuso local) em vez de fazer parse de string. **Vale lembrar disso em qualquer filtro de data futuro no backend** — o padrão seguro é sempre montar o `Date` a partir de componentes numéricos, nunca fazer parse de uma string `YYYY-MM-DD` e depois `setHours` em cima.

### Respostas rápidas + mensagens automáticas ao Assumir/Finalizar (2026-07-31)

Objetivo: reduzir digitação repetitiva no chat e padronizar a abertura/encerramento do atendimento. Tudo implementado **só no frontend**, reaproveitando `POST /conversations/:id/messages` (mesma rota que o envio manual já usa) — nenhuma mudança de backend, nenhuma entidade nova.

- **`frontend/src/lib/quickReplies.ts`**: lista estática de templates (não editável pela UI — decisão consciente de manter simples; se um dia precisar ser configurável por setor/empresa, aí sim justifica virar uma entidade no backend com tela de CRUD, seguindo o padrão de `/departamentos`), organizados por momento da conversa (Abertura/Acolhimento, Aguarde/Em análise, Pedido de informação, Encerramento, Transferência, Fora do horário/alta demanda) — mesma categorização usada na conversa que definiu esse escopo. `"[nome do atendente]"` é o único placeholder resolvido automaticamente (via `resolverTemplate`, usando `user.nome` do `useAuth()`); os demais (`"[setor]"`, `"[horário]"`) ficam como texto literal pro atendente editar à mão — não há um valor certo pra preencher sozinho no momento em que o template é escolhido (ex: setor de destino da transferência ainda não foi escolhido nesse ponto).
- **`components/ui/QuickReplies.tsx`**: botão + painel categorizado (popover simples com `useState`/click-outside/Escape, sem lib de terceiros) ao lado do campo de mensagem em `conversas/[id]/page.tsx`. Clicar num template **preenche o campo de texto pro atendente revisar antes de enviar** — não envia direto. Desabilitado junto com o campo de texto quando a conversa não está `em_atendimento` (mesma condição `podeResponder` já existente).
- **Mensagem automática ao Assumir** (`fila/page.tsx`, `handleAssumir`): depois que `assumeConversation` retorna com sucesso, dispara via `sendMessage` o texto "Olá! Tudo bem? Meu nome é [nome do atendente], vou te ajudar por aqui." (com o nome já resolvido). **Best-effort**: erro no envio não bloqueia a navegação pra tela da conversa, já que o atendimento já foi assumido de qualquer forma (`try/catch` silencioso ao redor do `sendMessage`, separado do `try/catch` externo que trata falha do `assumeConversation` em si).
- **Mensagem automática ao Finalizar** (`conversas/[id]/page.tsx`, `handleFinalizar`): antes de chamar `finishConversation`, dispara "Fico à disposição! Tenha um ótimo dia." — texto fixo, sem placeholder. Mesmo padrão best-effort: falha no envio não impede finalizar.
- **Por que não repetir o nome do atendente ao finalizar nem simplificar a mensagem de abertura**: toda mensagem de atendente já leva um prefixo automático `*Nome - Setor*` antes do texto (ver "Mensagens — assinatura do atendente" acima) — a de encerramento não tem placeholder de nome de propósito, pra não duplicar. A de abertura **repete o nome mesmo assim** — decisão explícita do usuário ao escolher entre as opções sugeridas (preferiu manter o texto original mesmo sabendo da sobreposição com a assinatura).
- **Escolha de texto pras duas mensagens automáticas foi decisão do usuário**, não inferida — dado que são mensagens que saem pro cliente real sem revisão manual (diferente do popup de respostas rápidas, que sempre passa pelo campo de texto antes de enviar).
- `lib/api.ts` ganhou `EVOLUTION_INSTANCE` como export compartilhado (lia `NEXT_PUBLIC_EVOLUTION_INSTANCE` direto em `conversas/[id]/page.tsx`; agora também usado em `fila/page.tsx` pro envio automático).

### Paginação nas abas da fila (2026-07-31)

Com a aba "Finalizadas" acumulando registros (15 já no banco de dev), a lista virou um scroll longo — pedido do usuário pra paginar as 3 abas (Na fila / Em atendimento / Finalizadas) em blocos de 5.

- **Backend**: `ConversationsService.findAll` ganhou `pagina`/`por_pagina` **opcionais**. Sem os dois, continua devolvendo o array completo — comportamento antigo preservado de propósito, porque `GET /conversations` também é usado sem paginação pelo dashboard (`getConversations({ departamento_id })`, precisa da lista inteira pra contar por status) e por `getConversation(id)` no frontend (busca na lista completa, não existe `GET /conversations/:id`). Com os dois presentes, usa `queryBuilder.skip/take/getManyAndCount()` e devolve `{ dados, total, pagina, por_pagina }` em vez do array puro. Mesma rota, dois formatos de resposta dependendo dos query params — aceitável aqui porque só uma função do frontend (`getConversationsPaginado`) manda esses params; `getConversations` (sem paginação) nunca manda.
- **Frontend**: `lib/api.ts` ganhou `getConversationsPaginado` (tipo `ConversationsPaginado`) separado de `getConversations` — a função antiga não mudou, dashboard e `getConversation` continuam intocados. `fila/page.tsx` usa a nova função com `por_pagina` fixo em 5 (`POR_PAGINA`), guarda `total` além de `conversas`, e mostra "Página X de Y" + botões Anterior/Próxima **só quando `total > POR_PAGINA`** (não polui a tela quando cabe tudo numa página só).
- **Página reseta pra 1** ao trocar de aba, setor (admin) ou qualquer filtro da busca de finalizadas (nome/telefone/data) — senão dava pra ficar preso na página 3 de uma busca nova que só tem 1 resultado.
- **Página se auto-corrige se ficar fora do intervalo**: se uma conversa sai da lista entre um carregamento e outro (ex: outro atendente assumiu enquanto o admin estava na página 2 de "Na fila"), e a página atual deixa de existir, o `carregar()` detecta (`pagina > totalPáginas` calculado a partir do `total` da resposta) e volta sozinho pra última página válida, em vez de mostrar uma tela vazia enganosa.

### Página de status/uptime — `/status` (pública) + `/status/publicar` (admin) (2026-08-04)

Objetivo: dar confiança ao cliente mesmo numa queda ("o serviço caiu, já sabemos, aqui está o status"), sem depender de avisar um por um. Modelo deliberadamente **manual** nesta primeira versão — o usuário pediu explicitamente que fosse simples mesmo que manual: admin posta uma entrada de status (ex: "Instabilidade detectada, investigando", estado `instabilidade`) e depois outra quando resolver (estado `operacional`). Sem integração automática com o healthcheck do n8n (ver "Alerta de desconexão do WhatsApp" abaixo) — os dois ficam propositalmente desacoplados por ora; reavaliar só se o volume de quedas justificar automatizar.

- **Backend**: novo módulo `backend/src/status/` (`StatusUpdate` — `estado` enum `operacional`|`instabilidade`|`indisponivel`, `mensagem`, `criado_em` timestamptz). `GET /status/atual` e `GET /status/historico` são **públicos** (é a página que o cliente acessa sem login); `POST /status` é admin-only (`JwtAuthGuard`+`RolesGuard`+`@Roles(admin)`, mesmo padrão do `DepartmentsController`). Se a tabela estiver vazia (instalação nova, ninguém postou ainda), `StatusService.atual()` devolve um default em memória (`operacional`, `criado_em: null`) sem persistir nada — só pra página pública não quebrar antes do primeiro post.
- **Frontend**: duas rotas separadas de propósito, pra não colidir — `app/status/page.tsx` é a página **pública** (fora do route group `(painel)`, sem guard de auth, mesmo nível de `app/login/page.tsx`): banner com o estado mais recente (cores `tide`/`waiting`/`alert`, mesmos tokens de status já usados em `StatusBadge`) + histórico abaixo. `app/(painel)/status/publicar/page.tsx` é a tela admin-only (nav "Status" em `NAV_ADMIN`) onde o admin escreve e publica as atualizações — reaproveita o esqueleto de `/departamentos` (guard `router.replace('/fila')` se não-admin).
- **Testado via curl nesta sessão** (login admin, `POST /status`, `GET /status/atual`/`historico`, guard 401 sem token) e via `npm run build`/`tsc --noEmit` do frontend, ambos limpos. **Testado visualmente no navegador e validado pelo usuário (2026-08-05)** — `/status` (pública) e `/status/publicar` (admin) conferidos na UI.

### Horário de funcionamento configurável + resposta automática fora do expediente (2026-08-04)

Liga ao template "Fora do horário / alta demanda" que já existia em `quickReplies.ts` (usado manualmente pelo atendente) — agora também existe uma resposta **automática** quando o cliente escreve fora do horário configurado, antes de qualquer atendente entrar em cena. A regra de negócio (comparar hora atual com a config) fica no **backend**, não no n8n — reforça a separação já documentada acima ("Não mover regra de negócio para o n8n"); o n8n só consulta um endpoint e ramifica.

- **Backend**: novo módulo `backend/src/business-hours/` (`BusinessHours` — linha única/singleton, configuração **global da empresa**, sem distinção por setor: `dias_funcionamento` int[] no formato de `Date.getDay()` — 0=domingo..6=sábado —, `hora_inicio`/`hora_fim` no formato `HH:mm`, `mensagem_fora_horario` texto livre). `BusinessHoursService.estaAberto()` compara `dias_funcionamento`/hora atual usando `new Date()` sem nenhuma conversão de fuso — o servidor já roda nativamente em America/Sao_Paulo (mesmo fuso das colunas `timestamptz`, ver "Colunas de data/hora" acima), então a hora local do processo já é a hora certa. `GET /business-hours` é **público** (n8n consulta sem autenticação, mesmo padrão de `GET /departments`) e devolve a config + `aberto` já calculado; `PATCH /business-hours` é admin-only. `seed.ts` cria a linha padrão (`Seg-Sex, 08:00-18:00`) se a tabela estiver vazia, mesmo padrão idempotente já usado pros 5 departamentos.
- **Frontend**: `app/(painel)/horario-funcionamento/page.tsx` (admin-only, nav "Horário" em `NAV_ADMIN`) — toggles dos 7 dias, dois `<input type="time">`, textarea da mensagem, e um badge "Aberto agora"/"Fechado agora" computado a partir do `aberto` devolvido pela API no momento do carregamento (não é um relógio ao vivo — só reflete o instante da última consulta/salvamento).
- **n8n** (`fluxo-completo-com-backend.json`): dois nodes novos inseridos entre `Redis - Limpar Buffer` e `Escolheu Departamento? (1-5)` — mesmo ramo "sem conversa ativa" onde já vive o debounce, escopo igualmente limitado (mensagens de conversa já assumida por atendente humano não passam por essa checagem, chegam direto no painel). `Consultar Horário de Funcionamento` (GET `/business-hours`) → `Dentro do Horário de Funcionamento?` (IF em `{{ $json.aberto }}`): **true** segue pro fluxo original sem nenhuma mudança; **false** manda a `mensagem_fora_horario` direto pra Evolution API (`Enviar Mensagem - Fora do Horário`, mesmo formato do node `Enviar Menu` já existente) e a execução termina — não cria conversa, não entra na fila. Cliente que mandar `1-5` fora do horário recebe só a mensagem de fechado, precisa reenviar dentro do horário pra ser atendido.
**Reimportado e testado (2026-08-04)**: o usuário optou por reimportar o JSON inteiro na UI do n8n e reconfigurar as credenciais de Redis/SMTP manualmente (em vez de adicionar os 3 nodes um a um no workflow existente, que era a alternativa mais cautelosa sugerida). Testado com curl direto no webhook (`http://localhost:5678/webhook/whatsapp`, payload sintético de `messages.upsert`, mesmo padrão já usado pro debounce):
- Horário forçado pra fechado (`PATCH /business-hours` com `hora_fim` no passado) + texto livre ("oi") → sem conversa criada (`GET /conversations/by-phone/:telefone` 404). Log do n8n mostrou o erro esperado da Evolution API rejeitando o número de teste falso ao tentar mandar a mensagem de fora do horário — confirma que o node `Enviar Mensagem - Fora do Horário` disparou.
- Horário ainda fechado + texto `"1"` (escolha de departamento válida) → também sem conversa criada — confirma que a checagem intercepta **antes** de `Escolheu Departamento? (1-5)`, mesmo com um dígito válido.
- Horário revertido pro padrão (08:00-18:00) + texto `"2"` → conversa criada normalmente (`status: aguardando`, setor FIN) — sem regressão no fluxo original.

### Menu dinâmico do WhatsApp — lê `GET /departments` em vez de mapeamento fixo (2026-08-05)

Reverte a decisão de 2026-07-31 (ver histórico dessa data, e `n8n-novo-setor.md`, agora marcado obsoleto): setor novo cadastrado em `/departamentos` passa a aparecer sozinho no menu do WhatsApp, sem editar nenhum node do n8n. Motivo da mudança de decisão: cadastro de setor pela UI é justamente o cenário que o `codigoPorOpcao` fixo tornava chato (editar workflow toda vez) — o próprio ponto da tela `/departamentos` era eliminar edição direta de configuração; deixar o menu preso a um mapeamento hardcoded contradizia isso.

Sem mudança de backend — `GET /departments` já devolvia tudo que o menu precisa (`nome`, `codigo`, ordenado por `nome` via `DepartmentsService.findAll`, ver `departments.service.ts`). Só o workflow do n8n mudou (`fluxo-completo-com-backend.json`):

- **`Buscar Departamentos`** (GET `/departments`) foi movido pra **antes** da checagem de escolha — passa a rodar sempre que a mensagem chega dentro do horário de funcionamento (`Dentro do Horário de Funcionamento?` → true), não só quando o texto já bate `1-5`. É usado tanto pra validar a escolha quanto pra montar o menu, então precisa existir nos dois ramos.
- **`Mapear Departamento` virou `Avaliar Escolha de Departamento`** (mesmo node Code, lógica trocada): em vez do `codigoPorOpcao` fixo (`'1':'RH', '2':'FIN'...`), converte `texto` pra número e indexa direto na lista retornada por `GET /departments` (`departamentos[numero - 1]`) — a numeração do menu é **a ordem alfabética por nome que a API já devolve**, não mais um mapeamento independente. Calcula `opcaoValida` (número inteiro, dentro do intervalo `1..departamentos.length`) em vez de confiar num regex `^[1-5]$` fixo.
- **O IF `Escolheu Departamento? (1-5)` virou `Escolheu Departamento Válido?`**, condição trocada de regex de string pra boolean em `$json.opcaoValida` (mesmo padrão de operador já usado em `Dentro do Horário de Funcionamento?`) — assim o intervalo válido acompanha quantos setores existem, sem precisar saber o número de antemão.
- **Node novo `Montar Menu`** (Code): monta o texto do menu (`"1 - Nome\n2 - Nome..."`) a partir da mesma lista de `departamentos` já buscada, no ramo "não" do IF — substitui o texto `"1 - RH\n2 - Financeiro..."` que antes estava hardcoded dentro do `jsonBody` do node `Enviar Menu`.
- **`Enviar Menu`** e **`Montar Confirmação`** só tiveram a fonte dos dados trocada (`$json`/`$('Avaliar Escolha de Departamento')` em vez de `$('Combinar Fragmentos')`/`$('Mapear Departamento')`) — mesmo comportamento de envio.

**Trade-off aceito conscientemente**: a numeração dos 5 setores originais muda (passa a seguir ordem alfabética do `nome`, não mais a ordem fixa RH/FIN/CONT/TI/COM) — era exatamente o efeito colateral que tinha feito descartar essa abordagem em 2026-07-31. Decisão agora: aceitar a renumeração em troca de setor novo funcionar sozinho, dado que cadastro de setor pela UI é o caso que mais importa daqui pra frente.

- **`n8n-novo-setor.md` marcado como obsoleto** (mantido só como histórico) — não é mais necessário editar o n8n a cada setor novo.
- **Reimportado em 2026-08-05** (junto com a feature de mídia abaixo, mesmo arquivo). Fluxo geral validado pelo usuário nesse reimport — numeração específica dos setores não foi reconfirmada isoladamente nesta sessão.

### Mensagens de mídia do WhatsApp (imagem, áudio, documento, vídeo) — receber e enviar (2026-08-05, vídeo em 2026-08-07)

Item que já estava mapeado como próximo passo desde 2026-08-04 (ver "Anexos/mídia" em versões anteriores deste arquivo). Escopo decidido com o usuário: **receber e enviar** nessa mesma entrega, não só visualizar.

**Decisões de escopo** (avaliar antes de expandir):
- Tipos suportados: imagem, áudio (só recebido — nota de voz do cliente toca inline no painel), documento (PDF e afins). **Vídeo, figurinha, localização, contato e enquete ficam fora de escopo** — continuam caindo como mensagem de texto vazia, mesmo comportamento de antes da feature (não quebram o fluxo, só não abrem). Confirmado com o usuário em 2026-08-05 que isso é aceitável por ora, mas é candidato a expansão futura.
- Envio pelo atendente = anexar arquivo (imagem/documento) do dispositivo dele — **não** existe gravação de nota de voz pelo navegador (exigiria captura de microfone, fora de escopo).
- **Armazenamento em disco local** do backend (`backend/uploads/mensagens/`, gitignored), não em nuvem — decisão do usuário, com plano de migrar pra S3 futuramente se o volume justificar. Por isso o acesso a disco fica isolado numa única classe (`MediaStorageService`, ver abaixo) — trocar de storage no futuro é mudança localizada.

**Backend**:
- `Message` ganhou `tipo` (enum `texto`|`imagem`|`audio`|`documento`, default `texto`), `midia_path`, `midia_mimetype`, `midia_nome_arquivo` (migration `AddMessageMedia`, mesmo padrão das anteriores — testada `run`→`revert`→`run`).
- `backend/src/messages/media-storage.service.ts` (`MediaStorageService`, novo): único lugar que lê/escreve arquivo em disco. Valida mimetype contra allowlist por tipo, valida tamanho (15MB decodificado), deriva a extensão do mimetype (nunca do nome de arquivo enviado pelo cliente — evita path traversal), grava em `uploads/mensagens/<id-da-mensagem>.<ext>`.
- `MessagesService.create` (`backend/src/messages/messages.service.ts`) estendido: decodifica/salva mídia antes de persistir (quando `tipo != texto`), aplica legenda de fallback (`"[imagem]"` etc.) quando o cliente não manda caption, e no envio ao WhatsApp (`origem: atendente`) chama `EvolutionService.enviarMidia` (novo método, `POST /message/sendMedia/{instance}`, mesmo padrão de `enviarMensagem`) em vez de `enviarMensagem` quando há mídia. Áudio de saída pelo atendente é bloqueado explicitamente (`BadRequestException`) — reforça o limite de escopo mesmo que alguém chame a API direto.
- Endpoint novo `GET /conversations/:conversationId/messages/:id/media` (`JwtAuthGuard`, só o painel autenticado — o n8n só empurra mídia pra dentro, nunca precisa reler) — serve o arquivo do disco com o `Content-Type` certo.
- **Bug real encontrado e corrigido**: o limite padrão do Express (100kb) bloqueava qualquer imagem/documento de verdade em base64 — corrigido em `main.ts` com `app.useBodyParser('json', { limit: '20mb' })`. Sem isso a feature inteira falharia silenciosamente com mídia real (só payloads de teste minúsculos passariam).

**n8n** (`fluxo-completo-com-backend.json`, só o ramo "200, conversa já existe" de `Verificar Conversa Ativa` — mídia mandada antes de escolher departamento continua caindo como texto vazio, mesmo comportamento de sempre, fora de escopo):
- `Extrair Dados da Mensagem` detecta o tipo pela presença de `data.message.imageMessage`/`audioMessage`/`documentMessage` e extrai `tipo` + `midia_message_id` (= `data.key.id`) — mimetype/nome de arquivo **não** vêm daqui, vêm da resposta do download (mais confiável que confiar no que o webhook declarou).
- Node novo `É Mensagem de Mídia?` (IF) → **true**: `Buscar Mídia` (`POST /chat/getBase64FromMediaMessage/{instance}`, body só com `key.id`) → `Montar Mensagem de Mídia` (Code, monta o body final) → `Registrar Mensagem do Cliente`. **false**: fluxo de texto original inalterado (`Preparar Mensagem do Cliente` → mesmo node final).
- `Registrar Mensagem do Cliente` agora manda `tipo`/`midia_base64`/`midia_mimetype`/`midia_nome_arquivo` no body além de `origem`/`mensagem` — campos ausentes (caminho de texto puro) viram `undefined` e o `JSON.stringify` do n8n já os omite, sem precisar de lógica condicional no body.
- **Decisão de arquitetura validada na Fase 0** (antes de escrever qualquer código, mesma metodologia do teste de `sendList`): testei `POST /chat/findMessages` (pra achar os `key.id` reais), `POST /chat/getBase64FromMediaMessage` e `POST /message/sendMedia` direto contra a instância real (`v2.3.7`) — os três funcionaram limpo, sem o tipo de bug interno que o `sendList` teve. Optei por **não** usar a opção "Webhook Base64" da Evolution API (embutir o conteúdo direto no payload do webhook) — o campo exato onde apareceria não é documentado e tem um limite de tamanho incerto (~12MB); o download explícito via `getBase64FromMediaMessage` usando só o `key.id` é mais previsível e já validado. **Webhook Base64 pode continuar desativado na instância**, não é usado.

**Frontend**:
- `types/index.ts`: `Message` e `SendMessagePayload` ganharam `tipo`/`midia_mimetype`/`midia_nome_arquivo` (e `midia_base64` no payload de envio).
- `lib/api.ts`: `getMediaObjectUrl(conversationId, messageId)` — busca o arquivo via o client axios autenticado (`responseType: 'blob'`, evita token em query string) e devolve uma object URL.
- `components/ui/MediaMessage.tsx` (novo): busca a mídia sob demanda e renderiza por tipo — `<img>` com link pra abrir em nova aba (imagem), `<audio controls>` (áudio), card com ícone + link de download (documento). Usado tanto pra mensagens recebidas quanto enviadas.
- `conversas/[id]/page.tsx`: bolha de mensagem usa `MediaMessage` quando `m.tipo != texto` (mantendo a legenda abaixo, exceto quando é só o fallback padrão tipo `"[imagem]"`). Área de envio ganhou botão de anexo (`Paperclip`) + `<input type="file">` oculto — valida mimetype/tamanho no client (mesma allowlist do backend, fail-fast) antes de habilitar o envio; permite mandar só anexo sem texto (legenda vira opcional).

**Testado com WhatsApp real em 2026-08-05, validado pelo usuário**: imagem, áudio e documento recebidos aparecem certos no painel; anexo enviado pelo painel chegou no WhatsApp como mídia com a legenda assinada (`*Nome - Setor:*`, mesmo padrão de texto). Vídeo e figurinha confirmadamente não abriam nessa entrega (fora de escopo, ver acima).

#### Vídeo adicionado (2026-08-07)

Figurinha continua fora de escopo — decisão do usuário em 2026-08-05 foi priorizar vídeo (ver `project_midia_video_prioridade` na memória). Implementado seguindo exatamente o padrão já estabelecido pra imagem/documento (**bidirecional**, ao contrário de áudio que só recebe):

- **Backend**: `MessageTipo` ganhou `VIDEO = 'video'` (`message.entity.ts`). Migration `AddVideoMessageTipo` recria o enum Postgres `messages_tipo_enum` com o valor novo (não usei `ALTER TYPE ... ADD VALUE` porque essa forma não pode ser lida na mesma transação em que é criada, e as migrations deste projeto rodam em transação — mesmo cuidado que motivou o padrão de recriação já usado em `AddMessageMedia`/`InitialSchema`). Testada `run`→`revert`→`run` contra o Postgres de dev (porta 5433).
  `MediaStorageService` ganhou allowlist pro tipo `video`: `video/mp4` e `video/3gpp` (os dois formatos que o WhatsApp usa na prática — mp4 é o que o próprio app grava, 3gpp aparece em aparelhos Android mais antigos). `EvolutionService.enviarMidia` e `MessagesService` (`MEDIATYPE_EVOLUTION_POR_TIPO`) passam `mediatype: "video"` pra Evolution API nesse caso. Legenda de fallback: `"[vídeo]"`. Diferente do áudio, **não** há bloqueio de envio pelo atendente — anexar vídeo do dispositivo funciona igual a imagem/documento (sem a limitação de captura de mídia que bloqueia áudio de saída).
- **n8n**: `Extrair Dados da Mensagem` ganhou mais um `else if` (`msg.videoMessage` → `tipo = 'video'`, `texto = msg.videoMessage.caption`). Nenhuma outra mudança no workflow foi necessária — o IF `É Mensagem de Mídia?` e o node `Montar Mensagem de Mídia` já eram genéricos (comparam/repassam `tipo` sem hardcoded de valores), então video passou a fluir pelo mesmo caminho de imagem/documento automaticamente.
- **Frontend**: `types/index.ts` (`MessageTipo` ganhou `"video"`), `MediaMessage.tsx` (renderiza `<video controls>` quando `tipo === "video"`), `conversas/[id]/page.tsx` (`MIME_PARA_TIPO`/`accept` do input de arquivo/`LEGENDAS_PADRAO` incluem vídeo — o resto da lógica de anexo já era genérico por tipo).
- `tsc --noEmit` e `npm run build` (backend e frontend) confirmados limpos. **Não testado com WhatsApp real nesta sessão** (sem acesso ao navegador/Chrome) — validar manualmente (receber um vídeo real do WhatsApp e anexar um vídeo pelo painel) antes de considerar "testado com cliente real", mesmo padrão já usado pra respostas rápidas.

**Achado à parte, não corrigido (fora do escopo desta feature)**: durante o teste, `POST /conversations/:id/messages` (e o evento de socket `nova_mensagem`) mostrou devolver o objeto `atendente` completo, **incluindo `senha_hash`** — pré-existente, não introduzido por esta mudança, mas é uma exposição real (rota é pública, sem guard). Ver "Próximos passos".

### Grupos do WhatsApp — não disparar menu de setor + aba `/grupos` (2026-08-15)

Motivo: quando o número do atendimento é adicionado a um grupo do WhatsApp (ex: dono do contato monitorando um grupo), toda mensagem do grupo disparava o menu de departamentos igual a um cliente novo — quebrava a experiência do grupo e podia confundir o fluxo. Pedido do usuário: (1) grupo nunca deve ver o menu; (2) uma aba separada no painel pra visualizar e **responder** grupos, sem fila/status, aberta a **todos os setores** desde já (sem filtro por departamento).

**Decisão de escopo** (perguntado ao usuário antes de implementar): grupo permite visualizar **e responder** pelo painel (não é só monitoramento read-only), e não entra na lógica de fila/status (sem aguardando → assumir → finalizar) — é só uma lista à parte, sempre aberta, qualquer atendente pode abrir e mandar mensagem.

**Backend**: `Conversation` ganhou `tipo` (enum `cliente`|`grupo`, default `cliente`) e `departamento_id` virou nullable — grupo não pertence a setor nenhum (migration `AddConversationTipoGrupo`, testada run/revert/run). `ConversationsService.findAll` filtra por `tipo` sempre; **sem o parâmetro explícito, assume `cliente`** — preserva o comportamento de toda chamada existente (fila, dashboard) sem precisar tocar em cada uma; a tela `/grupos` passa `tipo=grupo` explicitamente. `CreateConversationDto.departamento_id` só é obrigatório quando `tipo` (ausente = cliente) é `cliente` (`@ValidateIf`). `assumir`/`transferir`/`finalizar` agora rejeitam (`400`) uma conversa de grupo — esses conceitos não existem pra grupo.

Grupo não tem "atendente da conversa assumida" (não existe assumir), que é de onde `MessagesService.create` sempre tirou quem está respondendo (pra `atendente_id` da mensagem e a assinatura `*Nome - Setor:*` mandada ao WhatsApp). Pra grupo, isso agora vem explícito no payload: `CreateMessageDto` ganhou `atendente_id` opcional, obrigatório só quando `origem = atendente` **e** a conversa é grupo (senão `400`) — o backend busca esse `User` (com `departamento`) e usa como "remetente" tanto pro campo salvo quanto pra assinatura. Pra conversa de cliente nada mudou (continua vindo de `conversa.atendente`). **Mesmo trade-off de confiança já documentado** pra essa rota (pública, sem guard, pensada pro n8n) — aceitar um `atendente_id` no payload não é uma categoria nova de risco.

Não existia `GET /conversations/:id` (o frontend buscava a lista inteira e filtrava client-side, workaround já anotado neste arquivo como "corrigir se um dia virar gargalo") — abrir um grupo específico por id era o gatilho natural pra resolver isso agora: adicionado `GET /conversations/:id` (`JwtAuthGuard`), e `getConversation(id)` no frontend passou a chamá-lo direto em vez de buscar tudo e filtrar.

**n8n** (`fluxo-completo-com-backend.json`): `Extrair Dados da Mensagem` detecta grupo pelo `remoteJid` terminando em `@g.us` (contato individual termina em `@s.whatsapp.net`) — quando é grupo, `telefone` guarda o **JID inteiro** (não só os dígitos, como pro cliente), porque é isso que a Evolution API exige no campo `number` pra responder num grupo (não existe "número" de grupo). `nome` fica `null` pra grupo (buscar o nome do grupo exigiria uma chamada extra à Evolution API, fora de escopo — aparece como "Grupo sem nome" no painel, mesmo padrão de "Cliente sem nome").

A interceptação acontece só no branch de erro (404) de `Verificar Conversa Ativa` — mensagens de um grupo que **já tem conversa** continuam fluindo pelo mesmo caminho de sempre (branch 200 → `É Mensagem de Mídia?` → registro), sem nenhuma mudança, já que esse caminho já era genérico o bastante. Só a **criação** de uma conversa nova precisou de tratamento: node novo `É Mensagem de Grupo?` (IF, checa `eh_grupo`) no branch de erro — **true** vai pra `Criar Conversa de Grupo` (`POST /conversations`, `tipo: grupo`, sem `departamento_id`, sem `mensagem_inicial` — a primeira mensagem é registrada depois pelo caminho normal de mídia/texto, não pelo campo `mensagem_inicial`, que perderia mídia se a primeira mensagem do grupo fosse uma imagem); **false** segue pro debounce de sempre (fluxo de cliente novo, inalterado). Um node novo `Definir Conversa Atual` (Code, passthrough) foi inserido entre as duas origens possíveis da conversa (`Verificar Conversa Ativa` 200, ou `Criar Conversa de Grupo`) e `É Mensagem de Mídia?` — existe só pra dar um nome de node estável pra `Montar Mensagem de Mídia` referenciar (antes apontava direto pra `Verificar Conversa Ativa`, o que quebraria quando a conversa viesse de `Criar Conversa de Grupo` em vez disso).

**Efeito prático**: grupo nunca mais recebe o menu de departamentos (a checagem de horário de funcionamento e o menu ficam inteiramente fora do caminho de grupo — mensagem de grupo é registrada 24/7, não tem sentido de "fora do expediente" pra um canal que ninguém está "atendendo" como fila).

**Frontend**: `frontend/src/app/(painel)/grupos/page.tsx` (novo) — lista paginada (5 por página, mesmo padrão da fila) com busca por nome, sem filtro de setor (grupo é global) e sem abas de status. Item de nav "Grupos" em `NAV` (não `NAV_ADMIN` — visível a **todos** os atendentes, "todos os setores têm acesso" foi pedido explícito). Abrir um grupo reaproveita a tela de chat existente (`conversas/[id]/page.tsx`) em vez de criar uma tela nova — ela já era genérica o bastante: agora esconde Transferir/Finalizar/`StatusBadge` quando `conversa.tipo === "grupo"`, `podeResponder` passa a ser sempre `true` pra grupo (não depende de `status === "em_atendimento"`), e `handleEnviar` manda `atendente_id: user?.id` no payload quando é grupo.

**Fora de escopo deliberadamente** (avaliar só se o uso real pedir): nome do grupo buscado automaticamente via API (aparece como "Grupo sem nome"); badge de não lidas/toast de notificação pra mensagem de grupo (`useNotifications` só reage a `conversa_atendente_id === user.id`, que pra grupo é sempre `null` — mensagem de grupo não gera notificação hoje).

**Testado nesta sessão via curl contra o backend containerizado** (rebuild das imagens Docker de backend/frontend com o código novo — ver "Backend e frontend também containerizados" abaixo): criar conversa de grupo sem `departamento_id`, `GET by-phone`/`GET /conversations/:id` retornando o registro certo, `GET /conversations` sem `tipo` continua devolvendo só clientes (grupo de teste não vazou pra fila), `GET /conversations?tipo=grupo` devolve o grupo, mensagem de "cliente" (participante do grupo) registrada sem auth, resposta de atendente sem `atendente_id` rejeitada com 400, resposta com `atendente_id` salva e assinada corretamente (`atendente: "Administrador"` no histórico), `assumir`/`finalizar` num grupo rejeitados com 400. Migration testada run/revert/run. `tsc --noEmit` e `npm run build` limpos nos dois lados. **Não testado visualmente no navegador nesta sessão** (extensão do Chrome não conectada) — validar a tela `/grupos` e o chat de grupo no navegador, e o fluxo real via WhatsApp (grupo real recebendo mensagem sem menu), antes de considerar "testado com cliente real", mesmo padrão já usado no resto do projeto.

### Remetente em grupo, mensagens enviadas direto do celular e envio de áudio pelo painel (2026-08-17)

Três pedidos do usuário na mesma sessão, todos ligados a mensagens do WhatsApp — implementados juntos porque compartilham a mesma migration e boa parte do caminho no n8n.

#### 1. Identificar quem mandou cada mensagem num grupo

Antes, mensagem de grupo (origem cliente) não guardava quem dentro do grupo escreveu — só o texto. `Message` ganhou `remetente_nome`/`remetente_telefone` (nullable, `text`), preenchidos **só quando origem = cliente e a conversa é grupo** (1:1 não precisa, o remetente já é a própria conversa). `CreateMessageDto` ganhou os dois campos opcionais; `MessagesService.create` só persiste o que vier no payload, sem validação — mesmo nível de confiança já documentado pras outras rotas públicas.

n8n (`Extrair Dados da Mensagem`): além de `eh_grupo`, agora extrai `remetente_nome`/`remetente_telefone` a partir de `data.pushName`/`data.key.participant` do webhook — **só quando é grupo e não é fromMe** (`participant` é o JID do membro do grupo que escreveu; não existe pra mensagem 1:1 nem pra mensagem nossa). `Preparar Mensagem do Cliente`/`Montar Mensagem de Mídia` repassam esses campos pro body de `POST .../messages` só no ramo de grupo.

Frontend: bolha de mensagem em `conversas/[id]/page.tsx` mostra `remetente_nome || remetente_telefone` acima do texto (mesma posição/estilo do nome do atendente, só que do lado do cliente) quando `m.origem === "cliente" && conversa.tipo === "grupo"`.

#### 2. Mensagem enviada direto do celular conectado (fora do painel) aparecer no histórico

Até aqui, o webhook (`Extrair Dados da Mensagem`) descartava **todo** evento `fromMe: true` (`data.key.fromMe`) logo no início — premissa original: a única forma de mandar mensagem era pelo painel, que já registra a mensagem sozinho (não precisa de eco via webhook). Só que isso também descartava mensagens mandadas **direto pelo aparelho físico** (o dono do número respondendo do próprio celular, fora do sistema) — o atendente não via essas mensagens no painel. Pedido do usuário: fazer essas mensagens aparecerem no histórico, sem precisar saber quem mandou (não dá pra saber — não veio do painel, não tem usuário logado envolvido).

**Risco central**: se o webhook passar a processar `fromMe: true`, ele também vai processar o **eco da própria mensagem que o painel acabou de mandar** (a Evolution API dispara `messages.upsert` pra toda mensagem que passa pela conexão, inclusive as que a própria Evolution API enviou a pedido do backend) — sem alguma forma de reconhecer "essa eu já registrei", toda mensagem do atendente apareceria duplicada.

**Solução — dedup por id da mensagem no WhatsApp**: `Message` ganhou `evolution_message_id` (nullable, `text`, índice). Dois lados:
- **Mensagem enviada pelo painel** (`MessagesService.create`, `origem: atendente` de verdade): `EvolutionService.enviarMensagem`/`enviarMidia` agora devolvem `{ id }` (extraído de `key.id` da resposta da Evolution API, antes ambos retornavam `void`). Depois do envio, o `id` é gravado em `Message.evolution_message_id` via `update()` (a linha já tinha sido salva antes, pro `path` de mídia poder usar o id da mensagem — ver `MediaStorageService`).
- **Mensagem enviada direto do celular**: n8n manda `origem_externa: true` + `evolution_message_id: <key.id do webhook>` no `POST .../messages`. `MessagesService.create` checa isso **antes de qualquer outra coisa**: se já existe uma `Message` com esse `evolution_message_id`, devolve ela sem criar duplicata nem reemitir o evento de socket — cobre tanto o eco de uma mensagem do painel quanto uma possível reexecução do mesmo webhook pelo n8n.

Quando `dto.origem_externa` é `true`, `MessagesService.create` pula inteiro o bloco que resolve remetente (`conversa.atendente`/`atendente_id` do grupo) **e** o bloco que dispara `enviarMensagem`/`enviarMidia` — a mensagem só é registrada (`atendente_id: null`, sem assinatura), nunca reenviada ao WhatsApp (já foi entregue por fora). Funciona tanto pra conversa de cliente quanto de grupo, sem distinção — um grupo em que o dono do número respondeu direto pelo celular também aparece no painel.

n8n: `Extrair Dados da Mensagem` não descarta mais `fromMe` — extrai `eh_from_me: data.key.fromMe` e `wa_message_id: data.key.id` (renomeado de `midia_message_id`, agora usado tanto pra baixar mídia quanto pra dedup) sempre. Novo node `É Mensagem Minha Sem Conversa Existente?` (IF, inserido entre o branch de erro/404 de `Verificar Conversa Ativa` e `É Mensagem de Grupo?`) — se `eh_from_me` e **não existe conversa pra esse telefone/grupo ainda**, a execução simplesmente para (branch verdadeiro sem conexão, mesmo padrão já usado no debounce): não faz sentido criar conversa nem mandar menu de departamento a partir de uma mensagem que nós mesmos mandamos. Se existe conversa (branch 200, o caso normal), a mensagem flui pelo **mesmo caminho já existente** de detecção de mídia/registro (`Definir Conversa Atual` → `É Mensagem de Mídia?` → ...) — `Preparar Mensagem do Cliente`/`Montar Mensagem de Mídia` agora calculam `origem`/`origem_externa`/`evolution_message_id` dinamicamente a partir de `eh_from_me` em vez de fixar `origem: "cliente"`, e `Registrar Mensagem do Cliente` usa `$json.origem` no lugar do valor fixo.

Frontend: mensagem com `origem === "atendente"` e `atendente` nulo (só acontece nesse caso — mensagem normal do painel sempre resolve um `atendente`, mesmo que seja `conversa.atendente`) mostra a etiqueta "Enviado pelo celular" no lugar do nome, mesma posição visual da assinatura do atendente.

**Limitação conhecida, aceita pra este MVP**: existe uma janela de corrida entre o backend salvar a mensagem do painel e o `update()` que grava `evolution_message_id` nela — se o webhook do n8n processar o eco **antes** desse `update()` terminar, a dedup pode falhar e a mensagem aparecer duplicada uma vez. Na prática o `update()` roda a poucos milissegundos da resposta HTTP da Evolution API, bem mais rápido que o tempo do n8n processar o webhook (o ramo de cliente tem até um debounce de 6s no meio) — risco baixo, não veio junto com mitigação adicional.

#### 3. Envio de áudio pelo painel (antes só recebia)

`MessagesService.create` tinha um bloqueio explícito (`BadRequestException`) pra `tipo: audio` + `origem: atendente` — removido. `MEDIATYPE_EVOLUTION_POR_TIPO` ganhou `audio → "audio"` (mediatype que a Evolution API aceita em `POST /message/sendMedia`, mesmo endpoint genérico já usado pra imagem/documento/vídeo — **não** foi usado o endpoint dedicado `sendWhatsAppAudio` da Evolution API, que gera nota de voz com waveform/PTT; `sendMedia` com `mediatype: audio` entrega como anexo de áudio comum, tocável, mas não necessariamente com a mesma aparência de nota de voz. Se isso não for satisfatório no teste real, trocar pro endpoint dedicado é a alternativa). `EvolutionService.enviarMidia` teve o tipo do parâmetro `mediatype` ampliado pra incluir `'audio'`.

`MediaStorageService` (allowlist de mimetype) e `MediaMessage.tsx` (renderização) já eram genéricos por tipo desde que áudio recebido foi implementado — nenhuma mudança neles. Frontend: `MIME_PARA_TIPO`/`accept` do input de arquivo em `conversas/[id]/page.tsx` ganharam `audio/ogg`, `audio/mpeg`, `audio/mp4`. Continua **sem gravação de nota de voz pelo navegador** (fora de escopo, mesma decisão original) — envio é sempre anexar um arquivo de áudio já existente no dispositivo, igual a imagem/documento/vídeo.

`tsc --noEmit` e `npm run build` (backend e frontend) confirmados limpos, e o JSON do workflow validado (sintaxe, todas as conexões apontando pra nodes existentes, `jsCode` de todo node Code parseável). **Não testado com WhatsApp real nesta sessão** (Docker/Postgres de dev fora do ar, sem acesso à instância) — a migration (`AddMessageRemetenteEEvolutionId`) não foi rodada contra o banco de dev por esse motivo. Antes de considerar "testado com cliente real": rodar `npm run migration:run`, reimportar o workflow no n8n (reconfigurar credenciais Redis/SMTP, mesmo trade-off de sempre), e validar as três coisas manualmente — nome/telefone aparecendo em mensagem de grupo, mensagem mandada do celular aparecendo no painel sem duplicar o que o painel manda, e áudio anexado pelo painel chegando de forma utilizável no WhatsApp do cliente.

### Gravação de áudio pelo microfone do navegador (2026-08-17)

Complementa o envio de áudio anexado (ver seção anterior): antes só dava pra mandar áudio pelo painel anexando um arquivo já existente no dispositivo. Agora existe também um botão de microfone que grava direto do navegador (`MediaRecorder`), sem depender de um app externo de gravação.

- **Reaproveita o mecanismo de anexo já existente** (`AnexoStaged`) — gravar e parar monta um `Blob`, converte pra base64 (mesmo `FileReader.readAsDataURL` já usado no anexo por arquivo) e chama `setAnexo({ tipo: "audio", ... })`. Daí em diante segue o fluxo normal de envio (preview, botão de remover, `sendMessage`) sem nenhuma lógica nova — só a origem do `anexo` muda.
- **Escolha de mimetype** (`escolherMimeTypeGravacao` em `conversas/[id]/page.tsx`): tenta `audio/ogg;codecs=opus` (nativo no Firefox), depois `audio/webm;codecs=opus`/`audio/webm` (Chrome/Edge não gravam ogg via `MediaRecorder`, só webm) — se nenhum for suportado, deixa o navegador escolher. `MediaStorageService`/`EvolutionService` (backend) e `MIME_PARA_TIPO` (frontend) ganharam as variantes de `audio/webm` na allowlist por causa disso.
- **UI**: clicar no microfone troca a barra de input (anexo/texto) por um indicador "Gravando áudio... mm:ss" com dois botões — parar (monta o anexo, mesma revisão antes de enviar que qualquer outro anexo) e cancelar (descarta sem gerar anexo, via `mediaRecorder.onstop = null` antes de parar, pra não disparar a montagem). O botão de envio some/desabilita enquanto grava. Preview do áudio staged (antes de enviar) usa `<audio controls src="data:...;base64,...">` direto do `anexo.base64`, sem round-trip pro backend.
- **Sem transcrição, sem limite de duração configurável, sem waveform** — fora de escopo, matching a filosofia MVP do projeto. `getUserMedia`/`MediaRecorder` exigem contexto seguro (HTTPS ou `localhost`) — **se o painel for servido em HTTP puro num IP de LAN** (topologia possível dependendo de como cada cliente do SaaS acessa o Maré, ver `project_saas_hosting_model` na memória), o botão de microfone falha silenciosamente com "Não foi possível acessar o microfone" mesmo com a permissão concedida, porque o navegador nem oferece a API fora de um contexto seguro — vale lembrar disso se o suporte reportar o botão "não funcionando" num ambiente sem HTTPS.

`tsc --noEmit`/`npm run build` (backend e frontend) confirmados limpos. **Não testado com microfone/WhatsApp real nesta sessão** — validar manualmente: gravar, parar, ouvir o preview antes de enviar, conferir que chega como áudio tocável no WhatsApp do cliente (mesma ressalva já registrada sobre `mediatype: audio` do `sendMedia` na seção anterior).

### Aba de Contatos — sincroniza do WhatsApp + lista própria com importar/exportar (2026-08-17)

Pedido do usuário: uma aba visível a **todos os atendentes** (não admin-only, mesmo padrão de `/grupos`) mostrando os contatos salvos no número conectado, com botões de adicionar/importar/exportar. Decisão de arquitetura perguntada ao usuário antes de implementar (ver memória `project_contatos_fonte_dados`): sincronizar do WhatsApp via Evolution API, **não** uma lista 100% local — mas como o Baileys não expõe criar contato no telefone via API, "adicionar" só existe no nosso banco. Por isso a tela mostra duas listas separadas em vez de uma mesclada:

- **"Contatos do WhatsApp"**: busca ao vivo via `EvolutionService.getContacts` (`POST /chat/findContacts/{instance}`), **nunca persistida** — toda visita à tela refaz a chamada (botão "Atualizar" força um novo fetch manual; sem polling automático, ao contrário de `/whatsapp`, que monitora conexão e por isso justifica polling — contato muda bem menos que status de conexão). Endpoint novo `GET /contacts/whatsapp?instance=` devolve o JSON cru da Evolution API sem normalizar (mesmo padrão de `/whatsapp/status`/`/whatsapp/qrcode` — formato varia entre versões); quem normaliza (`pushName`/`id`/`remoteJid` → nome/telefone, filtra grupo `@g.us` e `broadcast`, dedup por telefone) é `normalizarContatoWhatsapp` em `contatos/page.tsx`. **Não testado contra uma instância real nesta sessão** — o formato exato do payload de `findContacts` pode divergir do esperado; se a lista vier vazia ou malformada com uma instância real conectada, ajustar o normalizador primeiro antes de suspeitar do backend.
- **"Contatos adicionados no Maré"**: entidade nova `Contact` (`backend/src/contacts/`, migration `AddContacts`) — `nome`/`telefone` (único), sem relação com nenhuma outra tabela (por isso **exclusão é hard delete de verdade**, diferente do soft-delete de `User`: não existe FK apontando pra `contacts`, não tem histórico pra preservar). CRUD completo (`GET/POST/PATCH/DELETE /contacts`) atrás só de `JwtAuthGuard` — **sem `RolesGuard`/`@Roles(admin)`**, de propósito: a tela é aberta a todos, então a API também precisa ser.
- **Importar**: botão abre um `<input type="file" accept=".csv">` oculto; o CSV é lido e parseado **inteiramente no navegador** (`parseCsv` em `contatos/page.tsx` — parser simples, sem suporte a vírgula dentro de aspas escapadas de verdade, formato esperado `nome,telefone` por linha, detecta e pula uma provável linha de cabeçalho heuristicamente checando se a segunda coluna "parece telefone") e manda um array já pronto pra `POST /contacts/import` (`ImportContactsDto`, `class-validator` com `@ValidateNested`). Backend importa **best-effort**: linha com telefone duplicado ou campo vazio é ignorada sem interromper o resto do arquivo, resposta `{ criados, ignorados }` mostrada na tela. Não existe upload de arquivo multipart no backend — todo o parsing acontece no cliente, evitando precisar do `multer`/tratamento de arquivo no NestJS só pra isso.
- **Exportar**: gerado **inteiramente no frontend** (`exportarCsv`), sem endpoint novo no backend — junta as duas listas já carregadas na tela (WhatsApp + Maré, com uma coluna `origem` indicando de qual veio) num CSV e dispara o download via `Blob` + `<a download>` temporário. Reimportar esse mesmo CSV funciona (mesmo parser do import), inclusive pra "promover" um contato só sincronizado do WhatsApp pra lista própria do Maré (fica editável depois).
- **Frontend**: item de nav "Contatos" em `NAV` (não `NAV_ADMIN`, ver "Grupos do WhatsApp" pro mesmo padrão), ícone `BookUser`. Tela reaproveita o esqueleto visual de `/departamentos` (form inline criar/editar, `ConfirmModal` só na exclusão) mas com duas seções de lista em vez de uma.

`tsc --noEmit`/`npm run build` limpos nos dois lados. **Não testado nesta sessão** (Docker/Postgres de dev fora do ar — migration `AddContacts` não rodada; sem instância WhatsApp real pra validar `findContacts`). Antes de considerar concluído: `npm run migration:run`, e validar manualmente contra uma instância real — se `findContacts` devolver um formato inesperado, ajustar `normalizarContatoWhatsapp` é o primeiro lugar a olhar.

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
- [x] ~~Setor novo aparecendo no menu do WhatsApp: processo manual...~~ **Substituído pelo menu dinâmico em 2026-08-05** — ver item abaixo. `n8n-novo-setor.md` marcado obsoleto.
- [x] Menu dinâmico do WhatsApp — lê `GET /departments` em vez do `codigoPorOpcao` fixo (2026-08-05). Reimportado junto com a feature de mídia abaixo; fluxo geral validado pelo usuário. Ver "Menu dinâmico do WhatsApp" acima.
- [x] Mensagens de mídia do WhatsApp (imagem, áudio, documento) — receber e enviar (2026-08-05). Migration + `MediaStorageService` + endpoint de mídia no backend, detecção/download/registro no n8n (só ramo "conversa já existe"), botão de anexo + `MediaMessage` no frontend. **Testado com WhatsApp real, validado pelo usuário** — recebido e enviado funcionando. Ver "Mensagens de mídia do WhatsApp" acima, incluindo o bug do limite de body do Express (100kb → 20mb) encontrado e corrigido.
- [x] Suporte a vídeo nas mensagens de mídia (2026-08-07) — mesmo padrão bidirecional de imagem/documento (receber e enviar pelo painel), `MessageTipo.VIDEO`, migration `AddVideoMessageTipo` (testada run/revert/run), allowlist `video/mp4`+`video/3gpp`, detecção de `videoMessage` no n8n, `<video controls>` em `MediaMessage.tsx`. `tsc`/`build` limpos nos dois lados. **Validado com WhatsApp real pelo usuário em 2026-08-15.** Figurinha, localização, contato e enquete seguem fora de escopo. Ver "Mensagens de mídia do WhatsApp" acima.
- [x] `senha_hash` vazando em `Message.atendente` corrigido (2026-08-07) — mesmo padrão `Omit<User,'senha_hash'>` do `UsersService`, agora também em `MessagesService.create`/`findByConversation`. Ver "`GET /users` e `POST /users` nunca retornam `senha_hash`" acima.
- [x] `content` do Tailwind generalizado pra um único glob cobrindo `src/**` (2026-08-07), em vez de listar pasta por pasta — elimina a classe de bug do toast invisível (pasta nova sem scan). Ver "Bug: toast invisível" acima.
- [x] Respostas rápidas categorizadas no chat + mensagens automáticas ao Assumir e ao Finalizar (2026-07-31), só frontend, reaproveitando `POST /conversations/:id/messages` existente. Ver "Respostas rápidas + mensagens automáticas" acima. Build e `tsc --noEmit` limpos; não testado com WhatsApp real nesta rodada (extensão do Chrome indisponível na sessão — validar manualmente antes de considerar "testado com cliente real", seguindo o padrão do resto do projeto).
- [x] Paginação (5 por página) nas 3 abas da fila — Na fila/Em atendimento/Finalizadas (2026-07-31). `GET /conversations` ganhou `pagina`/`por_pagina` opcionais sem quebrar os usos existentes sem paginação (dashboard, `getConversation`). Testado via curl contra os 15 registros finalizados reais do Postgres de dev (`total`/página 1/página 2 batendo certo). Ver "Paginação nas abas da fila" acima.
- [x] Página de status/uptime — `/status` (pública, manual) + `/status/publicar` (admin) (2026-08-04). Testado via curl (POST/GET com guard admin) e build/tsc do frontend limpos, **e testado visualmente no navegador, validado pelo usuário em 2026-08-05.** Ver "Página de status/uptime" acima.
- [x] Horário de funcionamento configurável + resposta automática fora do expediente no WhatsApp (2026-08-04). Backend (`/business-hours`) testado via curl (GET público com `aberto` calculado, PATCH admin). Frontend (`/horario-funcionamento`) com build/tsc limpos. n8n: workflow reimportado pelo usuário (credenciais de Redis/SMTP reconfiguradas na UI) e **testado ponta a ponta via curl no webhook** — horário fechado bloqueia tanto texto livre quanto escolha de departamento válida (1-5) sem criar conversa; horário aberto continua criando conversa normalmente (sem regressão). Ver "Horário de funcionamento configurável" acima.
- [x] Grupos do WhatsApp não disparam mais o menu de departamentos + aba `/grupos` no painel pra visualizar e responder (sem fila/status, aberta a todos os setores) (2026-08-15). `Conversation.tipo` (cliente/grupo), `GET /conversations/:id` novo (substitui o workaround de buscar a lista inteira), `atendente_id` explícito no payload de mensagem pra grupo (não tem "assumir"). n8n intercepta só na criação da conversa (branch de erro do `Verificar Conversa Ativa`), sem tocar no caminho de conversa já existente. **Testado via curl contra backend/frontend containerizados reais** (migration run/revert/run, criar grupo, registrar mensagem, responder com assinatura correta, guards de assumir/finalizar/transferir rejeitando grupo). `tsc`/`build` limpos nos dois lados. **Não testado visualmente no navegador nem com WhatsApp real nesta sessão** (extensão do Chrome não conectada) — validar `/grupos`, o chat de grupo, e um grupo real do WhatsApp recebendo mensagem sem menu, antes de considerar "testado com cliente real". Ver "Grupos do WhatsApp" acima.
- [x] Remetente em mensagem de grupo (`remetente_nome`/`remetente_telefone`), mensagens enviadas direto do celular conectado aparecendo no painel (`origem_externa` + dedup por `evolution_message_id`, evita duplicar o que o painel já registrou) e envio de áudio pelo painel (antes só recebia) (2026-08-17). Migration `AddMessageRemetenteEEvolutionId`. `tsc`/`build` limpos nos dois lados; JSON do n8n validado (sintaxe, conexões, `jsCode` de cada node). **Não testado com WhatsApp real nesta sessão** (Docker/Postgres de dev fora do ar) — migration não rodada contra o banco de dev, workflow não reimportado no n8n. Ver "Remetente em grupo, mensagens enviadas direto do celular e envio de áudio pelo painel" acima pro que falta validar manualmente.
- [x] Gravação de áudio pelo microfone do navegador no chat, reaproveitando o mecanismo de anexo já existente (2026-08-17). Ver "Gravação de áudio pelo microfone do navegador" acima. `tsc`/`build` limpos. **Não testado com microfone/WhatsApp real nesta sessão.**
- [x] Aba `/contatos` (aberta a todos os atendentes, não admin-only): sincroniza ao vivo os contatos do WhatsApp conectado (`GET /contacts/whatsapp`, nunca persistido) + lista própria gerenciada pelo Maré (`Contact`, migration `AddContacts`, CRUD completo, hard delete) com importar/exportar CSV feito no frontend (2026-08-17). Decisão de sincronizar do WhatsApp (em vez de lista 100% local) confirmada com o usuário antes de implementar. Ver "Aba de Contatos" acima. `tsc`/`build` limpos nos dois lados. **Não testado nesta sessão** — migration `AddContacts` não rodada (Docker fora do ar) e `GET /contacts/whatsapp` não validado contra uma instância real (formato de `findContacts` da Evolution API incerto).

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

### Backend e frontend também containerizados — `docker-compose.app.yml` (2026-08-09)

Até aqui só a infra (Postgres/Redis/Evolution/n8n/pgAdmin, `docker-compose.yml`) rodava em Docker — backend e frontend rodavam nativos no Windows (ver ajustes acima). Motivado pela decisão já registrada de hospedar o Maré como SaaS (infra isolada por cliente, uma stack `docker-compose` por cliente — ver memória `project_saas_hosting_model`), backend e frontend ganharam `Dockerfile` próprio (multi-stage) e um segundo compose, **`docker-compose.app.yml`** na raiz, deliberadamente separado do da infra.

- **Backend** (`backend/Dockerfile`): base `node:20-bookworm-slim` (glibc), não `alpine` — `bcrypt` usa binário nativo pré-compilado pra glibc; em alpine (musl) precisaria compilar na imagem (python3/make/g++). Build multi-stage: `npm ci` + `nest build` no estágio `builder`, e no estágio final só `npm ci --omit=dev` + `dist/`. Roda `node dist/main` (não usa mais `ts-node`/watch — isso é só pro dev nativo).
- **Frontend** (`frontend/Dockerfile`): mesma base, multi-stage com `next build` no builder e `next start` no final. **`NEXT_PUBLIC_*` entram como `ARG`/build arg**, não só `environment:` do serviço — esses valores são embutidos no bundle JS em build-time (o browser do atendente é quem lê, não o container em runtime), então mudar `NEXT_PUBLIC_API_URL` depois exige rebuildar a imagem, não só reiniciar o container.
- **`docker-compose.app.yml`** conecta os dois serviços na rede já criada pela infra (`atendimento-network`, external, nome real `automacao_atendimento-network` — Compose prefixa com o nome do projeto/pasta, `automacao`) — dentro do container o backend passa a falar `postgres:5432`/`evolution-api:8080` em vez de `localhost:5433`/`localhost:8089` (que só faziam sentido rodando nativo, fora do Docker). Sobe com `docker compose -f docker-compose.yml -f docker-compose.app.yml up -d backend frontend` (precisa da infra já rodando).
- **Portas publicadas continuam as mesmas** (`3000` backend, `3001` frontend) — o frontend acessa a API do browser via `localhost:3000` de qualquer forma (não muda), e **o n8n continua chamando `host.docker.internal:3000` sem nenhuma mudança no workflow**, já que o container do backend publica a mesma porta no host que o processo nativo publicava antes.
- **`uploads/` do backend usa bind mount** (`./backend/uploads:/app/uploads`) — `MediaStorageService` grava relativo a `process.cwd()`, e o bind mount preserva os arquivos entre rebuilds/recriação do container.
- **Migrations continuam rodando de fora do container**, nativas (`cd backend && npm run migration:run`, via PowerShell, contra a porta 5433 publicada pelo Postgres) — a imagem de produção não carrega `ts-node`/devDependencies, então não dá (nem faz sentido) rodar `migration:run` de dentro do container `backend`. Mesmo fluxo já documentado, sem mudança.
- Variáveis novas (`JWT_SECRET`, `JWT_EXPIRES_IN`, `NEXT_PUBLIC_*`) foram acrescentadas ao `.env` da raiz (mesmos valores que já estavam em `backend/.env`/`frontend/.env.local`) — reaproveita o `.env` único que o Compose já carrega automaticamente da raiz, em vez de criar um terceiro arquivo de env só pra isso.
- **Isso é adicional, não substitui o fluxo nativo** — pra iteração rápida no dia a dia (hot-reload), `npm run start:dev`/`npm run dev` nativos continuam sendo o caminho mais rápido (rebuild de imagem Docker é bem mais lento que watch mode). O Docker Compose do app serve pra validar o comportamento "de produção" (build otimizado) e é o primeiro passo real rumo ao modelo de deploy por cliente.
- **Testado em 2026-08-09**: build das duas imagens limpo, os dois containers saudáveis, `GET /departments` (backend, porta 3000) e `/login` (frontend, porta 3001) respondendo via `curl` contra as portas publicadas do host.

**`credsStore` voltou em 2026-08-15** (provável atualização do Docker Desktop reescrevendo `~/.docker/config.json`) — mesmo sintoma e mesma correção já documentados acima (`docker-credential-desktop` fora do PATH bloqueando `docker compose build`): removida a chave `credsStore` de novo, sem perda (mesmo `auths` vazio de antes). Rebuild de `backend`+`frontend` feito nessa sessão pra validar a feature de "Grupos" (ver seção própria acima) contra o backend/frontend containerizados reais — `docker compose -f docker-compose.yml -f docker-compose.app.yml build backend frontend` seguido de `up -d backend frontend`. **Se o `credsStore` reaparecer de novo em sessões futuras, é essa mesma correção** — vale considerar fixar isso de forma permanente (ex: instalar o `docker-credential-desktop` no PATH) se continuar voltando a cada atualização do Docker Desktop.

## Próximos passos

Itens das sessões de 2026-07-24/27/29/30/31 (editar/inativar/excluir/busca em `/usuarios`, debounce de fragmentos testado com WhatsApp real, healthcheck de desconexão com alerta por e-mail, tela de QR Code do WhatsApp, migrations substituindo `TYPEORM_SYNCHRONIZE`, CRUD de setores, busca de conversas finalizadas, setor novo no menu do WhatsApp via `n8n-novo-setor.md` — depois substituído, respostas rápidas + mensagens automáticas ao Assumir/Finalizar, paginação na fila) e da sessão de 2026-08-04 (página de status + horário de funcionamento, incluindo o teste visual de `/status`/`/status/publicar` no navegador, validado pelo usuário em 2026-08-05) **já concluídos** — ver "Status atual do projeto" acima.

Itens da sessão de 2026-08-05 (menu dinâmico do WhatsApp, mensagens de mídia — receber e enviar) **já concluídos e testados com WhatsApp real** — ver "Status atual do projeto" acima.

Itens da sessão de 2026-08-07 (suporte a vídeo, correção do vazamento de `senha_hash` em `Message.atendente`, generalização do `content` do Tailwind) **já concluídos** — ver "Status atual do projeto" acima. Vídeo **validado com WhatsApp real pelo usuário em 2026-08-15**.

Item da sessão de 2026-08-15 (grupos do WhatsApp não disparam mais o menu + aba `/grupos`) **já concluído, testado via curl contra backend/frontend containerizados reais** — ver "Status atual do projeto" acima. **Ainda falta**: validar visualmente no navegador (extensão do Chrome não estava conectada nesta sessão) e testar com um grupo real do WhatsApp (confirmar que uma mensagem de grupo real não dispara o menu e que a conversa aparece em `/grupos`).

Item da sessão de 2026-08-17 (remetente em mensagem de grupo, mensagens enviadas direto do celular aparecendo no painel, envio de áudio pelo painel) **código concluído, `tsc`/`build` limpos, JSON do n8n validado** — ver "Status atual do projeto" e "Remetente em grupo, mensagens enviadas direto do celular e envio de áudio pelo painel" acima. **Ainda falta, nesta ordem, antes de considerar concluído**: (1) `npm run migration:run` contra o banco de dev (Docker estava fora do ar nesta sessão); (2) reimportar `fluxo-completo-com-backend.json` no n8n e reconfigurar credenciais Redis/SMTP (mesmo trade-off de sempre); (3) validar manualmente com WhatsApp real — nome/telefone aparecendo numa mensagem de grupo, mensagem mandada do próprio celular aparecendo no painel sem duplicar as que o painel manda, e áudio anexado pelo painel chegando de forma utilizável no WhatsApp do cliente (avaliar se `mediatype: audio` do `sendMedia` é satisfatório ou se vale trocar pro endpoint dedicado `sendWhatsAppAudio`, ver seção acima).

Item da mesma sessão de 2026-08-17, pedido em seguida (gravação de áudio por microfone no navegador) **código concluído, `tsc`/`build` limpos nos dois lados** — ver "Gravação de áudio pelo microfone do navegador" acima. **Ainda falta**: testar num navegador real (permissão de microfone, preview, envio, conferir que chega tocável no WhatsApp do cliente).

Item da mesma sessão de 2026-08-17, pedido logo depois (aba de Contatos) **código concluído, `tsc`/`build` limpos nos dois lados** — ver "Aba de Contatos" acima. **Ainda falta**: `npm run migration:run` (migration `AddContacts`, junto com a pendência de migration dos itens anteriores) e validar `GET /contacts/whatsapp` contra uma instância real — o formato de retorno de `findContacts` não foi confirmado nesta sessão, `normalizarContatoWhatsapp` em `contatos/page.tsx` é o primeiro lugar a ajustar se a lista vier vazia/errada.

Sugestões levantadas pelo Claude (ainda **não** pedidas pelo usuário — avaliar antes de implementar):

- **Chave compartilhada n8n↔backend** — trade-off de MVP já documentado (ver "Rotas sem autenticação" acima), continua pendente antes de produção real. Decisão do usuário em 2026-07-30: manter assim por enquanto, corrigir só perto de produção.
- **Figurinha (sticker) do WhatsApp** — ainda fora de escopo (só vídeo foi priorizado em 2026-08-05/07, ver "Mensagens de mídia do WhatsApp" acima). Localização (mencionada explicitamente pelo usuário em 2026-08-15 como "deixar para uma futura atualização"), contato e enquete também continuam fora.
- **Nome do grupo buscado automaticamente** (via API da Evolution) em vez de "Grupo sem nome" — ver "Grupos do WhatsApp" acima, fora de escopo por ora.
- **Badge/toast de notificação pra mensagem de grupo** — `useNotifications` não reage a mensagem de grupo hoje (ver "Grupos do WhatsApp" acima).

## O que evitar sugerir

- Não introduzir CRM, IA/chatbot complexo, ou features fora do MVP definido — o projeto é intencionalmente enxuto.
- Não mover regra de negócio para o n8n.
- Não usar `localStorage`/`sessionStorage` se algum componente for viver como artifact React dentro do Claude.ai — só neste projeto standalone isso é seguro.
- Não remover a separação Adapter (`integrations/evolution`) mesmo que pareça "simplificação" — é o que isola o domínio de uma troca futura de provedor de WhatsApp.
