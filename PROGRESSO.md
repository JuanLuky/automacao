# PROGRESSO.md

Histórico de construção do Maré, sessão por sessão, em ordem cronológica (mais antigo primeiro, mais recente no final). Cada entrada registra: o que foi pedido, a decisão tomada e por quê, e o que foi testado/validado.

**Ao terminar algo novo, registrar aqui (no final).** As convenções e o estado atual do sistema ficam em `CLAUDE.md` — este arquivo é só o "diário de bordo". Quando alguém perguntar **"onde paramos?"**, a resposta está no final deste arquivo (última entrada = última coisa feita).

---

## Backend — convenções e decisões, com o histórico completo

### Colunas de data/hora — sempre `timestamptz`, nunca `timestamp`

Todas as colunas de data (`@CreateDateColumn`, `finalizado_em`, etc.) usam `type: 'timestamptz'` explicitamente. **Não voltar pro tipo padrão do TypeORM (`timestamp`, sem timezone)** — descoberto em 2026-07-24: com `timestamp`, o driver `pg` lê o valor assumindo o timezone local do processo Node. Nesta máquina o backend roda nativo no Windows (fuso America/Sao_Paulo, UTC-3), então a API devolvia horários 3h adiantados (ex: mensagem das 8h35 aparecia como 11h35 no frontend). Com `timestamptz` o Postgres guarda o instante absoluto e o driver não depende do fuso do processo que está lendo.

### Mensagens — assinatura do atendente (2026-07-24)

`Message` tem `atendente_id` (nullable, preenchido só quando `origem = atendente`, sempre igual ao `atendente_id` da conversa no momento do envio — não existe seleção de atendente no payload, já que a rota também é chamada pelo n8n sem noção de usuário logado). `MessagesService.findByConversation`/`create` carregam a relação `atendente.departamento` pra isso.

Além de aparecer no painel (ver frontend), o texto enviado à Evolution API leva um prefixo `*Nome - CÓDIGO*\n` (negrito do WhatsApp) montado em `MessagesService.create` — só no texto que vai pro WhatsApp, o `mensagem` salvo em banco fica limpo. Objetivo: cliente saber com qual atendente do setor está falando. Testado via WhatsApp real em 2026-07-24, validado pelo usuário.

### `GET /users` e `POST /users` nunca retornam `senha_hash`

`UsersService.create`/`findAll` desestruturam o campo antes de devolver (`Omit<User, 'senha_hash'>`). Isso não existia originalmente — os dois métodos devolviam a entidade crua do TypeORM, vazando o hash bcrypt no JSON. Corrigido em 2026-07-24 ao construir a tela de gestão de usuários. **Manter esse padrão em qualquer novo método do `UsersService` que devolva `User`.** `update`/`setAtivo` já seguem o mesmo padrão.

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

`GET /conversations/by-phone/:telefone`, `POST /conversations` e `POST /conversations/:id/messages` são públicas porque o **n8n** as chama diretamente (ele não tem login de atendente). Isso é um trade-off de MVP — vale reforçar com uma chave compartilhada n8n↔backend antes de produção real com clientes. Decisão do usuário em 2026-07-30: manter assim por enquanto, corrigir só perto de produção.

### Ambiente

- Schema do banco controlado por **migrations** (`backend/src/database/migrations/`), não por `synchronize`.
- Rodar `npm run migration:run` antes do primeiro start num ambiente novo (cria as tabelas), depois `npm run seed` — cria os 5 departamentos (`codigo`: RH, FIN, CONT, TI, COM) e o usuário `admin@empresa.com` / `admin123` (senha a trocar).

### Migrations (2026-07-30 — substituiu `TYPEORM_SYNCHRONIZE`)

`app.module.ts` tem `synchronize: false` fixo (não é mais controlado por env var — `TYPEORM_SYNCHRONIZE` foi removido do `.env`, não tem mais leitor nenhum). O schema agora é 100% controlado por migrations do TypeORM:

- `backend/src/database/data-source.ts`: `DataSource` usado só pela CLI do TypeORM (`npm run typeorm -- <comando>`), lê `DATABASE_URL` do `.env` via `dotenv`, aponta pra `src/database/migrations/*.ts`.
- Scripts em `package.json`: `migration:generate <caminho>` (gera migration por diff entre entidades e o banco apontado em `DATABASE_URL`), `migration:run` (aplica as pendentes) e `migration:revert` (desfaz a última).
- **`InitialSchema1785436093710`** (`src/database/migrations/1785436093710-InitialSchema.ts`) é a migration baseline — criada rodando `migration:generate` contra um banco **vazio temporário** (não contra o `atendimento_db` de desenvolvimento, que já tinha as tabelas criadas pelo antigo `synchronize: true` — gerar direto nele teria produzido uma migration vazia, sem diff). Testada de ponta a ponta nesse banco temporário (`run` → `revert` → `run` de novo, tudo limpo) antes de mexer no banco real.
- **`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` foi adicionado manualmente** no topo do `up()` dessa migration — o `migration:generate` não inclui isso sozinho, mas as PKs (`uuid_generate_v4()` como `DEFAULT`) dependem dela. Sem essa linha, a migration falha num banco novo do zero (o `atendimento_db` atual já tinha a extensão habilitada, criada silenciosamente pelo `synchronize` antigo — por isso o gap só apareceria numa instalação nova).
- **O `atendimento_db` de desenvolvimento não rodou o `up()` dessa migration** — como as 4 tabelas já existiam (criadas pelo `synchronize` antigo, com o schema idêntico ao gerado), rodar a migration ali quebraria com "relation already exists". Em vez disso, foi feito um **baseline adoption**: criada a tabela `migrations` (schema padrão do TypeORM) e inserida manualmente a linha correspondente a essa migration, sem executar o SQL — confirmado depois com `npm run migration:run` reportando `No migrations are pending`. **Nenhum dado existente foi tocado.**
- **Daqui pra frente**: qualquer mudança em entidade precisa de uma migration nova (`npm run migration:generate -- src/database/migrations/NomeDaMudanca`, com o banco de dev já refletindo o estado *anterior* à mudança) — não existe mais auto-sync. Revisar sempre o SQL gerado antes de rodar `migration:run` (o TypeORM erra esporadicamente em nomes de constraint ou em diffs mais complexos de enum).

---

## n8n — histórico de construção do fluxo

Workflow ativo: `Atendimento WhatsApp - Fluxo Completo (com Backend)`.

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
- Corpo em HTML com estilos inline (compatibilidade de cliente de e-mail), mostra estado reportado e horário (`America/Sao_Paulo`) e um botão linkando pro Manager (`http://localhost:8089/manager`).
- **Como toda credencial no n8n, a de SMTP não vem no JSON exportado.** Depois de reimportar o workflow é preciso criar uma credencial de e-mail (SMTP) na UI do n8n e selecioná-la no node `Enviar E-mail de Alerta` — mesmo trade-off já documentado pra credencial Redis. `fromEmail` está fixo em `juandev33@gmail.com` (2026-07-29, decisão do usuário) — **precisa bater com a conta autenticada na credencial SMTP** (Gmail rejeita `From` diferente da conta logada). Envia pra si mesma (remetente = destinatário), aceito pelo usuário. Se usar Gmail como SMTP, a credencial precisa de uma **senha de app** (`myaccount.google.com/apppasswords`, exige verificação em duas etapas ativada), não a senha normal da conta.
- Reaproveita o mesmo Redis (banco `0`) já usado no debounce — precisa da mesma credencial Redis selecionada nos 2 nós novos (`Redis - Verificar Se Já Alertou`, `Redis - Marcar Alerta Enviado`, `Redis - Limpar Alerta (Instância OK)`).

**Testado com instância real (2026-07-30), validado pelo usuário**: workflow reimportado, credencial SMTP (Gmail, senha de app) e credenciais Redis configuradas na UI do n8n, e-mail chegou corretamente na primeira queda.

**Comportamento não óbvio descoberto no teste — o reset do dedup depende de um tick do Schedule, não do evento de reconexão**: a chave `alerta_enviado:atendimento-empresa` (TTL 3600s) só é apagada quando o **Schedule roda e encontra a instância com `state == "open"`** (nó `Redis - Limpar Alerta (Instância OK)`) — não no instante em que a instância reconecta. Em teste manual (cair → alertar → reconectar → derrubar de novo em menos de 5min), nenhum tick do Schedule chegou a rodar com a instância saudável no meio, então o `DELETE` nunca aconteceu e a segunda queda caiu em `IF - Já Alertou Recentemente?` como "sim", pulando o e-mail. Numa queda real isso não deve incomodar (costuma durar bem mais que 5min), mas explica por que testes rápidos de queda/reconexão/queda não geram um segundo e-mail — não é bug, é esperar um tick de 5min com a instância `"open"` no meio, ou os 3600s de TTL expirarem. **Decisão do usuário (2026-07-30): manter como está**, sem reduzir o intervalo do Schedule nem adicionar um segundo gatilho de reset — o caso de borda só aparece em teste manual rápido, não em quedas reais.

### Menu dinâmico do WhatsApp — lê `GET /departments` em vez de mapeamento fixo (2026-08-05)

Reverte a decisão de 2026-07-31 de ter um `codigoPorOpcao` fixo no n8n (`n8n-novo-setor.md`, agora obsoleto): setor novo cadastrado em `/departamentos` passa a aparecer sozinho no menu do WhatsApp, sem editar nenhum node do n8n. Motivo da mudança: cadastro de setor pela UI é justamente o cenário que o mapeamento fixo tornava chato (editar workflow toda vez) — contradizia o propósito da tela `/departamentos`.

Sem mudança de backend — `GET /departments` já devolvia tudo que o menu precisa (`nome`, `codigo`, ordenado por `nome`). Só o workflow do n8n mudou:

- **`Buscar Departamentos`** (GET `/departments`) foi movido pra **antes** da checagem de escolha — roda sempre que a mensagem chega dentro do horário de funcionamento, não só quando o texto já bate `1-5`.
- **`Mapear Departamento` virou `Avaliar Escolha de Departamento`**: em vez do `codigoPorOpcao` fixo, converte `texto` pra número e indexa direto na lista retornada por `GET /departments` (`departamentos[numero - 1]`) — a numeração do menu é **a ordem alfabética por nome que a API já devolve**. Calcula `opcaoValida` (número inteiro, dentro do intervalo `1..departamentos.length`).
- **O IF `Escolheu Departamento? (1-5)` virou `Escolheu Departamento Válido?`**, condição trocada de regex de string pra boolean em `$json.opcaoValida`.
- **Node novo `Montar Menu`** (Code): monta o texto do menu (`"1 - Nome\n2 - Nome..."`) a partir da lista de `departamentos` já buscada.
- **`Enviar Menu`** e **`Montar Confirmação`** só tiveram a fonte dos dados trocada.

**Trade-off aceito conscientemente**: a numeração dos 5 setores originais muda (ordem alfabética, não mais RH/FIN/CONT/TI/COM fixo) — era o efeito colateral que tinha feito descartar essa abordagem em 2026-07-31. Decisão agora: aceitar a renumeração em troca de setor novo funcionar sozinho.

`n8n-novo-setor.md` marcado como obsoleto (mantido só como histórico). **Reimportado em 2026-08-05** (junto com a feature de mídia). Fluxo geral validado pelo usuário nesse reimport.

### Mensagens de mídia do WhatsApp (imagem, áudio, documento, vídeo) — receber e enviar (2026-08-05, vídeo em 2026-08-07)

Escopo decidido com o usuário: **receber e enviar** nessa mesma entrega, não só visualizar.

