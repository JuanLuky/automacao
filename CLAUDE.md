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
│       └── dashboard/           # contadores por status (+ breakdown por setor pro admin)
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
- [ ] **Fluxo ponta a ponta ainda não foi testado com backend + Postgres reais** — ver "Ambiente de desenvolvimento" abaixo. Falta validar manualmente: login → conversa chega em `nova_conversa` → Assumir → chat troca mensagens em tempo real → Transferir/Finalizar refletem na fila de outro atendente.
- [ ] Infra local via Docker Compose está indisponível no momento (ver abaixo) — não foi possível confirmar se `docker-compose.yml` ainda sobe tudo sem ajustes.

## Ambiente de desenvolvimento

O **Docker Desktop foi desinstalado desta máquina** (constatado em 2026-07-23: sem binário em `Program Files`, sem entrada no registro, `docker` fora do PATH). Sobraram apenas resíduos — a distro WSL `docker-desktop` (parada) e a pasta `~/.docker` — que não são suficientes pra rodar `docker compose up`. Antes de tentar subir a infra (Postgres, Redis, Evolution API, n8n) ou testar o fluxo completo do painel, confirmar se o Docker foi reinstalado; não assumir que `docker compose` funciona sem checar primeiro.

## O que evitar sugerir

- Não introduzir CRM, IA/chatbot complexo, ou features fora do MVP definido — o projeto é intencionalmente enxuto.
- Não mover regra de negócio para o n8n.
- Não usar `localStorage`/`sessionStorage` se algum componente for viver como artifact React dentro do Claude.ai — só neste projeto standalone isso é seguro.
- Não remover a separação Adapter (`integrations/evolution`) mesmo que pareça "simplificação" — é o que isola o domínio de uma troca futura de provedor de WhatsApp.
