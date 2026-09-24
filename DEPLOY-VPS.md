# Deploy numa VPS (produção)

Passo a passo pra colocar o Maré no ar numa VPS, com HTTPS, portas internas fechadas e backup automático. Modelo: **uma VPS por cliente** (infra isolada). Arquivos envolvidos: `docker-compose.prod.yml`, `Caddyfile`, `.env.prod.example`, `scripts/backup.sh`.

> Pra rodar em dev na sua máquina, o roteiro continua sendo o [`SETUP-NOVA-MAQUINA.md`](./SETUP-NOVA-MAQUINA.md). Este arquivo reaproveita as partes de configuração da Evolution API/n8n de lá e só explica o que muda.

## Como fica no ar

```
Internet ──443──► Caddy (HTTPS automático)
                    ├── painel.cliente.com ──► frontend :3001
                    └── api.cliente.com ─────► backend  :3000 (API + WebSocket)

Só dentro da VPS (rede Docker): postgres, redis, evolution-api, n8n
Acesso de admin a n8n / Evolution Manager / Postgres: túnel SSH (passo 7)
```

## 0. Escolher a VPS

- **Mínimo recomendado:** 2 vCPU, **4 GB de RAM**, 40 GB de disco SSD. A stack usa por volta de 1,5–2 GB de RAM (conferir com `docker stats` depois de subir).
- **Sistema:** Ubuntu 24.04 LTS.
- **Região:** Brasil (São Paulo) ou o mais perto possível, por causa da latência do painel.
- Provedores comuns: Hetzner, Contabo, Hostinger, DigitalOcean, Vultr, Magalu Cloud. Pra este projeto, qualquer um serve; compare preço e se tem datacenter no Brasil.

## 1. Domínio e DNS

Com um domínio comprado (Registro.br, Cloudflare, Hostinger...), criar **dois registros DNS tipo A** apontando pro IP público da VPS:

| Nome | Tipo | Valor |
|---|---|---|
| `painel` | A | IP da VPS |
| `api` | A | IP da VPS |

Se usar Cloudflare, deixar o proxy (nuvem laranja) **desligado** no começo: o Caddy precisa falar direto com o Let's Encrypt pra emitir o certificado.

Conferir antes de seguir: `ping painel.seudominio.com.br` precisa responder com o IP da VPS.

## 2. Preparar o servidor

Conectado por SSH como root, na primeira vez:

```bash
# Atualizar e criar um usuário próprio (não trabalhar como root)
apt update && apt upgrade -y
adduser mare && usermod -aG sudo mare

# Firewall: só SSH e web
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Docker (script oficial)
curl -fsSL https://get.docker.com | sh
usermod -aG docker mare

# Ferramentas do backup
apt install -y git rclone
```

Sair e entrar de novo como `mare` (`ssh mare@IP_DA_VPS`). Recomendado: configurar login por chave SSH e desativar login por senha.

> Por que as portas internas estão presas em `127.0.0.1` no `docker-compose.prod.yml`: o Docker ignora o `ufw` quando publica uma porta. Não adianta "fechar no firewall"; tem que ser no compose.

## 3. Código e `.env`

```bash
git clone <URL_DO_REPO> mare && cd mare
cp .env.prod.example .env
nano .env      # preencher tudo; gerar cada segredo com: openssl rand -hex 32
```

O `.env` nunca vai pro git. **Guarde uma cópia dele num lugar seguro** (gerenciador de senhas): sem ele, os backups não servem pra muita coisa.

## 4. Subir tudo

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps        # tudo "running"/"healthy"
```

O primeiro build demora alguns minutos. O Caddy emite os certificados sozinho em até ~1 minuto depois de subir; se falhar, ver `docker compose -f docker-compose.prod.yml logs caddy` (quase sempre é DNS ainda não propagado ou porta 80 fechada).

## 5. Migrations e seed

```bash
docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml run --rm migrate npm run seed
```

O `migrate` roda dentro de um container e sai; não precisa de Node instalado na VPS.

Depois, entrar em `https://painel.seudominio.com.br` com `admin@empresa.com` / `admin123` e **trocar a senha na hora**.