**Decisões de escopo**:
- Tipos suportados: imagem, áudio (só recebido nesta 1ª entrega — nota de voz do cliente toca inline no painel), documento (PDF e afins), vídeo (adicionado em 2026-08-07, bidirecional). **Figurinha, localização, contato e enquete ficam fora de escopo** — continuam caindo como mensagem de texto vazia. Confirmado com o usuário como aceitável, candidato a expansão futura.
- Envio pelo atendente = anexar arquivo do dispositivo — sem gravação de nota de voz pelo navegador nesta entrega (isso veio depois, ver seção própria abaixo).
- **Armazenamento em disco local** do backend (`backend/uploads/mensagens/`, gitignored), não em nuvem — decisão do usuário, plano de migrar pra S3 futuramente se o volume justificar. Acesso a disco isolado numa única classe (`MediaStorageService`).

**Backend**:
- `Message` ganhou `tipo` (enum `texto`|`imagem`|`audio`|`documento`|`video`, default `texto`), `midia_path`, `midia_mimetype`, `midia_nome_arquivo` (migration `AddMessageMedia`, testada `run`→`revert`→`run`; `video` veio depois via migration `AddVideoMessageTipo`, que recria o enum Postgres em vez de `ALTER TYPE ... ADD VALUE` — essa forma não pode ser lida na mesma transação em que é criada, e as migrations rodam em transação).
- `backend/src/messages/media-storage.service.ts` (`MediaStorageService`): único lugar que lê/escreve arquivo em disco. Valida mimetype contra allowlist por tipo (`video/mp4`+`video/3gpp` pra vídeo), valida tamanho (15MB decodificado), deriva a extensão do mimetype (nunca do nome de arquivo enviado pelo cliente — evita path traversal), grava em `uploads/mensagens/<id-da-mensagem>.<ext>`.
- `MessagesService.create` estendido: decodifica/salva mídia antes de persistir, aplica legenda de fallback (`"[imagem]"`, `"[vídeo]"` etc.) quando o cliente não manda caption, e no envio ao WhatsApp chama `EvolutionService.enviarMidia` (`POST /message/sendMedia/{instance}`) em vez de `enviarMensagem` quando há mídia. Áudio de saída pelo atendente foi bloqueado nesta entrega (removido depois, ver "Envio de áudio pelo painel" abaixo).
- Endpoint `GET /conversations/:conversationId/messages/:id/media` (`JwtAuthGuard`) serve o arquivo do disco com o `Content-Type` certo.
- **Bug real encontrado e corrigido**: o limite padrão do Express (100kb) bloqueava qualquer imagem/documento de verdade em base64 — corrigido em `main.ts` com `app.useBodyParser('json', { limit: '20mb' })`.

**n8n** (só o ramo "200, conversa já existe" — mídia mandada antes de escolher departamento continua caindo como texto vazio):
- `Extrair Dados da Mensagem` detecta o tipo pela presença de `imageMessage`/`audioMessage`/`documentMessage`/`videoMessage` e extrai `tipo` + id da mensagem — mimetype/nome de arquivo vêm da resposta do download, não do que o webhook declarou.
- `É Mensagem de Mídia?` (IF) → true: `Buscar Mídia` (`POST /chat/getBase64FromMediaMessage/{instance}`) → `Montar Mensagem de Mídia` (Code) → registra. False: fluxo de texto original.
- **Decisão de arquitetura validada na Fase 0** (antes de escrever qualquer código): testado `POST /chat/findMessages`, `POST /chat/getBase64FromMediaMessage` e `POST /message/sendMedia` direto contra a instância real (`v2.3.7`) — funcionaram limpo. Optou-se por **não** usar a opção "Webhook Base64" da Evolution API (campo não documentado, limite de tamanho incerto ~12MB) — o download explícito via `getBase64FromMediaMessage` usando o `key.id` é mais previsível.

**Frontend**:
- `types/index.ts`, `lib/api.ts` (`getMediaObjectUrl`, blob autenticado), `components/ui/MediaMessage.tsx` (renderiza por tipo: `<img>`, `<audio controls>`, `<video controls>`, card de documento), botão de anexo (`Paperclip`) + `<input type="file">` oculto em `conversas/[id]/page.tsx`, validação de mimetype/tamanho no client antes de habilitar envio.

**Testado com WhatsApp real em 2026-08-05, validado pelo usuário**: imagem, áudio e documento recebidos aparecem certos no painel; anexo enviado pelo painel chegou no WhatsApp como mídia com a legenda assinada. Vídeo e figurinha confirmadamente não abriam nessa entrega (fora de escopo). **Vídeo validado com WhatsApp real pelo usuário em 2026-08-15** (receber vídeo real e anexar vídeo pelo painel).

**Achado à parte, não corrigido nesta entrega**: durante o teste, `POST /conversations/:id/messages` (e o evento de socket `nova_mensagem`) mostrou devolver o objeto `atendente` completo, incluindo `senha_hash` — corrigido depois, ver "`GET /users`/`POST /users` nunca retornam `senha_hash`" acima.

---

## Frontend — histórico de construção, feature por feature

`GET /conversations/:id` existe no backend desde a feature de Grupos (2026-08-15) — a tela de chat busca a conversa via `getConversation(id)` em `lib/api.ts`. Antes disso, buscava a lista inteira (`GET /conversations`) e filtrava client-side.

### Gestão de usuários — `/usuarios` (só admin, 2026-07-24; editar/inativar/excluir/busca em 2026-07-27)

Item de nav "Usuários" só aparece quando `user.role === 'admin'`; a própria página redireciona se um não-admin acessar a URL direto — reforço só no frontend (mesmo trade-off do backend, ver acima).

Tela lista usuários (`GET /users`) com busca client-side (nome/e-mail) e um form inline reaproveitado tanto pra criar (`POST /users`) quanto pra editar (`PATCH /users/:id`). `lib/api.ts` expõe `getUsers`/`createUser`/`updateUser`/`inactivateUser`/`reactivateUser`/`deleteUser`.

Cada linha tem três ações: **Editar**, **Inativar/Reativar** (só Inativar pede confirmação) e **Excluir** (soft-delete). Inativar e Excluir usam o `ConfirmModal`; Reativar não, por ser não-destrutiva.

### Notificações de mensagem — badge + toast (2026-07-29)

Cenário: atendente está no chat de um cliente A quando um cliente B (conversa já assumida) manda mensagem nova — sem alerta, só seria percebido voltando pra fila manualmente.

Implementado inteiramente client-side, sem nova tabela/coluna no backend (estado efêmero, resetado a cada refresh).

- `frontend/src/hooks/useNotifications.tsx`: `NotificationsProvider`, escuta `nova_mensagem` globalmente, mantém `unreadByConversation` + pilha de toasts.
- Só reage a mensagens `origem === "cliente"` da conversa que o próprio atendente tem assumida (`mensagem.conversa_atendente_id === user.id`), e ignora a conversa já aberta na tela.
- Backend precisou expor `cliente_nome`/`conversa_atendente_id` no payload do evento `nova_mensagem` (só no socket, não persiste em `Message`) — campo deliberadamente **não** chamado `atendente_id` pra não colidir com o campo homônimo de `Message`.
- Badge: círculo vermelho na lista da `/fila` (aba "Em atendimento"), zerado via `clearUnread(id)` ao abrir a conversa.
- Toast: canto inferior direito, clicável, botão de fechar, some sozinho depois de 6s.
- **Testado com WhatsApp real em 2026-07-29 e validado pelo usuário.**

**Bug: toast invisível — `src/hooks/` fora do `content` do Tailwind (2026-07-29)**: badge aparecia, toast não. Causa: `tailwind.config.ts` só tinha `./src/app/**` e `./src/components/**` no array `content`; `useNotifications.tsx` foi o primeiro arquivo em `src/hooks/` a usar `className`, então o Tailwind nunca escaneou esse arquivo. O elemento existia no DOM (por isso o badge funcionava), só ficava sem estilo. Corrigido adicionando `"./src/hooks/**/*.{js,ts,jsx,tsx,mdx}"` ao `content`.

**Generalizado em 2026-08-07**: `content` trocado por um único glob `["./src/**/*.{js,ts,jsx,tsx,mdx}"]`, cobrindo `src/` inteiro — elimina essa classe de bug pra qualquer pasta nova que ganhe `className`. `tsc --noEmit` e `npm run build` confirmados limpos.

### Conexão do WhatsApp via QR Code no painel — `/whatsapp` (2026-07-30)

Item de nav "WhatsApp" (só admin). Objetivo: evitar abrir o Manager da Evolution API separadamente pra reconectar o número.

- Backend: módulo `whatsapp/` (`WhatsappController`, sem Service — passthrough fino). `GET /whatsapp/status?instance=` e `GET /whatsapp/qrcode?instance=`, admin-only. `EvolutionService` ganhou `getConnectionState`/`getQrCode` (JSON cru, sem normalizar — quem normaliza é o frontend).
- `instance` vem por query param (mesmo padrão de `POST /conversations/:id/messages`), não fixo no backend.
- Frontend: busca status a cada 8s; se não `"open"`, busca QR novo e mostra a imagem base64 direto (`<img>`, sem `next/image`). Botão manual força novo ciclo. Quando conectado, mostra card e para de buscar QR.
- **Testado escaneando um QR real e validado pelo usuário (2026-07-30)**.

### Gestão de setores — `/departamentos` (só admin, 2026-07-31)

Motivo: os 5 setores originais só existiam porque o seed os criou — adicionar/renomear exigia mexer direto no banco.

- Backend: `GET /departments` continua público (só `ativo: true`). Rotas novas admin-only: `GET /departments/all`, `POST /departments`, `PATCH /departments/:id`, `PATCH /departments/:id/inactivate`, `PATCH /departments/:id/reactivate`. `POST /departments` antes só tinha `JwtAuthGuard` — corrigido pro padrão admin-only.
- Sem exclusão definitiva — só inativar/reativar (`conversations.departamento_id` é FK obrigatória).
- Frontend: `frontend/src/app/(painel)/departamentos/page.tsx`, mesmo esqueleto de `/usuarios`.
- `codigo` deixou de ser usado pelo menu do WhatsApp desde o menu dinâmico (2026-08-05) — editar `codigo` livremente não quebra mais nada.

### Busca de conversas finalizadas — aba "Finalizadas" na fila (2026-07-31)

Antes, `/fila` só listava `aguardando`/`em_atendimento`. Adicionada aba "Finalizadas" com filtros de setor, busca por nome/telefone (debounce 400ms) e intervalo de datas.

- Backend: `ConversationsService.findAll` trocou `find()` por `QueryBuilder`, com `busca` (`ILIKE` em `cliente_nome`/`telefone`) e `data_inicio`/`data_fim` (em `criado_em`).
- Abrir conversa finalizada reaproveita a tela de chat existente (já escondia Transferir/Finalizar quando `status === 'finalizado'`).
- **Bug de fuso horário encontrado e corrigido durante o teste**: filtro de data inicial usava `new Date('2026-07-24')` (meia-noite **UTC**) seguido de `.setHours(0,0,0,0)` (hora **local**) — com o processo em America/Sao_Paulo (UTC-3), isso zerava a hora do dia errado, um dia pra trás. Corrigido construindo o `Date` a partir de componentes ano/mês/dia (`inicioDoDiaLocal`/`fimDoDiaLocal`), nunca fazendo parse de string seguido de `setHours`. Testado contra dados reais do Postgres antes e depois da correção.

### Respostas rápidas + mensagens automáticas ao Assumir/Finalizar (2026-07-31, editável pela UI em 2026-08-18)

Implementado inicialmente só no frontend, reaproveitando `POST /conversations/:id/messages`:

