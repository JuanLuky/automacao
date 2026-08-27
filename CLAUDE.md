# CLAUDE.md

Contexto do projeto para o Claude Code. Leia isso antes de sugerir qualquer mudança — explica as decisões de arquitetura já tomadas e como o sistema funciona hoje, pra evitar sugestões que vão contra o que já foi definido de propósito.

Este arquivo é enxuto de propósito: só o necessário pra **entender o projeto** (arquitetura, stack, convenções, estado atual). O **histórico de construção** — o que foi feito em cada sessão, decisões tomadas passo a passo, bugs encontrados/corrigidos, status de teste de cada feature — fica em [`PROGRESSO.md`](./PROGRESSO.md), em ordem cronológica.

**Ao terminar algo novo, registrar em `PROGRESSO.md` (no final do arquivo), e atualizar este arquivo só se mudar uma convenção/arquitetura evergreen.** Quando o usuário perguntar **"onde paramos?"**, ler o final de `PROGRESSO.md` — a última entrada é a última coisa feita.

## Idioma

**Sempre responder em português** (pedido explícito do usuário) — independente do idioma da mensagem ou de trechos em inglês no código/commits.

## O que é o projeto

Sistema de atendimento via WhatsApp ("Maré") com **um único número** para toda a empresa. Cliente manda mensagem → recebe um menu de departamentos → escolhe um setor → atendimento entra na fila do setor → um atendente assume → conversa acontece pelo mesmo número, com histórico salvo. MVP deliberadamente simples: sem CRM, sem IA, sem chatbot complexo.

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
PROGRESSO.md                     # histórico de construção, sessão por sessão — ver topo deste arquivo
SETUP-NOVA-MAQUINA.md            # roteiro operacional pra colocar o projeto de pé numa máquina nova (.env, npm, docker, Evolution, n8n)
```

## Separação de responsabilidades (não mexer nisso sem motivo forte)

- **Evolution API**: só fala com o WhatsApp. Não tem regra de negócio.
- **n8n**: só orquestra mensageria — decide se é primeiro contato, manda o menu, repassa pro backend. **Não tem regra de negócio do domínio** (isso é proposital: manter o n8n "burro" mantém a lógica testável em um lugar só, o NestJS).
- **Backend (NestJS)**: dono do domínio. Cria atendimento, gerencia fila, valida transições de status, emite eventos via WebSocket, envia mensagens ao cliente através do adapter `integrations/evolution`.
- **Frontend (Next.js)**: interface do atendente. Não fala direto com a Evolution API — sempre passa pelo backend.

## Backend — estrutura e convenções

```
backend/src/
├── auth/                 # login (JWT), guard, strategy, RolesGuard + @Roles
├── users/                 # atendentes/admins/supervisores — soft-delete (ativo / excluido_em)
├── departments/            # setores (dinâmicos, CRUD admin)
├── conversations/          # entidade central — status: aguardando | em_atendimento | transferido | finalizado; tipo: cliente | grupo
├── messages/                # histórico + envio via Evolution quando origem = atendente; mídia (imagem/áudio/documento/vídeo)
├── websocket/                # EventsGateway (Observer) — nova_conversa, conversa_atualizada, nova_mensagem, conversa_finalizada
├── integrations/evolution/    # Adapter — só essa classe conhece o formato do payload da Evolution API
├── whatsapp/                   # status de conexão + QR Code (passthrough fino, sem Service próprio)
├── contacts/                    # contatos sincronizados do WhatsApp (ao vivo, nunca persistido) + Contact próprio (CRUD, hard delete)
├── business-hours/               # horário de funcionamento (singleton) + cálculo de aberto/fechado
├── status/                        # página de status/uptime pública (StatusUpdate)
├── role-labels/                    # rótulos de papel editáveis (singleton — hoje N1/N2/N3)
├── auto-messages/                   # mensagens automáticas de Assumir/Finalizar (singleton)
├── quick-replies/                    # respostas rápidas do chat (CRUD, hard delete)
├── tags/                              # Tag (catálogo, admin) + ClientTag (vínculo por telefone, qualquer atendente)
├── bot-sessions/                       # quem está preso no menu do WhatsApp, antes de virar atendimento
└── database/                            # data-source.ts (TypeORM CLI) e seed.ts (dados padrão)
```

Padrões em uso, e por quê (não adicionar padrões novos sem necessidade real — o projeto evita overengineering de propósito):

- **Repository** (via `@InjectRepository` do TypeORM) — isola query do domínio.
- **Service Layer** — toda regra de negócio (ex: "só assume conversa com status aguardando") vive aqui, nunca no controller.
- **DTOs + class-validator** — toda entrada é validada.
- **Adapter** (`EvolutionService`) — se trocar de provedor de WhatsApp, só essa classe muda.
- **Observer** (`EventsGateway`) — services emitem evento sem saber quem ouve.

### Convenções que vale manter em qualquer código novo

- **Datas/hora sempre `timestamptz`, nunca `timestamp`** — evita horários errados por timezone (o driver `pg` interpreta `timestamp` puro assumindo o fuso local do processo Node; o servidor roda em America/Sao_Paulo). Detalhe completo do bug original em `PROGRESSO.md`.
- **Assinatura do atendente**: mensagem de atendente (`origem: atendente`) leva um prefixo `*Nome - CÓDIGO*\n` só no texto mandado à Evolution API — o `mensagem` salvo em banco fica limpo. `atendente_id` normalmente vem de `conversa.atendente`; pra grupo (sem "assumir"), vem explícito no payload (`CreateMessageDto.atendente_id`).
- **`User`/`Message.atendente` nunca vazam `senha_hash`** — qualquer método que devolva `User` (direto ou via relação carregada) precisa desestruturar/omitir o campo antes de sair na resposta HTTP ou no payload de socket. Padrão já aplicado em `UsersService` (`Omit<User,'senha_hash'>`) e `MessagesService` (`semSenha()` local). Manter em qualquer serviço novo.
- **Usuário — soft-delete em dois níveis**: `ativo` (inativar/reativar, reversível — férias/afastamento) e `excluido_em` (excluir, sem desfazer pela UI — desligamento). `findAll` filtra `excluido_em IS NULL`; a linha nunca é apagada de verdade (FK de `messages`/`conversations`).
- **Guard de `role: admin`**: `RolesGuard` + `@Roles(...)` (padrão `Reflector` do NestJS, lê `req.user.role` do JWT) protege rotas admin-only (`/users`, escrita de `/departments`, escrita de `/tags`, etc.). Reaproveitar esse guard em qualquer rota nova admin-only, não duplicar a checagem.
- **Rotas públicas (proposital, não é bug)**: `GET /conversations/by-phone/:telefone`, `POST /conversations`, `POST /conversations/:id/messages`, `GET /departments`, `GET /business-hours`, `GET /status/*` são públicas porque o n8n as chama sem login de atendente. Trade-off de MVP — reforçar com uma chave compartilhada n8n↔backend antes de produção real (decisão do usuário: manter assim por enquanto).
- **Migrations**: schema 100% controlado por migrations do TypeORM (`backend/src/database/migrations/`), `synchronize: false` fixo em `app.module.ts`. `npm run migration:generate -- src/database/migrations/NomeDaMudanca` / `migration:run` / `migration:revert`, via `backend/src/database/data-source.ts` (CLI apenas, lê `DATABASE_URL` do `.env`). **Toda entidade nova precisa entrar em `data-source.ts` (array `entities`) além de `app.module.ts`** — já esqueceu uma vez e quebrou `npm run seed` (ver `PROGRESSO.md`). Revisar sempre o SQL gerado antes de rodar `migration:run`. Setup num ambiente novo: `migration:run` (cria as tabelas) → `npm run seed` (departamentos + `admin@empresa.com`/`admin123`, trocar a senha).

## n8n — fluxo atual

Workflow ativo: `Atendimento WhatsApp - Fluxo Completo (com Backend)` (`fluxo-completo-com-backend.json`, importado manualmente na UI do n8n — `git push` não afeta o n8n rodando).

```
Webhook (path: whatsapp)
  → Extrai telefone/nome/texto/instance/tipo de mídia/eh_grupo/eh_from_me do payload
  → Mensagem minha (fromMe) sem conversa existente? → para (não cria nada)
  → GET /conversations/by-phone/:telefone
       200 (já existe) → registra mensagem (texto ou mídia, com origem/remetente corretos)
       404 (não existe) →
            é grupo? → cria Conversation tipo=grupo (sem setor, sem menu)
            é fromMe? → para
            dentro do horário de funcionamento?
                 não → manda mensagem de "fora do horário", não cria conversa
                 sim → GET /departments → texto escolhe um setor válido (numeração = ordem alfabética)?
                      sim → cria Conversation, confirma no WhatsApp
                      não → manda o menu de departamentos (montado dinamicamente)
```

Pontos de atenção:
- Webhook configurado **por instância** no Manager da Evolution API (Events → Webhook → `http://n8n:5678/webhook/whatsapp`). Não habilitar `WEBHOOK_GLOBAL_*` junto — duplica mensagens.
- `host.docker.internal` (n8n → backend nativo) exige `extra_hosts: ["host.docker.internal:host-gateway"]`.
- Node HTTP Request que devolve array — reconstruir com `$('Nome').all().map(i => i.json)`, nunca `$input.item.json` direto.
- **Debounce de 6s via Redis** (banco `0`) agrupa mensagens fragmentadas antes de decidir setor — só no ramo "sem conversa ativa".
- **Healthcheck a cada 5min** (`GET /instance/connectionState`) manda e-mail de alerta (dedup via Redis, TTL 1h) se a instância cair — e-mail, não WhatsApp, pra não depender da própria instância caída.
- **Dedup de mensagem própria** (`evolution_message_id`) evita duplicar o eco de mensagens mandadas pelo painel quando o webhook processa `fromMe: true` (necessário pra capturar mensagens mandadas direto do celular).
- Credenciais (Redis, SMTP) **não vêm no JSON exportado** — reconfigurar na UI do n8n depois de qualquer reimport.
- Regra de negócio (horário de funcionamento, escolha de setor) sempre no backend — o n8n só consulta endpoint e ramifica em IFs.

## Frontend — estrutura e convenções

```
frontend/src/
├── app/
│   ├── page.tsx                  # redireciona: autenticado → /atendimentos, senão → /login
│   ├── login/
│   ├── status/                    # pública — página de status/uptime
│   └── (painel)/                   # protegido — layout.tsx faz o guard de auth + monta os providers
│       ├── layout.tsx               # topbar (nav, dropdown "Administração", tema, sair)
│       ├── atendimentos/             # inbox de duas colunas (lista + chat) — tela principal do dia a dia
│       ├── fila/                      # lista por setor, abas aguardando/em_atendimento/finalizadas — mantida por link direto
│       ├── conversas/[id]/             # chat: histórico, envio, Transferir/Finalizar/Reabrir (grupo: sem essas)
│       ├── grupos/                      # lista de grupos do WhatsApp — mantida por link direto
│       ├── contatos/                     # contatos do WhatsApp (ao vivo) + próprios do Maré, importar/exportar CSV
│       ├── dashboard/                     # contadores por status (+ breakdown por setor pro admin/supervisor)
│       ├── usuarios/                       # só admin
│       ├── departamentos/                   # só admin
│       ├── whatsapp/                         # só admin — QR Code
│       ├── horario-funcionamento/             # só admin
│       ├── status/publicar/                    # só admin — publica atualização de status
│       ├── perfis/                               # só admin — rótulos de papel (N1/N2/N3)
│       ├── mensagens/                             # só admin — mensagens automáticas + respostas rápidas
│       └── etiquetas/                              # só admin — catálogo de etiquetas de cliente
├── components/
│   ├── conversa/ConversaPanel.tsx    # corpo do chat, usado por /conversas/[id] e pelo inbox /atendimentos
│   ├── LiveQueuePanel.tsx             # amostra ilustrativa da tela de login (dados locais, não é a fila real)
│   └── ui/                             # Button, Field, Select, StatusBadge, ConfirmModal, Avatar, TagBadge, ClientTagsPicker, QuickReplies, Switch, NovaConversaModal...
├── hooks/       # useAuth, useTheme, useDepartments, useSocketEvent, useNotifications, useVerTodosSetores, useRoleLabels, useAutoMessages, useQuickReplies, useTags, useWhatsappAvatar
├── lib/         # api.ts (axios + interceptor de token), socket.ts (singleton do socket.io-client), time.ts, quickReplies.ts (resolverTemplate)
└── types/       # espelham as entidades do backend
```

`GET /conversations/:id` existe no backend — a tela de chat busca a conversa via `getConversation(id)` em `lib/api.ts`, chamando esse endpoint direto (não busca a lista inteira e filtra client-side).

### Regras de negócio no frontend

- **Confiança client-side deliberada**: o backend não filtra `GET /conversations` por papel/setor — quem decide o que aparece é o frontend, passando `departamento_id` como query param. Mesmo padrão pras telas admin-only (reforço só no frontend, não replicado no backend).
- **Papéis**: `atendente` só vê a fila/dashboard do próprio setor. `admin` vê tudo, com `Select` de setor. `supervisor` é como atendente, mas tem um toggle "Ver todos os setores" (`useVerTodosSetores`, `localStorage`) que dá o mesmo alcance do admin enquanto ligado. `podeVerTodos = isAdmin || (isSupervisor && verTodos)` controla o filtro em `fila`/`dashboard`/`atendimentos`.
- **Auth**: token JWT em `localStorage` (chave `atendimento.token`), aplicado via interceptor do axios.
- **Tema**: classe `.dark` no `<html>`, tokens de cor em `globals.css` (`--surface`, `--surface-raised`, `--text-primary` etc.), preferência em `localStorage`.
- **Tempo real**: um único socket compartilhado (`lib/socket.ts`). `useSocketEvent(evento, handler)` assina/desassina no ciclo de vida do componente sem exigir handler memoizado. Em `fila`/`dashboard`, qualquer um dos três eventos (`nova_conversa`, `conversa_atualizada`, `conversa_finalizada`) simplesmente **recarrega a lista** — sem merge otimista de estado local, de propósito.
- **`ConfirmModal`** (`components/ui/ConfirmModal.tsx`) substitui todo `window.confirm` — portal via `createPortal`, Escape/backdrop pra cancelar, `loading` (spinner), `variant="danger"`, e um terceiro botão opcional (`secondaryLabel`/`onSecondary`, ex: "Iniciar com/sem mensagem"). Qualquer confirmação nova deve reaproveitar esse componente.
- **`tailwind.config.ts`**: `content` é um único glob (`./src/**/*.{js,ts,jsx,tsx,mdx}`) — cobre `src/` inteiro; não voltar a listar pasta por pasta (Tailwind não avisa em build quando uma classe não é escaneada, já causou um bug de estilo invisível). Animações de entrada (`animate-queue-in` etc.) **não** usam `fill-mode: forwards`/`both` — reter um `transform`/`opacity` não-identidade depois da animação cria um stacking context permanente que prende popovers atrás do próximo item da lista, mesmo com z-index maior (ver `PROGRESSO.md` pro caso real).

## Identidade visual (não trocar sem motivo — já foi definida com o usuário)

Marca "Maré" (ícone `Waves` do lucide-react). Paleta em `tailwind.config.ts`: `abyss` (fundo escuro, `#07161F`→`#1B4356`), `tide` (cor de ação — assumir, enviar, online, `#14B8A6`/`#2DD4BF`), `mist` (hierarquia secundária/muted), mais `waiting` (âmbar, status aguardando), `active` (= tide, em atendimento), `closed` (cinza, finalizado) e `alert` (erros). Tipografia: Bricolage Grotesque (`--font-display`, headings) + Inter (`--font-body`, corpo). Tokens de superfície (`--surface`, `--surface-raised`, `--surface-sunken`, `--border`) ficam em `globals.css` e trocam de valor entre claro/escuro via classe `.dark`. Assinatura visual: painel lateral da tela de login (`LiveQueuePanel`) com uma fila de exemplo animada (`animate-queue-in`) e uma linha de "maré" (`animate-tide-sweep`) — reforça que é um sistema ao vivo. A mesma animação `animate-queue-in` é reaproveitada nos itens reais da fila.

