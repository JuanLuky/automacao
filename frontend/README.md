# Maré — Painel de atendimento

Frontend Next.js 14 (App Router) do sistema de atendimento por WhatsApp.

## Rodar

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Abre em `http://localhost:3001` (porta 3001 para não colidir com o backend NestJS na 3000).

Acesse `http://localhost:3001/login`. Credenciais do seed do backend:
`admin@empresa.com` / `admin123`.

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL do backend NestJS (padrão `http://localhost:3000`) |
| `NEXT_PUBLIC_WS_URL` | URL do WebSocket Gateway (mesma do backend) |
| `NEXT_PUBLIC_EVOLUTION_INSTANCE` | Nome exato da instância criada no Manager da Evolution API |

## Estrutura

```
src/
├── app/
│   ├── layout.tsx        Fontes, AuthProvider, metadados
│   ├── globals.css       Tokens de tema claro/escuro
│   ├── page.tsx          Redireciona conforme autenticação
│   └── login/page.tsx    Tela de entrada
├── components/
│   ├── ui/Field.tsx      Campo de texto (label, ícone, erro, mostrar senha)
│   ├── ui/Button.tsx     Botão com estado de carregamento
│   └── LiveQueuePanel.tsx  Painel lateral com a fila em movimento
├── hooks/
│   ├── useAuth.tsx       Contexto de sessão (token + usuário)
│   └── useTheme.tsx      Alterna claro/escuro com persistência
├── lib/api.ts            Axios, interceptor de token, mensagens de erro
└── types/index.ts        Espelha as entidades do backend
```

## Sistema de design

**Paleta** — definida em `tailwind.config.ts`:

| Token | Hex | Uso |
|---|---|---|
| `abyss-900` | `#07161F` | Fundo do painel lateral |
| `abyss-800` | `#0B1F2A` | Superfície elevada no escuro |
| `tide-500` | `#14B8A6` | Ação: entrar, assumir, enviar |
| `tide-400` | `#2DD4BF` | Estado ativo, online, destaque |
| `mist-300` | `#B4C6D0` | Texto secundário no escuro |
| `waiting` | `#F59E0B` | Status aguardando na fila |
| `alert` | `#F87171` | Erros |

**Tipografia** — Bricolage Grotesque (display) e Inter (corpo/UI).

**Assinatura** — a "linha de maré": um gradiente teal que percorre a base do
painel lateral, reaproveitado adiante como indicador de conexão do WebSocket.

## Estado atual

- [x] Tela de login
- [ ] Fila de atendimentos por setor
- [ ] Tela de chat
- [ ] Transferir / Finalizar
- [ ] Dashboard

## Nota sobre o build

O `next/font/google` baixa as fontes em tempo de build. Se a máquina estiver
sem acesso a `fonts.googleapis.com`, o build falha nessa etapa — não é erro de
código.