- `frontend/src/lib/quickReplies.ts`: lista estática de templates por categoria (Abertura, Aguarde, Pedido de informação, Encerramento, Transferência, Fora do horário). `"[nome do atendente]"` é o único placeholder resolvido automaticamente; os demais ficam literais pro atendente editar.
- `components/ui/QuickReplies.tsx`: popover categorizado ao lado do campo de mensagem — preenche o campo, não envia direto.
- Mensagem automática ao **Assumir** (`fila/page.tsx`): "Olá! Tudo bem? Meu nome é [nome], vou te ajudar por aqui." — best-effort, erro não bloqueia a navegação.
- Mensagem automática ao **Finalizar** (`conversas/[id]/page.tsx`): "Fico à disposição! Tenha um ótimo dia." — sem placeholder de nome (a assinatura automática já leva o nome).
- Textos das duas mensagens foram decisão explícita do usuário, não inferida.

**Virou editável pela UI em 2026-08-18** — ver seção "Mensagens automáticas + respostas rápidas editáveis" mais abaixo.

**Testado com WhatsApp real e validado pelo usuário (2026-08-18)**.

### Paginação nas abas da fila (2026-07-31)

Aba "Finalizadas" virou scroll longo — paginação em blocos de 5 nas 3 abas.

- Backend: `ConversationsService.findAll` ganhou `pagina`/`por_pagina` **opcionais** — sem os dois, continua devolvendo array completo (usado pelo dashboard e por `getConversation`). Com os dois, usa `skip/take/getManyAndCount()` e devolve `{ dados, total, pagina, por_pagina }`.
- Frontend: `getConversationsPaginado` separado de `getConversations`. `POR_PAGINA = 5`. Página reseta pra 1 ao trocar filtro. Página se auto-corrige se ficar fora do intervalo (ex: outro atendente assumiu uma conversa enquanto o admin navegava).

### Página de status/uptime — `/status` (pública) + `/status/publicar` (admin) (2026-08-04)

Modelo deliberadamente **manual**: admin posta uma entrada de status (ex: "Instabilidade detectada", `instabilidade`) e depois outra quando resolver (`operacional`). Sem integração automática com o healthcheck do n8n (desacoplados de propósito).

- Backend: módulo `status/` (`StatusUpdate` — `estado` enum `operacional`|`instabilidade`|`indisponivel`, `mensagem`, `criado_em`). `GET /status/atual` e `GET /status/historico` públicos; `POST /status` admin-only. Tabela vazia → default em memória (`operacional`, sem persistir).
- Frontend: `app/status/page.tsx` (pública, fora do route group) e `app/(painel)/status/publicar/page.tsx` (admin-only).
- **Testado via curl e via build/tsc. Testado visualmente no navegador e validado pelo usuário (2026-08-05)**.

### Horário de funcionamento configurável + resposta automática fora do expediente (2026-08-04)

Regra de negócio no **backend**, não no n8n (reforça a separação de responsabilidades) — o n8n só consulta e ramifica.

- Backend: módulo `business-hours/` (linha única/singleton: `dias_funcionamento` int[] no formato de `Date.getDay()`, `hora_inicio`/`hora_fim` `HH:mm`, `mensagem_fora_horario`). `estaAberto()` usa `new Date()` sem conversão de fuso (servidor já roda em America/Sao_Paulo). `GET /business-hours` público (n8n consulta sem auth); `PATCH` admin-only. Seed cria config padrão (Seg-Sex 08:00-18:00).
- Frontend: `/horario-funcionamento` (admin-only) — toggles dos 7 dias, `<input type="time">` x2, textarea da mensagem, badge "Aberto/Fechado agora" (reflete só o instante da última consulta, não é relógio ao vivo).
- n8n: dois nodes novos entre `Redis - Limpar Buffer` e `Escolheu Departamento? (1-5)`, mesmo ramo "sem conversa ativa": `Consultar Horário de Funcionamento` → `Dentro do Horário de Funcionamento?` (IF) — true segue o fluxo original; false manda a `mensagem_fora_horario` direto e a execução termina, sem criar conversa.
- **Reimportado e testado (2026-08-04)** via curl no webhook: horário fechado bloqueia tanto texto livre quanto escolha de departamento válida sem criar conversa; horário aberto continua criando conversa normalmente.

### Mensagens de mídia do WhatsApp — ver seção própria em "n8n — histórico de construção do fluxo" acima (backend/n8n/frontend descritos juntos por serem uma entrega única, 2026-08-05, vídeo em 2026-08-07).

### Grupos do WhatsApp — não disparar menu de setor + aba `/grupos` (2026-08-15)

Motivo: quando o número era adicionado a um grupo, toda mensagem disparava o menu de departamentos igual a um cliente novo. Pedido do usuário: (1) grupo nunca vê o menu; (2) aba separada pra visualizar e **responder** grupos, sem fila/status, aberta a todos os setores.

**Decisão de escopo** (perguntado ao usuário antes de implementar): grupo permite visualizar **e responder** (não é read-only), e não entra na lógica de fila/status.

**Backend**: `Conversation` ganhou `tipo` (enum `cliente`|`grupo`, default `cliente`) e `departamento_id` virou nullable (migration `AddConversationTipoGrupo`, testada run/revert/run). `findAll` filtra por `tipo`, sem parâmetro explícito assume `cliente` — preserva comportamento existente. `CreateConversationDto.departamento_id` obrigatório só quando `tipo` é `cliente`. `assumir`/`transferir`/`finalizar` rejeitam (400) conversa de grupo.

Grupo não tem "atendente da conversa assumida" — `CreateMessageDto` ganhou `atendente_id` opcional, obrigatório só quando `origem = atendente` **e** a conversa é grupo (senão 400). Backend busca esse `User` e usa como remetente/assinatura.

`GET /conversations/:id` novo (`JwtAuthGuard`) — resolve o workaround antigo de buscar a lista inteira e filtrar client-side.

**n8n**: `Extrair Dados da Mensagem` detecta grupo pelo `remoteJid` terminando em `@g.us` — `telefone` guarda o JID inteiro pra grupo (é o que a Evolution API exige em `number`). `nome` fica `null` pra grupo (buscar o nome exigiria uma chamada extra, fora de escopo nesta entrega — aparece "Grupo sem nome"). Interceptação só no branch de erro (404): node `É Mensagem de Grupo?` (IF) → true vai pra `Criar Conversa de Grupo` (`POST /conversations`, `tipo: grupo`, sem `departamento_id`/`mensagem_inicial`); false segue pro debounce de sempre. Node `Definir Conversa Atual` (Code, passthrough) dá um nome estável pra `Montar Mensagem de Mídia` referenciar, já que a conversa pode vir de duas origens diferentes agora.

**Frontend**: `/grupos` (nova) — lista paginada, busca por nome, sem filtro de setor, sem abas de status. Item de nav "Grupos" visível a todos. Abrir um grupo reaproveita `conversas/[id]/page.tsx` (esconde Transferir/Finalizar/`StatusBadge` quando `tipo === "grupo"`, `podeResponder` sempre `true`, `handleEnviar` manda `atendente_id: user?.id`).

**Fora de escopo**: nome do grupo buscado automaticamente (resolvido depois, ver "Avatares" abaixo); badge/toast de notificação pra mensagem de grupo (`useNotifications` só reage a `conversa_atendente_id === user.id`, sempre `null` pra grupo).

**Testado via curl contra o backend containerizado**: criar conversa de grupo, `GET by-phone`/`GET /conversations/:id`, `GET /conversations` sem `tipo` não vaza grupo pra fila, `?tipo=grupo` devolve o grupo, mensagem sem `atendente_id` rejeitada (400), com `atendente_id` salva e assinada, `assumir`/`finalizar` rejeitados (400) pra grupo. Migration testada run/revert/run. **Testado visualmente no navegador e com um grupo real do WhatsApp, validado pelo usuário (2026-08-18)**.

### Remetente em grupo, mensagens enviadas direto do celular e envio de áudio pelo painel (2026-08-17)

#### 1. Identificar quem mandou cada mensagem num grupo

`Message` ganhou `remetente_nome`/`remetente_telefone` (nullable, `text`), preenchidos só quando origem=cliente e conversa=grupo. `CreateMessageDto` ganhou os dois campos opcionais, sem validação (mesmo nível de confiança das outras rotas públicas).

n8n (`Extrair Dados da Mensagem`): extrai `remetente_nome`/`remetente_telefone` de `data.pushName`/`data.key.participant` — só quando é grupo e não é fromMe.

Frontend: bolha de mensagem mostra `remetente_nome || remetente_telefone` acima do texto quando `origem === "cliente" && tipo === "grupo"`.

#### 2. Mensagem enviada direto do celular conectado aparecer no histórico

Antes, o webhook descartava todo evento `fromMe: true` — isso também descartava mensagens mandadas direto pelo aparelho físico (fora do painel). Pedido do usuário: fazer aparecer no histórico.

**Risco central**: processar `fromMe: true` também processa o eco da própria mensagem que o painel acabou de mandar (a Evolution API dispara `messages.upsert` pra toda mensagem, inclusive as enviadas por ela mesma a pedido do backend) — sem dedup, duplicaria toda mensagem do atendente.

**Solução — dedup por id da mensagem no WhatsApp**: `Message` ganhou `evolution_message_id` (nullable, `text`, índice).
- Mensagem enviada pelo painel: `EvolutionService.enviarMensagem`/`enviarMidia` agora devolvem `{ id }` (de `key.id` da resposta da Evolution API). Gravado em `Message.evolution_message_id` via `update()` depois do envio.
- Mensagem enviada direto do celular: n8n manda `origem_externa: true` + `evolution_message_id` no `POST .../messages`. `MessagesService.create` checa isso **antes de qualquer outra coisa**: se já existe uma `Message` com esse id, devolve ela sem duplicar nem reemitir socket.

Com `dto.origem_externa === true`, `MessagesService.create` pula o bloco de resolver remetente e o bloco de reenviar ao WhatsApp — só registra (`atendente_id: null`, sem assinatura).

n8n: `Extrair Dados da Mensagem` não descarta mais `fromMe` — extrai `eh_from_me`/`wa_message_id` sempre. Node `É Mensagem Minha Sem Conversa Existente?` (IF) — se `eh_from_me` e não existe conversa ainda, a execução para (não cria conversa nem manda menu a partir do que nós mesmos mandamos). Se existe conversa, flui pelo mesmo caminho de sempre, calculando `origem`/`origem_externa`/`evolution_message_id` dinamicamente.

Frontend: mensagem com `origem === "atendente"` e `atendente` nulo mostra "Enviado pelo celular" no lugar do nome.

**Limitação conhecida, aceita**: janela de corrida entre o backend salvar a mensagem do painel e o `update()` gravar `evolution_message_id` — se o webhook processar o eco antes desse `update()` terminar, a dedup pode falhar e duplicar uma vez. Risco baixo (update roda em poucos ms, webhook tem até 6s de debounce no meio).

#### 3. Envio de áudio pelo painel (antes só recebia)

Bloqueio explícito removido de `MessagesService.create`. `MEDIATYPE_EVOLUTION_POR_TIPO` ganhou `audio → "audio"` — usa o endpoint genérico `sendMedia`, não o dedicado `sendWhatsAppAudio` (que gera nota de voz com waveform/PTT); se não for satisfatório no teste real, trocar pro endpoint dedicado é a alternativa registrada.

`tsc`/`build` limpos. Migration `AddMessageRemetenteEEvolutionId` rodada (2026-08-17). **Workflow reimportado e as três coisas validadas pelo usuário (2026-08-18)**.

### Gravação de áudio pelo microfone do navegador (2026-08-17)

Complementa o envio de áudio anexado. Botão de microfone grava direto do navegador (`MediaRecorder`).

