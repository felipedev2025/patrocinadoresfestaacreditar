# Patrocínios & Telão

Plataforma para **gestão de patrocinadores** e **geração automática de vídeos MP4** para telões de eventos — cadastro pelo celular, aprovação, biblioteca entre edições, renderização real no servidor (Remotion + FFmpeg) e player de telão com cache offline.

Primeira edição cadastrada: **9º Porto Feliz Fest Show** — 07 e 08/11/2026, CEMEX (Porto Feliz/SP), realização Associação Acreditar.

> Arquitetura, modelagem, API, permissões e roadmap: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)

## Stack

Next.js 15 · React 19 · TypeScript · Tailwind · PostgreSQL + Prisma · Redis + BullMQ · Remotion 4 · FFmpeg · sharp · S3/MinIO · Docker

## Rodando localmente

Pré-requisitos: Node 22, PostgreSQL 16, Redis 7, FFmpeg.

```bash
npm install
```

```bash
cp .env.example .env   # ajuste DATABASE_URL, APP_SECRET, ADMIN_EMAIL/ADMIN_PASSWORD
```

```bash
npx prisma migrate deploy && npm run db:seed && npm run db:seed:porto-feliz
```

Em dois terminais:

```bash
npm run dev
```

```bash
npm run worker
```

Acesse http://localhost:3000 e entre com `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

Na primeira renderização o Remotion baixa o Chrome Headless Shell automaticamente (ou use `REMOTION_BROWSER_EXECUTABLE` para apontar um já instalado).

## Colocar no ar (VPS com HTTPS automático)

Guia completo, incluindo a opção Vercel: [`docs/DEPLOY.md`](docs/DEPLOY.md). Resumo, numa VPS Ubuntu como root, com o DNS do domínio já apontado para ela:

```bash
git clone --branch claude/intelligent-babbage-0g9735 https://github.com/felipedev2025/patrocinadoresfestaacreditar.git /opt/patrocinios
```

```bash
cd /opt/patrocinios && bash deploy/install.sh
```

O script instala Docker, gera os segredos, sobe Caddy (HTTPS), site, worker, PostgreSQL e Redis, cria o evento Porto Feliz 2026 e agenda backup diário.

## Fluxo de uso

1. **Admin** cria a edição (ou duplica a do ano anterior) e ajusta identidade, categorias e telões em *Configurações*.
2. Cadastra **captadores** em *Usuários* e os vincula ao evento.
3. Captador, pelo celular: *Adicionar patrocinador* → nome → logotipo (galeria/câmera, remoção de fundo opcional) → categoria → prévia → salvar. Ou gera um **link de autoatendimento** e envia por WhatsApp.
4. **Organizador** aprova em *Patrocinadores*.
5. Em *Vídeos & Telão*: escolhe template + formato → **Gerar MP4** (fila, com barra de progresso) → baixar ou **Publicar no telão**.
6. No computador do telão: abrir o link do player (botão *Abrir telão*), tela cheia. Novos patrocinadores aprovados marcam os vídeos como **desatualizados** → *Regenerar* (o novo vídeo substitui o antigo no telão sozinho).
7. No ano seguinte: *Criar próxima edição* → os patrocinadores anteriores aparecem como sugestões para reconfirmação.

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` / `build` / `start` | App web |
| `npm run worker` | Worker de renderização |
| `npm test` | Testes (Vitest) |
| `npm run typecheck` | TypeScript |
| `npm run db:seed` | Organização, admin e templates |
| `npm run db:seed:porto-feliz` | Edição 9º Porto Feliz Fest Show 2026 |
| `npm run remotion:studio` | Remotion Studio para ajustar as composições |
| `npx tsx scripts/smoke-render.ts <dir-pngs> <saida.mp4>` | Render de teste sem banco |
