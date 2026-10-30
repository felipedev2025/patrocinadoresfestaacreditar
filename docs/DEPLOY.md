# Colocando no ar

## Opção A — VPS própria (recomendada)

Tudo num servidor: site, worker de vídeo, PostgreSQL, Redis e HTTPS automático (Caddy + Let's Encrypt).

### 1. Contratar a VPS

| Uso | Configuração | Exemplos |
|---|---|---|
| Mínimo (vídeos Full HD) | 4 vCPU · 8 GB RAM · 80 GB SSD | Hostinger KVM 4, Contabo VPS M, DigitalOcean 8 GB |
| Confortável (4K / muitos vídeos) | 8 vCPU · 16 GB RAM | Contabo VPS L, Hetzner CPX41 |

Sistema: **Ubuntu 24.04** (ou 22.04 / Debian 12).

### 2. Apontar o domínio

No painel do seu domínio (Registro.br, Cloudflare, Hostinger…), crie um registro **A**:

```
patrocinios.seudominio.com.br  →  IP da VPS
```

Se usar Cloudflare, deixe a nuvem **cinza** (somente DNS) até o certificado ser emitido.

### 3. Instalar

Acesse a VPS por SSH como root e rode:

```bash
git clone --branch claude/intelligent-babbage-0g9735 https://github.com/felipedev2025/patrocinadoresfestaacreditar.git /opt/patrocinios
```

```bash
cd /opt/patrocinios && bash deploy/install.sh
```

O script pergunta domínio, e-mail e senha do administrador, gera os segredos, instala Docker, libera o firewall (22/80/443), faz o build e sobe tudo. Ele também cria o evento **9º Porto Feliz Fest Show 2026** e agenda o backup diário.

Depois do merge do PR na `main`, use `--branch main` (o script já usa `main` por padrão nas atualizações).

### 4. Acessar

`https://patrocinios.seudominio.com.br` → login com o e-mail e a senha informados.

### Operação

```bash
cd /opt/patrocinios && docker compose logs -f web worker
```

```bash
cd /opt/patrocinios && git pull && docker compose build && docker compose up -d
```

```bash
/usr/local/bin/patrocinios-backup
```

Backups ficam em `/var/backups/patrocinios` (banco `.dump` + arquivos `.tgz`, 14 dias). Copie-os periodicamente para fora da VPS (Google Drive, S3).

Restaurar o banco:

```bash
cd /opt/patrocinios && docker compose exec -T postgres pg_restore -U patro -d patrocinios --clean < /var/backups/patrocinios/db-AAAAMMDD-HHMM.dump
```

### Armazenamento

O padrão é `STORAGE_DRIVER=local`, num volume Docker compartilhado entre `web` e `worker`, com URLs assinadas e expiração. Para usar S3 / Cloudflare R2, defina no `.env`:

```
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<conta>.r2.cloudflarestorage.com
S3_PUBLIC_ENDPOINT=            # vazio quando o endpoint já é público
S3_BUCKET=patrocinios
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_FORCE_PATH_STYLE=true
```

---

## Opção B — Vercel (somente o site) + worker separado

A Vercel roda o **site e a API**, mas **não** roda o worker de vídeo: a renderização usa Chrome + FFmpeg por vários minutos, acima dos limites de tempo e memória das funções serverless. A arquitetura fica híbrida:

| Peça | Onde |
|---|---|
| Site + API (Next.js) | Vercel |
| PostgreSQL | Neon ou Supabase |
| Redis (fila BullMQ) | Upstash Redis (conexão TCP/TLS `rediss://`) |
| Arquivos | Cloudflare R2 ou AWS S3 (`STORAGE_DRIVER=s3`, obrigatório: o disco da Vercel é temporário) |
| Worker de vídeo | VPS pequena (4 vCPU) ou Railway, com `docker compose up -d worker` apontando para os mesmos serviços |

Variáveis na Vercel: `APP_URL`, `APP_SECRET`, `DATABASE_URL`, `REDIS_URL`, `STORAGE_DRIVER=s3`, `S3_*` e **`UPLOAD_MAX_MB=4`** (a Vercel limita o corpo da requisição a 4,5 MB). Rode as migrações uma vez com `npx prisma migrate deploy` apontando para o banco.

Mesmo assim continua sendo necessário um servidor para o worker. Por isso a Opção A é mais simples e mais barata para o volume de um evento.