- Reaproveita o mecanismo de anexo já existente (`AnexoStaged`) — gravar e parar monta um `Blob`, converte pra base64, chama `setAnexo`. Segue o fluxo normal de envio.
- `escolherMimeTypeGravacao`: tenta `audio/ogg;codecs=opus`, depois `audio/webm;codecs=opus`/`audio/webm`. Backend/frontend ganharam as variantes de `audio/webm` na allowlist.
- UI: microfone troca a barra de input por indicador "Gravando áudio... mm:ss" com parar/cancelar.
- Sem transcrição, sem limite de duração configurável, sem waveform. `getUserMedia`/`MediaRecorder` exigem contexto seguro (HTTPS ou `localhost`) — falha silenciosa em HTTP puro numa LAN.

**Testado com microfone e WhatsApp real, validado pelo usuário (2026-08-18)**.

### Aba de Contatos — sincroniza do WhatsApp + lista própria com importar/exportar (2026-08-17)

Aba visível a todos os atendentes. Decisão de arquitetura perguntada ao usuário antes de implementar (Baileys não expõe criar contato no telefone via API): sincronizar do WhatsApp, **não** lista 100% local — duas listas separadas:

- **"Contatos do WhatsApp"**: `EvolutionService.getContacts` (`POST /chat/findContacts/{instance}`), nunca persistida, refeita a cada visita/"Atualizar". `GET /contacts/whatsapp?instance=` devolve cru; `normalizarContatoWhatsapp` no frontend normaliza. **Testado contra a instância real**: formato real difere do assumido — JID vem em `remoteJid`, não `id` — corrigido. Filtra só `@s.whatsapp.net` (descarta `@lid` e `@g.us`).
- **"Contatos adicionados no Maré"**: entidade `Contact` (`nome`/`telefone` único, migration `AddContacts`) — hard delete de verdade (sem FK apontando pra cá). CRUD completo, `JwtAuthGuard` sem `RolesGuard` (aberto a todos).
- Importar: `<input type="file" accept=".csv">`, parse 100% no navegador (`parseCsv`), `POST /contacts/import` best-effort (linha duplicada/vazia ignorada sem interromper).
- Exportar: gerado 100% no frontend, junta as duas listas com coluna `origem`, `Blob` + `<a download>`.

`tsc`/`build` limpos. Migration rodada. **Testado visualmente no navegador e validado pelo usuário (2026-08-18)**.

### Papel Supervisor + toggle "ver todos os setores" (2026-08-17)

Terceiro papel (`UserRole.SUPERVISOR`, migration `AddSupervisorUserRole` — recria o enum Postgres, mesmo motivo de `AddVideoMessageTipo`). Como atendente por padrão, com toggle que dá o mesmo alcance do admin.

- Backend não muda nada além do enum.
- `useVerTodosSetores` (localStorage, mesmo padrão de `useTheme`) — 100% client-side, sem validação no backend (mesmo modelo de confiança já usado pro filtro de admin).
- `Switch` (`components/ui/Switch.tsx`) — genérico, reaproveitável.
- `fila`/`dashboard`: `podeVerTodos = isAdmin || (isSupervisor && verTodos)`.
- `/usuarios`: `Select` de papel ganhou "Supervisor"; badge com cor `waiting` (âmbar).

`tsc`/`build` limpos. Migration rodada. **Testado visualmente e validado pelo usuário (2026-08-18)**.

### Header do painel — menu "Administração" agrupando os itens admin (2026-08-17)

Com muitos itens soltos, a barra ficava apertada. `AdminNavMenu` (local em `layout.tsx`) — dropdown único "Administração" (mesmo padrão de popover de `QuickReplies.tsx`), destacado quando a rota atual é qualquer página admin. Grupo de controles à direita ganhou `border-l` como separador visual.

Mudança inteiramente visual. **Testado visualmente no navegador e validado pelo usuário (2026-08-18)**.

### Avatares (foto de perfil) + nome de grupo ao vivo do WhatsApp (2026-08-17)

Endpoint `GET /conversations/:id/whatsapp-info?instance=` devolve `{ nome, foto_url }`, sempre ao vivo, nunca persistido. Ramifica por `tipo`:
- grupo: `EvolutionService.getGroupInfo` (`GET /group/findGroupInfos`) devolve `subject`+`pictureUrl` numa chamada.
- cliente: nome já vem salvo (`cliente_nome`), só busca a foto via `getProfilePictureUrl` (`POST /chat/fetchProfilePictureUrl`).

Os dois métodos devolvem `null` em erro (não propagam), pra não quebrar uma lista inteira por um item.

Frontend: `useWhatsappAvatar(conversationId)`, `Avatar` (componente, `<img>` direto da CDN do WhatsApp, sem proxy, fallback pro ícone genérico em erro/ausência). `fila`/`grupos` viraram `ConversaItem`/`GrupoItem` (um componente por linha, pra chamar o hook por linha independente). Chat também usa o mesmo hook no cabeçalho.

**Custo aceito conscientemente**: N chamadas pra N conversas visíveis, sem cache/persistência — aceitável pro volume esperado (poucos grupos, fila paginada em 5).

**Testado nesta sessão contra a instância real conectada** (curl direto na Evolution API e no backend). **Testado visualmente no navegador e validado pelo usuário (2026-08-18)**.

#### Avatar de quem escreveu cada mensagem, dentro de um grupo (mesmo dia)

- **1ª tentativa, com bug**: `GET /contacts/whatsapp/avatar?instance=&numero=` reaproveitando `getProfilePictureUrl` por número. Bug real: em grupos com `addressingMode: "lid"` (confirmado no log real), `Message.remetente_telefone` é um **"lid"**, não o telefone de verdade — `fetchProfilePictureUrl` não acha foto por lid.
- **Correção**: `GET /conversations/:id/participant-avatar?instance=&participante=` — resolve o lid procurando o participante em `findGroupInfos` (`participants[].id` = lid, `participants[].phoneNumber` = telefone real) e busca a foto pelo telefone real. Fallback pro valor recebido direto se não achar. Endpoint antigo removido.
- **Cache client-side por telefone** (diferente da decisão "sem cache" acima) — dentro do chat, `useEffect` observa `mensagens`, busca uma vez por `remetente_telefone` novo (controlado por `Set` em `useRef`), guarda num `Record`. Justificativa diferente da anterior: aqui o mesmo participante aparece em várias mensagens na mesma tela.
- Render: label do balão trocou de texto puro pra `<Avatar size={18}>` + nome.

**Testado contra o grupo real, com o bug corrigido, e confirmado visualmente pelo usuário (2026-08-18)**.

### `ConfirmModal` — substituiu `window.confirm` (2026-07-27, terceiro botão em 2026-08-17)

`components/ui/ConfirmModal.tsx`: portal em `document.body`, Escape/backdrop pra cancelar, `loading` (spinner), `variant="danger"`. Motivo: `window.confirm` destoa da identidade visual.

Usado em: Iniciar atendimento, Finalizar conversa, Inativar/Excluir usuário, Excluir contato, Excluir etiqueta.

**Terceiro botão opcional (2026-08-17)**: `secondaryLabel`/`onSecondary`/`secondaryLoading` — os dois botões de ação se desabilitam mutuamente enquanto um está `loading`.

### Modal ao Assumir/Finalizar — escolher se manda mensagem automática (2026-08-17)

Antes, as mensagens automáticas eram mandadas sempre, silenciosamente. Pedido: perguntar antes.

- `fila/page.tsx`: "Assumir" abre `ConfirmModal` com `confirmLabel="Iniciar com mensagem"`/`secondaryLabel="Iniciar sem mensagem"`. `handleConfirmarIniciar(comMensagem)` assume sempre, manda a mensagem só se `comMensagem`. Estado `modoIniciar` de três valores.
- `conversas/[id]/page.tsx`: mesmo padrão pro "Finalizar" — `handleFinalizar(comMensagem)`, estado renomeado de `finalizando` (boolean) pra `modoFinalizar` (três valores).
- Grupo não passa por isso (não tem "assumir").

`tsc`/`build` limpos. **Testado visualmente no navegador e validado pelo usuário (2026-08-18)**.

### Rótulos de papéis editáveis — `/perfis` (só admin, 2026-08-17)

Pedido: mudar o texto exibido de cada papel (ex: "Atendente"→"N1", "Supervisor"→"N2", "Administrador"→"N3") sem editar código. `UserRole` continua enum fixo — só o texto exibido é configurável.

- Backend: `role_labels` singleton (mesmo padrão de `business_hours`, incluindo fallback em memória). `GET /role-labels` só exige login (todo atendente lê); `PATCH` admin-only. Seed cria padrão (`Atendente`/`Supervisor`/`Administrador`).
- Frontend: `useRoleLabels` (`RoleLabelsProvider` em `(painel)/layout.tsx`), `refresh()` chamado por `/perfis` depois de salvar. `UserRoleLabel` (componente local em `layout.tsx`) existe porque o hook não pode ser chamado no mesmo componente que monta o Provider.
- `/usuarios`: `Select`/badge trocaram os literais pelos `roleLabels.*`.
- `/perfis`: nova tela (dropdown "Administração"), três campos de texto.

**Testado via curl** — valores já setados como `N1`/`N2`/`N3` (pedido explícito). **Testado visualmente no navegador e validado pelo usuário (2026-08-18)**.

### Mensagens automáticas + respostas rápidas editáveis — `/mensagens` (só admin, 2026-08-18)

Personalizar pela UI as duas mensagens automáticas (Assumir/Finalizar) e os templates do popover de respostas rápidas — antes fixos em `quickReplies.ts`.

**Backend**, dois módulos novos:
- `auto-messages` — singleton, mesmo padrão de `business_hours`/`role_labels`. `GET` só login (qualquer atendente dispara a mensagem); `PATCH` admin-only.
- `quick-replies` — CRUD completo (`categoria` texto livre, `texto`, `ordem`), hard-delete (mesmo padrão de `Contact`). `GET` só login; escrita admin-only. Ordena por `ordem ASC, criado_em ASC`; agrupamento por categoria é no frontend.
- Seed cria a linha padrão de `auto_messages` e as 14 respostas rápidas originais.
- **Bug pré-existente encontrado e corrigido**: `data-source.ts` (usado só pela CLI/seed) não listava `Contact` nem `RoleLabels` no array `entities` — defasado desde que essas features foram adicionadas (migrations escritas à mão, sem `migration:generate`). Rodar `npm run seed` quebrava com `EntityMetadataNotFoundError`. Corrigido adicionando as 4 entidades faltantes. **Vale manter `data-source.ts` sincronizado com `app.module.ts`** sempre que uma entidade nova entrar em `seed.ts`.

**Frontend**: `useAutoMessages`/`useQuickReplies` (mesmo padrão de `useRoleLabels`). `lib/quickReplies.ts` ficou só com `resolverTemplate`. `QuickReplies.tsx` (popover) trocou o import estático por `useQuickReplies()`. `fila`/`conversas/[id]` trocaram os textos fixos pelos vindos do contexto. `/mensagens` (nova tela, dropdown Administração): duas seções — form de mensagens automáticas + lista de respostas rápidas por categoria (criar/editar/excluir).

Migration rodada, seed populando os 14 templates, `tsc`/`build` limpos, testado via curl (GET/PATCH/POST/DELETE, guard 401). **Não testado visualmente no navegador ainda** — falta validar a tela `/mensagens` e conferir que popover/mensagens automáticas refletem o texto customizado.

### Etiquetas de clientes — `/etiquetas` (catálogo só admin, atribuir é de qualquer atendente, 2026-08-18)

Pedido: marcar clientes com etiquetas coloridas (ex: "Devedor", "Cliente Premium"), foco em escritórios de contabilidade. Catálogo (criar/editar/excluir) fica em Administração; atribuir/remover de um cliente é ação do dia a dia de qualquer atendente.