## Variáveis de ambiente (visão geral — cada pasta tem seu próprio `.env.example`)

| Variável | Onde | Observação |
|---|---|---|
| `POSTGRES_PASSWORD` | infra | usada em `DATABASE_URL` do backend também |
| `EVOLUTION_API_KEY` | infra + backend + n8n (nos nós HTTP) | precisa ser **idêntica** nos três lugares |
| `JWT_SECRET` | backend | gerar com `openssl rand -hex 32`, não usar valor de exemplo |
| `NEXT_PUBLIC_API_URL` | frontend | endpoint do backend — em dev, `http://localhost:3000`; embutido no bundle em build-time |
| `NEXT_PUBLIC_WS_URL` | frontend | endpoint do Socket.IO, normalmente igual à API |
| `NEXT_PUBLIC_EVOLUTION_INSTANCE` | frontend | nome da instância enviado como `instance` ao responder mensagem (`origem: atendente`) |

## Status atual

Backend, frontend e n8n estão completos e testados ponta a ponta para o conjunto de features descrito acima. O histórico completo — sessão por sessão, com o que foi validado com WhatsApp real e o que ainda falta validar visualmente — está em `PROGRESSO.md`, incluindo a seção "Próximos passos" no final desse arquivo.

## O que evitar sugerir

- Não introduzir CRM, IA/chatbot complexo, ou features fora do MVP definido — o projeto é intencionalmente enxuto.
- Não mover regra de negócio para o n8n.
- Não usar `localStorage`/`sessionStorage` se algum componente for viver como artifact React dentro do Claude.ai — só neste projeto standalone isso é seguro.
- Não remover a separação Adapter (`integrations/evolution`) mesmo que pareça "simplificação" — é o que isola o domínio de uma troca futura de provedor de WhatsApp.