## 6. Conectar o WhatsApp e configurar o n8n

Abrir o túnel SSH (passo 7) e seguir as seções **5** e **6** do [`SETUP-NOVA-MAQUINA.md`](./SETUP-NOVA-MAQUINA.md), com estas diferenças:

- Evolution Manager e n8n são acessados em `http://localhost:8089` e `http://localhost:5678` **pelo túnel**, no seu computador.
- A URL do webhook da instância continua `http://n8n:5678/webhook/whatsapp` (é tráfego interno da VPS).
- **Não precisa trocar `host.docker.internal:3000` nos nós do n8n**: no compose de produção, esse nome aponta pro container do backend.
- Credencial Redis: host `redis`, porta `6379`, banco `0` (igual ao dev).
- O QR Code também pode ser escaneado pela tela **WhatsApp** do painel (admin), sem túnel.

Por fim, o teste ponta a ponta da seção 7 do mesmo arquivo.

## 7. Túnel SSH (acesso de administrador)

n8n, Evolution Manager e Postgres **não ficam expostos na internet**. Pra acessar do seu computador:

```bash
ssh -N -L 5678:localhost:5678 -L 8089:localhost:8089 -L 5433:localhost:5433 mare@IP_DA_VPS
```

Enquanto esse comando estiver rodando: n8n em `http://localhost:5678`, Evolution Manager em `http://localhost:8089`, Postgres em `localhost:5433` (DBeaver/pgAdmin local). Se alguma dessas portas já estiver ocupada na sua máquina (ex: o dev do Maré rodando), troque o número da esquerda: `-L 15678:localhost:5678`.

## 8. Backup automático

1. Criar um bucket num storage externo (Backblaze B2 é barato; S3, Google Drive etc. também servem) e configurar o `rclone config` na VPS.
2. Preencher `BACKUP_REMOTO` no `.env` (ex: `b2:mare-backups/cliente-x`).
3. Testar na mão: `./scripts/backup.sh`
4. Agendar todo dia às 3h (`crontab -e`):
   ```
   0 3 * * * /home/mare/mare/scripts/backup.sh >> /home/mare/backup.log 2>&1
   ```

O backup leva os 3 bancos, a pasta `backend/uploads` (mídias) e a sessão da Evolution API. Guarda `BACKUP_DIAS_RETENCAO` dias na VPS; o remoto você controla pela regra de retenção do próprio bucket.

### Restaurar (VPS nova ou desastre)

Com o repo clonado, o **mesmo `.env`** e a pasta do backup copiada pra `backups/<data>`:

```bash
C="docker compose -f docker-compose.prod.yml"
B=backups/<data>

$C up -d postgres
for banco in atendimento_db evolution_db n8n_db; do
  $C exec -T postgres pg_restore -U postgres -d "$banco" --clean --if-exists < "$B/$banco.dump"
done
tar -xzf "$B/uploads.tar.gz" -C backend
docker volume create mare_evolution_instances
docker run --rm -v mare_evolution_instances:/dados -v "$PWD/$B":/b alpine tar -xzf /b/evolution_instances.tar.gz -C /dados
$C up -d --build
```

**Teste uma restauração pelo menos uma vez** (numa VPS descartável): backup que nunca foi restaurado não é garantia.

## 9. Atualizar a versão no ar

```bash
cd ~/mare
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml run --rm migrate
```

Rodar um backup antes de atualizações com migration nova. Se o workflow do n8n mudou, reimportar pelo túnel (e reconfigurar as credenciais, que não vêm no JSON).

## Checklist antes de entregar pro cliente

- [ ] `https://painel...` e `https://api...` abrem com cadeado válido
- [ ] Senha do `admin@empresa.com` trocada
- [ ] Nenhuma porta além de 22/80/443 acessível de fora (testar de outra rede: `nc -zv IP_DA_VPS 5678` deve falhar)
- [ ] Mensagem de teste passa pelo menu e aparece no painel; resposta chega no WhatsApp (texto, imagem e áudio)
- [ ] E-mail de alerta do healthcheck testado
- [ ] `scripts/backup.sh` rodou e o arquivo apareceu no storage remoto
- [ ] `.env` guardado fora da VPS