**Decisão de modelagem — etiqueta é por TELEFONE, não por `Conversation`**: cada atendimento novo vira uma `Conversation` nova depois de finalizado. Se a etiqueta fosse por `Conversation.id`, sumiria a cada novo atendimento — quebrando o caso de uso (característica do cliente que persiste). `client_tags` guarda `telefone` (texto livre, sem FK).

**Backend**: `Tag` (`nome` único, `cor` hex validada) — catálogo, `GET` só login, escrita admin-only. `ClientTag` (`telefone` + `ManyToOne(Tag, {onDelete: 'CASCADE'})`) — `ClientTagsController` inteiro `JwtAuthGuard` sem `RolesGuard`. `GET /client-tags?telefones=a,b,c` em lote; `POST` idempotente; `DELETE /client-tags/:telefone/:tagId`. Excluir uma `Tag` cascateia. Seed não cria etiquetas padrão. Migration `AddTags` testada run/revert/run.

**Frontend**: `useTags`, `TagBadge` (pill com fundo em ~12% de opacidade do hex, sem cálculo de contraste), `ClientTagsPicker` (popover com checkmark nas atribuídas, ação imediata sem "salvar"). `/fila`: `ConversaItem` busca em lote as etiquetas da página atual. Chat: mesmo picker no cabeçalho, só `tipo === "cliente"`. `/etiquetas`: esqueleto de `/departamentos`, `<input type="color">` + hex sincronizado + preview do `TagBadge`.

**Bug: popover do picker ficava atrás do card seguinte da lista (2026-08-18)**: causa raiz não era z-index — a animação `animate-queue-in` usava `animation-fill-mode: both`, e a keyframe final (`transform: translateY(0)`) cria um novo stacking context; com `forwards`, esse transform ficava retido pra sempre em cada `<li>`, transformando cada item da lista num stacking context próprio. Como todos têm `z-index: auto`, stacking contexts irmãos empilham por ordem no DOM — o `<li>` seguinte sempre pintava por cima, prendendo qualquer popover de z-index alto dentro do stacking context do próprio card. **Corrigido removendo `forwards`** de `animation: "queue-in ... both"` (`tailwind.config.ts`) — sem outro CSS definindo transform nesses elementos, o resultado visual final é idêntico, só sem reter o stacking context. Afeta `/fila`, `/grupos`, `ConfirmModal`, o toast de notificação e `LiveQueuePanel`. **Vale lembrar em qualquer animação futura que termine em `transform`/`opacity` com `fill-mode: forwards`/`both`**: a correção não é aumentar o z-index, é parar de reter um transform/opacity não-identidade depois que a animação termina.

**Fora de escopo**: priorização automática da fila por etiqueta; filtro por etiqueta nesta entrega (paginação server-side de 5 não combina com filtro client-side conhecendo só a página atual) — **feito depois filtrando no banco**, ver seção seguinte.

Testado via curl (CRUD, cor inválida/nome duplicado rejeitados, attach idempotente, cascade delete confirmado, guard 401). `tsc`/`build` limpos. **Não testado visualmente no navegador**.

#### Filtro por etiqueta na fila + contagem de uso no catálogo (2026-08-18)

Complemento pedido logo depois ("etiqueta que não filtra nada é enfeite"). Filtrar no banco (não no cliente) resolve a objeção original — `COUNT`/`LIMIT` já saem filtrados.

- Backend: `ConversationsService.findAll` ganhou `tag_id`, aplicado como `EXISTS (SELECT 1 FROM client_tags ...)` — não `JOIN`, porque `client_tags` é 1:N por telefone e um join multiplicaria linhas (quebrando `getManyAndCount()`). Exposto em `GET /conversations?tag_id=`.
- `GET /tags` ganhou `total_clientes` por etiqueta (`leftJoin` + `COUNT` + `groupBy`, `Number()` porque `COUNT` do Postgres vem como string/bigint). Tipo `TagComUso` novo.
- `/fila`: `<Select>` "Todas as etiquetas" (só renderiza se o catálogo tiver ao menos uma etiqueta). Trocar volta pra página 1.
- `/etiquetas`: cada linha mostra "N clientes"; `ConfirmModal` de exclusão diz o número real.

Testado: `tsc` limpo, queries validadas direto no Postgres, containers reconstruídos sem erro. **Não testado com dados reais** (catálogo estava vazio na sessão).

#### Nota operacional: código novo não chega sozinho no que está rodando (2026-08-18)

Ao puxar atualizações de outra máquina, checar sempre **dois níveis** independentes:
1. **Banco atrás do código**: `synchronize: false` + `CMD node dist/main` — nenhum roda migration sozinho. Rodar `npm run migration:run` do host.
2. **Container atrás do código**: `docker compose up -d` sem `--build` reaproveita a imagem antiga. Sintoma: rota nova responde 404 em vez de 401/200, `docker exec backend ls dist/` sem os módulos novos. Reconstruir com `docker compose -f docker-compose.yml -f docker-compose.app.yml up -d --build backend frontend`.

Checagem pós-pull: `ls backend/src/database/migrations/` contra a tabela `migrations` do banco, e `docker exec backend ls dist/` contra `backend/src/`.

### Skeleton de carregamento pro nome/foto ao vivo do WhatsApp (2026-08-18)

Em `/grupos`, nome/foto demoravam a aparecer, piscando "Grupo sem nome"/ícone genérico antes de trocar. Pedido: loading em vez do flash.

- `useWhatsappAvatar` ganhou `isLoading` (true até a Evolution API responder, sucesso ou falha).
- `Avatar` ganhou `loading?: boolean` — círculo `animate-pulse` no lugar do ícone genérico enquanto carrega e sem `src`.
- `/grupos`: barra `animate-pulse` no lugar do nome enquanto `isLoading` e sem `cliente_nome`.
- `/fila` e cabeçalho do chat: mesmo tratamento no avatar; nome só teria o mesmo problema no cabeçalho quando é grupo.

`tsc`/`build` limpos. **Não testado visualmente no navegador**.

### Reabrir conversa finalizada (2026-08-18, botão na lista + prévia da última mensagem no mesmo dia)

Pedido: voltar a responder uma conversa finalizada sem esperar o cliente escrever de novo (o que criaria uma `Conversation` nova).

- Backend: `ConversationsService.reabrir(id)` — só aceita `status === 'finalizado'` (400 caso contrário), recusa grupo. Volta pra `EM_ATENDIMENTO` com o mesmo `atendente_id` de antes (só cai em `AGUARDANDO` se nulo). Zera `finalizado_em`, registra mensagem de sistema "Conversa reaberta.", emite `conversa_atualizada`.
  - **Guard**: recusa reabrir (400) se já existe outra conversa não-finalizada pro mesmo telefone (mantém o invariante "no máximo uma conversa ativa por telefone" do qual `findConversaAtivaPorTelefone` depende).
  - Rota `PATCH /conversations/:id/reopen` (`JwtAuthGuard`, sem `RolesGuard`).
- Frontend (chat): botão "Reabrir conversa" no cabeçalho, só `tipo === "cliente" && status === "finalizado"`. Não navega pra fora — recarrega conversa+mensagens na própria tela.
- Frontend (lista, mesmo dia): linha da aba Finalizadas ganhou botão "Reabrir" com `ConfirmModal` de duas saídas ("Reabrir e abrir" → chat; "Só reabrir" → volta pra fila e recarrega a lista, senão ficaria uma linha fantasma até o próximo evento de socket).
- **Prévia da última mensagem na fila**: cada linha traz a última mensagem truncada, prefixo "Equipe:"/"Sistema:" conforme origem. `ConversationsService.anexarUltimaMensagem` — campo transiente, uma query só pra página inteira (`DISTINCT ON (conversation_id) ... ORDER BY conversation_id, criado_em DESC`).
  - **Cuidado com `DISTINCT ON` no TypeORM**: escrito via query builder, o TypeORM escapa a expressão como nome de coluna e gera SQL inválido (`syntax error at or near "DISTINCT"`, 500 em toda listagem — pego em teste, depois do build). Versão que funciona: SQL cru parametrizado via `repository.query(...)` com `WHERE conversation_id = ANY($1)`. Vale pra qualquer construção específica do Postgres sem equivalente no query builder.

Testado via curl (fluxo completo criar→assumir→finalizar→reabrir, guard de conversa duplicada, mensagem de sistema no histórico). `tsc`/`build` limpos. **Botão "Reabrir conversa" no chat não testado visualmente no navegador**; a versão na lista/prévia foi testada em conjunto com a feature de `/atendimentos` abaixo.

### Inbox de duas colunas — `/atendimentos` (2026-08-18)

Pedido depois de comparar com o **Zappy** (ferramenta que o escritório já usa, comentário: "mais enxuto"): painel numa tela só, lista à esquerda e conversa à direita.

**Rota nova, `/fila` e `/grupos` intactas de propósito** (sistema em uso real — trocar a tela de trabalho por versão não validada seria arriscado). Quando aprovado no uso, a decisão é tirar "Fila"/"Grupos" da nav (rotas continuam existindo).

- `ConversaPanel` (`components/conversa/ConversaPanel.tsx`) — corpo do chat virou componente (`conversationId` por prop, `onSair`). A página `/conversas/[id]` virou wrapper de 10 linhas e continua existindo (deep link, notificação, botão "Abrir" da fila) — mídia, áudio, respostas rápidas, transferir, finalizar funcionam nos dois lugares sem duplicação.
- Altura fixa via flex (`h-screen flex-col overflow-hidden` no layout do inbox, `min-h-0 flex-1` no `<main>`) — `h-[calc(100vh-4rem)]` errava por 1px (borda do header), gerando scroll fantasma; medido no navegador.
- Cinco abas: Todas, Na fila, Atendendo, Finalizadas, Grupos (é `tipo`, não status — manda `tipo=grupo`, omite status/setor/etiqueta). Contagem via `por_pagina: 1` só pra aproveitar o `total`.
- Nome de grupo na lista vem do `useWhatsappAvatar` (sem isso mostrava o JID cru).
- Responsivo: abaixo de `lg`, lista **ou** conversa, não as duas.
- **`?sem_ativo=true`** (só na aba Finalizadas do inbox): reportado pelo usuário ("juan ainda ficou no finalizado sendo que tá aberto") — mesmo telefone com uma conversa aberta e duas finalizadas aparecia nas duas abas. Filtro `NOT EXISTS` sobre o próprio `conversations` casando por telefone. `/fila` não manda o parâmetro, comportamento antigo preservado.
- **Uma linha por cliente, não por atendimento**: cada finalização cria uma `Conversation` nova, então o mesmo cliente aparecia repetido na aba Todas — reportado pelo usuário ("Juan é só um e fica em vários lugares"). Agrupamento por telefone no cliente, sobre a página carregada (30 itens), mostrando o atendimento mais recente — contadores das abas continuam contando atendimentos, não clientes.

**Validado no navegador**: colunas 360+1080 ocupando 835px de altura, rolagem só interna, `document.scrollHeight === innerHeight`, responsivo abaixo de `lg`, aba Grupos com nome resolvido, aba Todas com as 7 conversas.

### Aba Bot — quem está preso no menu, antes de virar atendimento (2026-08-18)

Buraco apontado pelo usuário comparando com o Zappy: cliente que manda a primeira mensagem e ainda não escolheu setor não existia em lugar nenhum do painel — a `Conversation` só nasce depois da escolha.

**Descoberto sem tocar no n8n**: o fluxo já consulta `GET /conversations/by-phone/:telefone` a cada mensagem, e cai no 404 exatamente no momento em que vai responder com o menu — `findConversaAtivaPorTelefone` registra a sessão de bot no caminho "não achou" e apaga no caminho "achou". Nenhum node novo, nenhum reimport de workflow.

- Tabela `bot_sessions` (migration `AddBotSessions`) — uma linha por telefone, `tentativas`.
- `INSERT ... ON CONFLICT (telefone) DO UPDATE` (duas mensagens quase simultâneas do mesmo número não criam duas linhas).
- Grupo não entra.
- Sessão apagada quando a conversa nasce (pela escolha do setor ou por um atendente puxando via `NovaConversaModal`).
- `GET /bot-sessions` lista; `DELETE /bot-sessions/:telefone` descarta sem abrir atendimento.
- Painel: cada linha tem "Atender" (abre `NovaConversaModal` preenchido) e um X pra ignorar.

**Limite conhecido**: lista mostra telefone/tempo/tentativas, mas não o texto — exigiria um node a mais no n8n, deixado de fora pra não obrigar reimportar o workflow.

**A aba "Todas" foi removida** a pedido do usuário na mesma conversa (com Bot/Na fila/Atendendo/Finalizadas/Grupos, "tudo junto" só embaralhava). **"Fila" e "Grupos" saíram da nav superior** quando viraram abas do inbox (usuário reportou duplicação — "grupo ainda tá em 2", "fila tá repetido"). As rotas continuam existindo (link salvo, "voltar" da tela de conversa).

**Validado no navegador** (dev server 3002, sessão copiada da 3001): colunas 360+1080 em 835px, rolagem só interna, composer dentro da tela, página não rola, responsivo abaixo de `lg`, aba Grupos com os 2 grupos, aba Todas com 7 conversas.

### Chamar o cliente sem ele chamar — `POST /conversations/outbound` + modal "Iniciar conversa" (2026-08-18)

Até aqui o sistema era inteiramente reativo. Pedido: chamar o cliente a partir de um contato salvo ou de um número digitado.

**Backend**, `POST /conversations/outbound`, autenticada (diferente de `POST /conversations`, chamada pelo n8n sem token — aqui o atendimento nasce no nome de quem chamou).

- Confere o número no WhatsApp antes de criar qualquer coisa (`EvolutionService.verificarNumero` → `POST /chat/whatsappNumbers/{instance}`, formato `[{jid, exists, number}]` confirmado contra a instância real).
- **Grava o telefone do JID devolvido, não o digitado** — celular antigo (sem o nono dígito) existe no WhatsApp nesse formato, e é isso que volta no webhook quando o cliente responde. Guardar o digitado abriria uma segunda conversa pro mesmo cliente semanas depois.
- `normalizarTelefoneDigitado`: tira não-dígitos, prefixa `55` quando é só DDD+número (10-11 dígitos); com 12+ presume DDI já incluído. O veredito de "existe" é sempre da Evolution API, nunca da regex.
- Número já com atendimento aberto devolve o existente (`ja_existia: true`) em vez de criar paralelo.
- Nasce `em_atendimento` com o `atendente_id` de quem chamou (nunca `aguardando`).
- Não manda mensagem nenhuma — quem envia é o `POST /conversations/:id/messages` de sempre.

**Frontend**: `NovaConversaModal` — telefone, nome opcional, setor (default o do atendente), primeira mensagem. Duas chamadas de propósito (`startConversation` + `sendMessage`), não uma rota que faz tudo. Dois pontos de entrada: "Iniciar conversa" na `/fila` e "Conversar" em cada linha de `/contatos` (telefone travado). Quando `ja_existia`, não envia a mensagem digitada (a conversa pode estar com outro atendente, sairia assinada errado) — mostra aviso + "Abrir conversa".

**Efeito colateral bom no n8n, sem tocar no fluxo**: como a conversa já existe quando o cliente responde, ele não recebe o menu de setores.

Testado via curl: número sem WhatsApp devolve 400 amigável sem criar conversa; número curto barrado pelo DTO; sem token, 401; máscara funciona. Filtro por etiqueta validado com dado real nesta mesma sessão. Todo dado de teste apagado ao final (banco conferido: 0 tags, 0 client_tags, 0 conversas de teste). `tsc` limpo nos dois lados.

**Não testado no navegador**: o modal em si — falta um número real de teste.

### Histórico de mensagens de antes da escolha do setor, injetado na conversa (2026-08-20)

Pedido do usuário: hoje, quando o atendente assume uma conversa, só vê o número do departamento que o cliente digitou ("3") — sem nenhum contexto do que a pessoa queria, mesmo que ela tenha mandado várias mensagens fragmentadas antes de acertar a escolha (ex: "Oi", "bom dia", "preciso de holerite", "3"). Pedido: mostrar esse histórico completo assim que o atendimento nasce, pra o atendente já saber o que a pessoa deseja e, se for de outro setor, transferir na hora.

**Descoberto sem precisar de node novo no n8n, reaproveitando o mesmo gancho da aba Bot** (ver "Aba Bot" acima): `GET /conversations/by-phone/:telefone` já é chamado a cada mensagem recebida, e `registrarTentativa` já dispara nesse caminho quando ainda não existe conversa — só faltava o **texto** da mensagem chegar até ali (antes só telefone).

**Backend**:
- `bot_sessions` ganhou a coluna `mensagens` (jsonb, array de `{texto, criado_em}`, migration `AddBotSessionMensagens`) — `BotSessionsService.registrarTentativa(telefone, texto?)` agora concatena (`mensagens || $2::jsonb`) cada fragmento com texto não-vazio ao array existente, no mesmo `INSERT ... ON CONFLICT` que já incrementava `tentativas` (evita condição de corrida entre mensagens quase simultâneas, mesmo motivo de sempre). Mensagem de mídia sem legenda nessa fase (texto vazio) só conta pra `tentativas`, não entra no array — mesmo escopo de sempre (só texto).
- `BotSessionsService.consumirHistorico(telefone)` — `DELETE ... RETURNING mensagens` (ler e apagar como uma operação só), substitui `encerrar()` nos dois pontos em que uma conversa nasce.
- `ConversationsService.findConversaAtivaPorTelefone(telefone, texto?)` repassa o texto pro `registrarTentativa`. `ConversationsController.findByPhone` ganhou `@Query('texto')` — opcional, não quebra chamadas antigas.
- `ConversationsService.create()` (n8n, escolha de setor) e `iniciar()` (atendente puxando da aba Bot) chamam `consumirHistorico` e um helper novo, `inserirHistoricoBot`, que insere cada mensagem do histórico como uma `Message` normal de origem `cliente`, com o horário **original** em que foi escrita (não "agora") — `save()` grava com `criado_em` automático e um `update()` em seguida corrige pro timestamp guardado no bot_sessions (mesmo truque de duas etapas já usado pra `evolution_message_id`). Um divisor de sistema ("Mensagens recebidas antes da escolha do setor:") só entra quando há **mais de uma** mensagem no histórico — pro caso comum (pessoa digitou o número certo de primeira) não vira um aviso vazio sem nada de novo.
- **Evita duplicar a última mensagem**: o texto que validou a escolha do setor (`dto.mensagem_inicial`, mandado pelo n8n) normalmente É a mesma mensagem que já entrou como último item do histórico (foi capturada pelo mesmo `registrarTentativa`, na mesma execução que levou à criação da conversa) — `create()` só insere `mensagem_inicial` separadamente se o texto não bater com o último item do histórico (cobre chamadas que não passam pelo fluxo normal de bot-session, e conversa de grupo, que nunca gera sessão de bot).

**n8n**: um único node editado (não um node novo — sem precisar reconfigurar credenciais): `Verificar Conversa Ativa` (GET by-phone) ganhou `?texto=` + `encodeURIComponent($json.texto || '')` na URL, mandando o texto da mensagem recebida. JSON validado (`json.load` sem erro) depois da edição.

**Frontend**: `BotSession.mensagens` no tipo; aba Bot (`/atendimentos`) mostra a última mensagem entre aspas abaixo do contador de tentativas — fecha a limitação conhecida de sempre ("lista mostra telefone/tempo/tentativas, mas não o texto"), de graça já que o backend agora captura isso. Nenhuma mudança no chat em si — as mensagens de histórico entram como `Message` normais (origem cliente + divisor de sistema), e a tela de conversa já renderiza ambas do jeito de sempre.

`tsc --noEmit` e `npm run build` limpos nos dois lados.

**Aplicado em produção local na sequência (mesmo dia)**: Docker subiu normalmente (containers já estavam de pé), `npm run migration:run` (testado run/revert/run contra o Postgres de dev, porta 5433) aplicou `AddBotSessionMensagens` sem erro. Backend/frontend reconstruídos e recriados (`docker compose ... build backend frontend` + `up -d`) pra pegar o código novo — sem isso o container antigo continuaria servindo a versão sem o histórico. Testado via curl contra o backend containerizado real: `GET /conversations/by-phone/:telefone?texto=...` grava corretamente em `bot_sessions.mensagens` (dado de teste conferido e apagado em seguida). Node `Verificar Conversa Ativa` editado **direto na UI do n8n** (via automação de browser, não reimport do JSON completo — evita ter que reconfigurar as credenciais de Redis/SMTP) e republicado; valor final conferido lendo o DOM do editor (`{{ "http://host.docker.internal:3000/conversations/by-phone/" + $json.telefone + "?texto=" + encodeURIComponent($json.texto || '') }}`), batendo exatamente com o `fluxo-completo-com-backend.json`.

**Ainda falta só o teste com WhatsApp real** (cliente mandando mensagens fragmentadas antes de escolher o setor, atendente assumindo e conferindo que o histórico aparece no chat) — a cargo do usuário, que vai testar em tempo real pela extensão do Chrome.

### Legibilidade das mensagens do bot no chat (2026-08-24)

Pedido do usuário: o menu de setores e a confirmação de setor (texto mandado pelo bot/n8n direto pro WhatsApp do cliente) apareciam como pílula centralizada escura (`bg-sunken` + `text-muted`) — a mesma UI usada pra avisos administrativos curtos ("Conversa transferida.", "Conversa reaberta."). Pra texto de várias linhas (o menu inteiro), ficava escuro demais e difícil de ler. Pedido: mesma cor das mensagens que o atendente manda pelo painel.

Origem "sistema" cobre dois casos bem diferentes hoje: avisos administrativos gerados pelo próprio backend (curtos) e conteúdo de verdade que o bot manda ao cliente (menu reenviado, confirmação de setor — ambos inseridos com `MessageOrigin.SISTEMA`, ver `inserirHistoricoBot` e o node "Registrar Confirmação na Conversa" do n8n). Sem um campo de subtipo no banco, a distinção ficou só no frontend: `frontend/src/lib/messages.ts` (`ehAvisoAdministrativo`) reconhece os avisos administrativos por prefixo fixo do texto (`"Conversa transferida"`, `"Conversa reaberta."`, `"Mensagens recebidas antes da escolha do setor:"`) — o resto que chega com origem sistema é tratado como mensagem de bot de verdade.

`ConversaPanel.tsx` e `ConversaPreviewPopover.tsx` (mesmo problema no preview ao passar o mouse na fila) passaram a estilizar mensagem de bot igual à do atendente (`bg-tide-500`, alinhada à direita), com um rótulo pequeno "Mensagem automática" acima do balão (mesmo padrão já usado pra "Enviado pelo celular") pra não confundir o atendente pensando que foi um colega quem escreveu. Avisos administrativos continuam como pílula discreta, sem mudança.

Rebuild + restart do container `frontend` (`docker compose ... build frontend` + `up -d frontend`) pra aplicar — o painel em `localhost:3001` é o build de produção containerizado, não pega mudança de código sem rebuild. `tsc --noEmit` limpo. **Testado no navegador** contra a conversa real "Juan10" (departamento TI): menu e confirmação renderizam no tom `tide-500` com o rótulo, avisos administrativos não testados nesta sessão (mudança não afeta esse caminho).

### Preview ao passar o mouse também na aba Fila (2026-08-24)

Pedido do usuário, mesma sessão: o preview com hover de 2s (`ConversaPreviewPopover`, já existente na aba "Atendendo" — ver commit "adjust hover preview delays and enhance mouse event handling for conversation popover") também na aba **Fila** (`aguardando`), antes de assumir.

Fazia falta especificamente aí: conversa em "aguardando" não renderiza o `ConversaPanel` no painel principal ao clicar — só mostra um botão "Assumir atendimento" (ver o `else if` em `AtendimentosPage`, `selecionada.status === "aguardando"`), sem nenhuma forma de ler as mensagens antes de decidir assumir. Mudança de uma linha: `LinhaConversa` (`frontend/src/app/(painel)/atendimentos/page.tsx`) já recebia `previewOnHover` como prop — só trocou `previewOnHover={tab === "em_atendimento"}` por `previewOnHover={tab === "em_atendimento" || tab === "aguardando"}`. `HOVER_PREVIEW_DELAY_MS` já estava em 2000ms (pedido anterior), não mudou.

Rebuild + restart do container `frontend`. `tsc --noEmit` limpo. **Testado no navegador**: aba Fila, hover ~3s sobre a linha "Juan10" (aguardando, setor Contabilidade) — popover abriu com o histórico completo, incluindo o estilo novo das mensagens de bot da entrada acima.

### Validação em tempo real via WhatsApp real (2026-08-27)

Usuário confirmou, testando ao vivo pelo WhatsApp (não mais só navegador/curl), os três itens acima:

- **Histórico de mensagens de antes da escolha do setor (2026-08-20)**: cliente mandando mensagens fragmentadas antes de escolher o setor, atendente assumindo e conferindo que o histórico aparece no chat — era o único item da lista ainda pendente desse teste, agora fechado.
- **Legibilidade das mensagens do bot no chat (2026-08-24)**: menu de setores e confirmação de setor no tom `tide-500` com o rótulo "Mensagem automática".
- **Preview ao passar o mouse também na aba Fila (2026-08-24)**: hover na aba Fila abrindo o preview com o histórico.

---

## Status atual do projeto (checklist consolidado)

- [x] Backend NestJS completo e compilando (auth, departments, users, conversations, messages, websocket, integração Evolution)
- [x] Workflow do n8n integrado de ponta a ponta com o backend
- [x] Frontend Next.js — login + painel protegido completos: fila por setor (com Assumir), chat (histórico + envio + Transferir + Finalizar), dashboard de contagens. Todos os três telas já ligadas ao Socket.IO.
- [x] `tsc --noEmit` e `npm run build` do frontend passam limpos; todas as rotas do painel respondem 200 num `next start` sem backend rodando
- [x] Infra local via Docker Compose validada em 2026-07-24 (Postgres/Redis/Evolution/n8n/pgAdmin saudáveis) e backend NestJS conectado a ela
- [x] Frontend testado manualmente pelo navegador contra o backend + Postgres reais (2026-07-24)
- [x] Fluxo real via WhatsApp testado (2026-07-24), webhook por instância configurado
- [x] Mensagens do atendente levam assinatura "Nome - CÓDIGO" no WhatsApp (2026-07-24), testado e validado
- [x] Tela `/usuarios`: listar, criar, editar, inativar/reativar e excluir (soft-delete), busca client-side, `senha_hash` corrigido
- [x] `ConfirmModal` substituindo `window.confirm`
- [x] Debounce de mensagens fragmentadas no n8n, testado com WhatsApp real (2026-07-29)
- [x] Guard de `role: admin` em `/users`
- [x] Healthcheck de conexão do WhatsApp com alerta por e-mail, testado e validado (2026-07-30)
- [x] Badge de mensagens não lidas + toast de notificação, testado com WhatsApp real
- [x] Tela `/whatsapp` (QR Code), testado escaneando QR real (2026-07-30)
- [x] Migrations do TypeORM substituindo `TYPEORM_SYNCHRONIZE` (2026-07-30)
- [x] Tela `/departamentos` — criar/renomear/inativar/reativar setores (2026-07-31)
- [x] Aba "Finalizadas" na fila, busca por nome/telefone e intervalo de datas (2026-07-31)
- [x] Menu dinâmico do WhatsApp (2026-08-05), substituiu o mapeamento fixo
- [x] Mensagens de mídia (imagem, áudio, documento) — receber e enviar (2026-08-05), testado com WhatsApp real
- [x] Suporte a vídeo (2026-08-07), validado com WhatsApp real em 2026-08-15
- [x] `senha_hash` vazando em `Message.atendente` corrigido (2026-08-07)
- [x] `content` do Tailwind generalizado (2026-08-07)
- [x] Respostas rápidas + mensagens automáticas ao Assumir/Finalizar (2026-07-31), testado com WhatsApp real (2026-08-18)
- [x] Paginação (5 por página) nas 3 abas da fila (2026-07-31)
- [x] Página de status/uptime `/status` + `/status/publicar` (2026-08-04), testado e validado (2026-08-05)
- [x] Horário de funcionamento configurável + resposta automática fora do expediente (2026-08-04), testado ponta a ponta
- [x] Grupos do WhatsApp — sem menu de setor + aba `/grupos` (2026-08-15), testado com grupo real (2026-08-18)
- [x] Remetente em grupo, mensagens do celular no painel (dedup), envio de áudio pelo painel (2026-08-17), validado com WhatsApp real (2026-08-18)
- [x] Gravação de áudio pelo microfone (2026-08-17), testado com microfone e WhatsApp real (2026-08-18)
- [x] Aba `/contatos` — sincroniza WhatsApp + lista própria com importar/exportar CSV (2026-08-17), testado e validado (2026-08-18)
- [x] Papel Supervisor + toggle "Ver todos os setores" (2026-08-17), testado e validado (2026-08-18)
- [x] Avatares (foto de perfil) + nome de grupo ao vivo (2026-08-17), testado e validado (2026-08-18)
- [x] Avatar de quem escreveu cada mensagem num grupo (2026-08-17), testado e validado (2026-08-18)
- [x] Modal ao Assumir/Finalizar perguntando se manda mensagem automática (2026-08-17), testado e validado (2026-08-18)
- [x] Rótulos de papéis editáveis `/perfis` (N1/N2/N3) (2026-08-17), testado e validado (2026-08-18)
- [x] Header com dropdown "Administração" (2026-08-17), testado e validado (2026-08-18)
- [x] Mensagens automáticas + respostas rápidas editáveis `/mensagens` (2026-08-18) — código completo, testado via curl. **Falta teste visual no navegador.**
- [x] Etiquetas de clientes `/etiquetas` (2026-08-18) — código completo, testado via curl, bug do popover corrigido. **Falta teste visual no navegador.**
- [x] Skeleton de carregamento pro nome/foto ao vivo (2026-08-18) — código completo. **Falta teste visual no navegador.**
- [x] Reabrir conversa finalizada (2026-08-18) — código completo, testado via curl. **Falta teste visual do botão no chat isoladamente** (a versão na lista foi validada junto do inbox).
- [x] Filtro por etiqueta na fila + contagem de uso no catálogo (2026-08-18) — código completo. **Falta teste com dado real.**
- [x] Inbox de duas colunas `/atendimentos` (2026-08-18), validado no navegador
- [x] Aba Bot (2026-08-18), validado no navegador
- [x] `POST /conversations/outbound` + modal "Iniciar conversa" (2026-08-18) — testado via curl. **Falta teste do modal no navegador com número real.**
- [x] Painel acessível pela rede local (2026-08-18) — testado via curl a partir da própria máquina. **Falta teste a partir de uma máquina real da rede.**
- [x] Histórico de mensagens de antes da escolha do setor injetado na conversa (2026-08-20), testado e validado com WhatsApp real (2026-08-27)
- [x] Legibilidade das mensagens do bot no chat, tom `tide-500` (2026-08-24), testado e validado com WhatsApp real (2026-08-27)
- [x] Preview ao passar o mouse também na aba Fila (2026-08-24), testado e validado com WhatsApp real (2026-08-27)

## Ambiente de desenvolvimento

Docker reinstalado em 2026-07-24 (Docker version 29.6.2, Compose v5.3.1, daemon ativo).

`backend/.env` aponta pra `localhost:5433/atendimento_db` (porta 5433, não 5432 — ver motivo abaixo; backend roda fora do Docker), `EVOLUTION_API_URL=http://localhost:8089`, `EVOLUTION_API_KEY` copiada do `.env` da raiz. `JWT_SECRET` gerado com `openssl rand -hex 32` — trocar antes de produção real.

`WEBHOOK_GLOBAL_ENABLED` no `docker-compose.yml` está `"false"` (webhook precisa ser configurado por instância no Manager da Evolution API, senão duplica mensagens junto com o webhook global).

### `docker compose up` validado em 2026-07-24 — ajustes necessários nesta máquina

- **Credencial do Docker CLI**: `~/.docker/config.json` tinha `"credsStore": "desktop"` apontando pro binário `docker-credential-desktop`, fora do PATH — bloqueava `docker compose up`. Removida a chave `credsStore`.
- **Porta 5432 já ocupada**: PostgreSQL nativo do Windows rodando como serviço (`postgresql-x64-13`, não relacionado a este projeto — não mexer). O Postgres do `docker-compose.yml` publica em `5433:5432` no host; containers continuam se falando por `postgres:5432` na rede interna.
- **Volume `postgres_data` com resíduo**: se precisar resetar do zero, `docker volume rm automacao_postgres_data` (destrutivo — não fazer sem confirmar com o usuário).
- **Backend via `npm run start:dev` não funciona no Git Bash** desta máquina (erro de resolução de PATH do shim do npm no MSYS). Funciona via PowerShell.

### Backend e frontend também containerizados — `docker-compose.app.yml` (2026-08-09)

Motivado pela decisão de hospedar o Maré como SaaS (infra isolada por cliente — ver memória `project_saas_hosting_model`). Backend e frontend ganharam `Dockerfile` próprio e um segundo compose, `docker-compose.app.yml`.

- Backend (`backend/Dockerfile`): `node:20-bookworm-slim` (glibc — `bcrypt` precisa de binário nativo pré-compilado, alpine/musl exigiria compilar). Multi-stage: `nest build` no builder, `npm ci --omit=dev` + `dist/` no final. Roda `node dist/main`.
- Frontend (`frontend/Dockerfile`): mesma base. **`NEXT_PUBLIC_*` entram como `ARG`/build arg** — embutidos no bundle JS em build-time, então mudar exige rebuild da imagem, não só restart.
- `docker-compose.app.yml` conecta os dois na rede da infra (`automacao_atendimento-network`, external) — dentro do container o backend fala `postgres:5432`/`evolution-api:8080`. Sobe com `docker compose -f docker-compose.yml -f docker-compose.app.yml up -d backend frontend`.
- Portas publicadas continuam as mesmas (3000 backend, 3001 frontend) — n8n continua chamando `host.docker.internal:3000` sem mudança.
- `uploads/` do backend usa bind mount (`./backend/uploads:/app/uploads`) — preserva arquivos entre rebuilds.
- **Migrations continuam rodando de fora do container**, nativas (a imagem de produção não carrega `ts-node`/devDependencies).
- Variáveis novas (`JWT_SECRET`, `JWT_EXPIRES_IN`, `NEXT_PUBLIC_*`) no `.env` da raiz.
- **Isso é adicional, não substitui o fluxo nativo** — pra iteração rápida, `npm run start:dev`/`npm run dev` nativos continuam mais rápidos (hot-reload vs. rebuild de imagem).

**`credsStore` voltou em 2026-08-15** (provável atualização do Docker Desktop reescrevendo `config.json`) — mesma correção aplicada de novo. **Se reaparecer, é essa mesma correção** — considerar fixar de forma permanente (ex: instalar `docker-credential-desktop` no PATH) se continuar voltando.

### Painel acessível pela rede local — `localhost` trocado pelo IP da máquina (2026-08-18)

`NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WS_URL` mudaram de `http://localhost:3000` pro IP real da Ethernet (`http://10.0.2.221:3000`, via DHCP — pode mudar; se o painel parar de funcionar pra outras máquinas, checar primeiro se o IP mudou).

- `.env` da raiz alimenta o build da imagem Docker do frontend — precisou rebuild pra pegar efeito (`NEXT_PUBLIC_*` embutidos em build-time). Confirmado via `docker exec frontend grep -a "10.0.2.221" /app/.next/static/chunks/*`.
- CORS já estava liberado (`origin: '*'`) — nenhuma mudança de código.
- Bloqueio real era o **Firewall do Windows**: regra pra porta 3000 já existia (de sessão antiga nativa), faltava pra 3001. Criada `New-NetFirewallRule -DisplayName "Mare - Frontend 3001" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow -Profile Domain,Private`.
- Fora de escopo: outros serviços da infra (n8n, pgAdmin, Manager, Postgres, Redis) continuam só via `localhost` — só o painel (3000+3001) foi liberado pra LAN.

**Testado nesta sessão a partir da própria máquina** (`curl` via IP). **Não testado a partir de uma máquina real da rede local.**

## Próximos passos (pendências reais)

- **Chave compartilhada n8n↔backend** nas rotas públicas — trade-off de MVP, decisão do usuário (2026-07-30): manter assim por enquanto, corrigir só perto de produção.
- **Editar/apagar mensagem própria** (ver seção "Editar/apagar mensagem própria no WhatsApp real" acima): rodar `migration:run` e testar com WhatsApp real (editar texto, apagar para todos, e o caso de erro quando a janela de tempo do WhatsApp já expirou).
- **Validação visual no navegador pendente** (código completo, só falta o teste com cliente real): `/mensagens`, `/etiquetas` (+ pill/picker na fila e no chat), skeleton de carregamento, botão "Reabrir conversa" isolado no chat, filtro por etiqueta com dado real, modal "Iniciar conversa"/`NovaConversaModal` com número real, acesso ao painel a partir de uma máquina real da rede local.
- **Figurinha (sticker), localização, contato e enquete** do WhatsApp — fora de escopo, avaliar só se o uso real pedir.
- **Nome do grupo automático** já foi resolvido (ver "Avatares" acima) — item antigo, não é mais pendência.
- **Badge/toast de notificação pra mensagem de grupo** — `useNotifications` não reage a mensagem de grupo hoje (`conversa_atendente_id` é sempre `null` pra grupo). Não pedido ainda, avaliar se fizer falta.

### `SETUP-NOVA-MAQUINA.md` — roteiro pra máquina nova (2026-08-27)

Pedido do usuário: um arquivo único com o passo a passo de colocar o projeto de pé do zero (`.env`, `npm install`, infra Docker, migrations/seed, Evolution API, n8n), pra não precisar redescobrir isso a cada máquina nova.

Motivado pelo que aconteceu nesta mesma sessão, numa máquina nova (Linux/WSL2, sem containers nem `node_modules` ainda): `npm install` rodado em backend/frontend; `docker compose -f docker-compose.yml -f docker-compose.app.yml up -d --build` **falhou de primeira** — `network automacao_atendimento-network declared as external, but could not be found`, porque `docker-compose.app.yml` marca a rede como `external: true` (só existe depois que `docker-compose.yml` sobe sozinho uma vez). Corrigido subindo `docker-compose.yml` isolado primeiro, depois os dois juntos só pra `backend`/`frontend`. Esse gotcha (não documentado antes, só citado de passagem no comentário do próprio `docker-compose.app.yml`) é o motivo principal do arquivo novo. Migrations (15) e seed rodados na sequência sem erro.

`SETUP-NOVA-MAQUINA.md` documenta: pré-requisitos, as três `.env` (nenhuma vem no git — cada pasta tem seu próprio `.gitignore` cobrindo o próprio arquivo, não existe `.env.example` versionado hoje), ordem de subida dos composes, migration/seed, configuração da Evolution API (instância + QR + webhook por instância) e do n8n (import do JSON + credenciais Redis/SMTP/API key + nota sobre `host.docker.internal` vs `http://backend:3000` quando o backend está containerizado na mesma rede), teste ponta a ponta, e uma seção de problemas já vistos antes (`credsStore`, porta 5432 ocupada, `NEXT_PUBLIC_*` exigindo rebuild).

**Não testado como roteiro do zero numa terceira máquina** — escrito com base no que rodou nesta sessão + nas convenções já documentadas no `CLAUDE.md`.

### n8n + Evolution API configurados e validados nesta máquina nova (2026-09-01)

Sequência completa desta sessão, na mesma máquina Linux/WSL2 do `SETUP-NOVA-MAQUINA.md` acima: rebuild + recreate de todos os containers (`backend`/`frontend` via `build`, resto via imagem), depois configuração do n8n e da Evolution API do zero.

**Webhook da Evolution API** (Manager, por instância): só `MESSAGES_UPSERT` marcado — é o único evento que o Code node de extração processa (`event !== 'messages.upsert'` descarta o resto). `Webhook Base64` e `Webhook by Events` desligados (mídia é buscada sob demanda via `wa_message_id`, não embutida no payload; o path do webhook é fixo, não varia por evento).

**Import do n8n feito via CLI do container, não pela UI/extensão do Chrome** (`docker exec n8n n8n import:workflow`/`import:credentials`) — mais confiável que automação de navegador e não exigiu abrir o editor manualmente. Passo a passo: (1) editado o JSON exportado antes do import, substituindo o placeholder `COLOQUE_AQUI_A_EVOLUTION_API_KEY` pelo valor real do `.env` nos 5 nodes que usam (`Buscar Mídia`, `Enviar Mensagem - Fora do Horário`, `Enviar Confirmação de Setor`, `Enviar Menu`, `Verificar Estado da Instância` — é texto puro no header, não credential do n8n); (2) criada uma credential Redis via `import:credentials` (host `redis`, porta `6379`, database `0`, sem senha) e vinculada por `id` nos 9 nodes Redis do fluxo antes do import; (3) `import:workflow` exigiu um campo `id` no JSON top-level (o export não trazia — sem isso dá erro `null value in column "id"`); (4) `--projectId` do projeto pessoal (consultado direto no Postgres, tabela `project`, já que o n8n roda em modo Basic Auth sem gestão de usuário completa). SMTP ficou por conta do usuário (mensagem automática de alerta de desconexão), único item não automatizado.

**Bug de fuso horário encontrado e corrigido durante o teste**: `BusinessHoursService.estaAberto()` (`backend/src/business-hours/business-hours.service.ts:36`) assume `new Date()` já em hora local — premissa válida quando o backend rodava nativo (America/Sao_Paulo), mas quebrada desde que passou a rodar em Docker (`docker-compose.app.yml`, 2026-08-09) sem a env `TZ`, caindo em UTC por padrão. Resultado prático: às 16h53 locais (dentro do expediente 8h-18h) o endpoint `/business-hours` respondia `aberto: false`, porque o container lia 19h53. Corrigido adicionando `TZ: America/Sao_Paulo` ao serviço `backend` em `docker-compose.app.yml` (mesmo valor do `GENERIC_TIMEZONE` que o `n8n` já usa em `docker-compose.yml`) — runtime env, não exigiu rebuild de imagem, só `--force-recreate` do container. Único lugar do código com esse pressuposto (checado via grep por `getHours()`/`getDay()` em todo `backend/src` — o resto usa `timestamptz`/`.toISOString()`, já timezone-safe).

**Teste ponta a ponta via webhook simulado** (curl direto em `http://localhost:5678/webhook/whatsapp` com payload no formato Baileys/`messages.upsert`, número fake): validou a cadeia n8n → backend (bot-session criada, `/business-hours`, `/departments` respondendo certo) → tentativa de envio via Evolution API. Duas tentativas deram erro 500 (`Cannot read properties of undefined (reading 'find')`) vindo da própria Evolution API, não do n8n/backend — causa: a instância `atendimento-empresa` ainda não tinha o QR Code escaneado, e ficava reiniciando o canal a cada ~3min tentando autenticar (`ChannelStartupService` repetindo nos logs); a chamada de envio calhou de bater num desses instantes de reinício. Dados de teste (bot_sessions dos números fake) apagados depois via SQL direto — nenhuma conversa real chegou a ser criada.

**Validado pelo usuário em seguida, com o QR Code escaneado no WhatsApp real**: confirmado funcionando ("validei no meu whatsapp está tudo perfeitamente rodando"), e `GET /instance/connectionState/atendimento-empresa` confirma `state: "open"`.

### Editar/apagar mensagem própria no WhatsApp real (2026-09-02)

Pedido do usuário: corrigir erro de digitação (editar) ou erro de envio (apagar para todos) de uma mensagem que o próprio atendente mandou — refletindo de verdade no WhatsApp do cliente, não só no histórico do painel. Confirmado por pesquisa que a Evolution API expõe `PUT /chat/updateMessage/{instance}` (body: `{ number, text, key: { remoteJid, fromMe, id } }`) e `DELETE /chat/deleteMessageForEveryone/{instance}` (body: `{ id, remoteJid, fromMe }`) — ambos só funcionam para mensagem `fromMe: true` (mandada pelo próprio número), dentro da janela de tempo que o **WhatsApp** impõe (não a Evolution API) — por isso não replicamos nenhuma janela de tempo no backend, deixamos a Evolution API rejeitar e o erro sobe como 500 genérico pro frontend (mesmo padrão já usado pra falha de `enviarMensagem`/`enviarMidia`).

- **Backend**: `Message` ganhou `editado_em`/`apagado_em` (`timestamptz`, migration `1788374255115-AddMessageEdicaoEApagamento`). `EvolutionService.editarMensagem`/`apagarMensagemParaTodos` (adapter). `MessagesService.editar`/`apagar`, com uma checagem comum (`buscarMensagemPropria`): só mensagem `origem: atendente`, só o próprio `atendente_id` (não vale editar/apagar mensagem de colega), nunca já apagada, precisa ter `evolution_message_id` (mensagem antiga sem esse campo não pode ser editada/apagada de verdade no WhatsApp). Editar, além disso, só mensagem `tipo: texto` (Evolution API/WhatsApp não editam legenda de mídia) — e reaplica a mesma assinatura `*Nome - SETOR:*` no texto reenviado (extraída pra `formatarNome`/`montarAssinatura`, reaproveitada por `create()`). Apagar **mantém o texto original em banco** (auditoria interna) — quem esconde o conteúdo na tela é o frontend, a partir de `apagado_em` preenchido. Dois endpoints novos, `PATCH`/`DELETE /conversations/:id/messages/:id` (autenticados, `req.user.id` é quem valida a posse — nunca o `atendente_id` vindo do body). Dois eventos de socket novos: `mensagem_editada`, `mensagem_apagada`.
- **Frontend**: ícones de editar/apagar aparecem só no hover, só na própria mensagem (`m.atendente?.id === user?.id`), editar vira um textarea inline na bolha (Enter salva, Esc cancela); apagar usa `ConfirmModal` (`variant="danger"`, mesmo padrão já usado no resto do painel) com aviso explícito de que some do WhatsApp do cliente também. Mensagem apagada mostra "Mensagem apagada" em itálico no lugar do conteúdo; mensagem editada ganha um " · editado" ao lado do horário.

**Não testado ainda** — `npm run migration:run` não foi rodado (fica a critério do usuário, mesma convenção do resto do projeto: revisar o SQL antes de rodar), e a ação real de editar/apagar no WhatsApp do cliente não foi validada com número real (só typecheck de backend e frontend, sem erro).
