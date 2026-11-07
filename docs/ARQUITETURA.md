# Arquitetura — Plataforma de Patrocínios e Telão Inteligente

## 1. Visão geral

```
 Celular / Navegador                     Servidor (VPS / Docker)
┌──────────────────────┐   HTTPS   ┌──────────────────────────────────────────┐
│ Next.js (React, PWA) │──────────▶│  web  (Next.js 15 – páginas + API REST)  │
│  - painel / cadastro │           │   ├─ Auth (sessão em cookie httpOnly)     │
│  - prévia @remotion/ │           │   ├─ RBAC por evento                      │
│    player            │           │   ├─ Upload + sanitização (sharp/DOMPurify)│
│  - /telao/[slug]     │◀──vídeos──│   └─ Enfileira renders (BullMQ)           │
└──────────────────────┘ (URL assin.)          │                │
                                    PostgreSQL ◀┘        Redis ◀──┘
                                    (Prisma)         (fila, rate limit)
                                                          │
                                   ┌──────────────────────▼───────────────────┐
                                   │ worker (processo separado, N réplicas)    │
                                   │  Remotion (Chrome headless) → H.264       │
                                   │  FFmpeg: faststart + miniatura            │
                                   │  progresso → banco | retries | limpeza    │
                                   └──────────────────────┬───────────────────┘
                                                          ▼
                                   Storage S3-compatível (MinIO/AWS/R2) ou disco
                                   orgs/{org}/assets/{id}/original.*|processed.png
                                   orgs/{org}/events/{ev}/renders/{id}/video.mp4
```

Princípios:

- **Nenhuma renderização na requisição HTTP.** A API grava um *snapshot* (`inputProps`) e enfileira; o worker processa.
- **Mesma composição na prévia e no MP4.** `src/remotion/SponsorReel.tsx` é usada pelo `@remotion/player` no navegador e pelo `@remotion/renderer` no servidor.
- **Snapshot reprodutível + hash de conteúdo.** Cada render guarda as props usadas e um `contentHash`. Se o hash recalculado com os dados atuais for diferente, o vídeo está **desatualizado** (novo patrocinador aprovado, troca de logo, cor, template…). Não há flags manuais para manter em sincronia.
- **Multi-tenant desde o início** (`Organization`), pronto para SaaS.

## 2. Estrutura de pastas

```
prisma/
  schema.prisma              Modelo de dados
  migrations/                Migrações versionadas
  seed.ts                    Organização, admin, templates de sistema
  seed-porto-feliz-2026.ts   Edição real: 9º Porto Feliz Fest Show
src/
  app/
    (app)/                   Área autenticada (layout com cabeçalho)
      eventos/               Lista, novo evento, painel, patrocinadores, vídeos, configurações
      usuarios/              Gestão de usuários (admin geral)
    api/                     API REST (route handlers)
    enviar-logo/[slug]/[token]  Autoatendimento do patrocinador
    telao/[slug]             Player de telão (público com chave)
    login/
  components/                UI compartilhada (cards, uploader, prévia)
  lib/
    auth.ts rbac.ts http.ts  Sessão, permissões, erros/CSRF
    images.ts                Validação por magic bytes, SVG sanitize, remoção de fundo, trim
    storage/                 Drivers local (URL HMAC) e S3 (URL pré-assinada)
    queue.ts                 BullMQ
    render-input.ts          Snapshot das props + hash de conteúdo
    services/                Regras de negócio (eventos, patrocínios, assets, renders)
  remotion/                  Composições de vídeo (sem dependência de Next/Prisma)
    types.ts scenes.ts SponsorReel.tsx Root.tsx presets.ts
worker/                      Worker de renderização + manutenção
tests/                       Vitest (imagens, linha do tempo, segurança)
docs/                        Esta documentação
```

## 3. Modelagem do banco

| Tabela | Papel | Integridade / índices |
|---|---|---|
| `Organization` | Tenant (SaaS) | `slug` único |
| `User` | Pessoa com login; `role` global `SUPER_ADMIN`/`USER` | `email` único; idx `organizationId` |
| `Session` | Sessão opaca (hash SHA-256 do token) | `tokenHash` único; idx `expiresAt` (limpeza) |
| `Event` | Uma **edição** (Porto Feliz Fest Show 2026). `series` agrupa as edições | `slug` único; idx `(organizationId, series, year)` |
| `EventMember` | Papel por evento: `ORGANIZER`/`CAPTADOR`/`OPERATOR` | único `(eventId, userId)` |
| `SponsorCategory` | Regras de exibição por categoria (tempo, escala, aparições, animação, destaque, inclusão) | único `(eventId, name)`; idx `(eventId, sortOrder)` |
| `Company` | **Biblioteca permanente** de empresas | único `(organizationId, normalizedName)` – deduplicação |
| `Sponsorship` | Participação da empresa **em uma edição** (precisa ser confirmada a cada ano) | único `(eventId, companyId)`; idx `(eventId,status)`, `(eventId,createdById)`; `Company` com `onDelete: Restrict` |
| `MediaAsset` | Arquivo enviado: original (backup) + PNG processado; nunca sobrescrito → **versionamento** | idx `eventId`, `companyId` |
| `UploadLink` | Link de autoatendimento (hash do token, expiração, limite de usos, revogação) | `tokenHash` único |
| `VideoTemplate` | Biblioteca de templates (sistema ou da organização), `config` JSON | `key` único |
| `DisplayFormat` | Resolução real de cada telão/painel, FPS, margem de segurança | único `(eventId, name)` |
| `VideoRender` | Cada geração de vídeo: snapshot, hash, status, progresso, versão, publicação no telão | idx `(eventId,status)`, `(eventId,published,publishOrder)` |
| `AuditLog` | Quem fez o quê, quando, com dados antes/depois | idx `(eventId, createdAt)`, `(entity, entityId)` |
| `Sponsorship.eventOrder` | Ordem manual do evento (lista oficial / arrastar e soltar); `null` = fim, em A–Z | idx `(eventId, eventOrder)` |
| `ImportedList` | Lista oficial importada (CSV, XLSX, PDF ou foto), com o arquivo original no storage | idx `(eventId, createdAt)` |
| `SponsorSlot` | Linha da lista: ordem, nome como na lista, vendedor, valor da cota (`Decimal(12,2)`), forma de pgto, vínculo com o patrocínio, confiança do match, status `AWAITING_LOGO \| SUGGESTED \| LINKED \| IGNORED`, logo sugerido pendente | único `(listId, order)`; idx `(listId, status)`, `sponsorshipId`, `pendingAssetId` |
| `CompanyAlias` | Apelido aprendido "nome na lista → empresa", reaproveitado nas próximas edições | único `(organizationId, normalizedAlias)` |
| `MediaAsset.importedListId` | Logos enviados em lote para a lista ("Não identificadas" até serem encaixados) | idx `importedListId` |

Decisões:

- Excluir uma categoria **não** exclui patrocínios (`SetNull`). Excluir um patrocínio não exclui a empresa da biblioteca.
- `Company.logoAssetId` = último logotipo **aprovado**; é o que se reaproveita no ano seguinte.
- Assets enviados e nunca vinculados são apagados após 24h pela rotina de manutenção.
- Agregações do painel usam `GROUP BY` (`prisma.groupBy`) — não carregam linhas.

## 4. API REST

Todas as rotas mutáveis exigem sessão + verificação de `Origin` (CSRF) e passam pelo RBAC do evento.

| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| POST | `/api/auth/login` · `/api/auth/logout` | — | Sessão (rate limit por IP e e-mail) |
| GET/POST | `/api/events` | admin (POST) | Listar / criar edição (já com categorias e formatos padrão) |
| GET/PATCH | `/api/events/:id` | event.view / event.manage | Detalhes / identidade visual (`rotateScreenKey`) |
| POST | `/api/events/:id/duplicate` | admin | Nova edição a partir da anterior |
| POST | `/api/events/:id/assets` | event.manage | Logotipo/capa do evento |
| GET/POST | `/api/events/:id/categories` · PATCH/DELETE `/api/categories/:id` | event.manage | Categorias |
| POST | `/api/events/:id/formats` · DELETE `/api/formats/:id` | event.manage | Formatos de telão |
| GET/POST/DELETE | `/api/events/:id/members` | event.manage | Equipe do evento |
| POST | `/api/events/:id/logos` | sponsorship.create | Upload + processamento do logotipo (prévia) |
| GET/POST | `/api/events/:id/sponsorships` (`?format=csv`) | event.view / sponsorship.create | Lista com filtros, exportação, cadastro |
| PATCH/DELETE | `/api/sponsorships/:id` | review ou dono | approve / reject / archive / restore / edit |
| GET/POST | `/api/events/:id/library` (`?q=`, `?suggest=1`) | sponsorship.create | Biblioteca e reaproveitamento |
| GET/POST | `/api/events/:id/upload-links` · DELETE `/api/upload-links/:id` | uploadLink.create | Links de autoatendimento |
| POST | `/api/public/upload/:slug/:token/logo` · `/api/public/upload/:slug/:token` | token | Envio externo (sempre pendente) |
| GET/POST | `/api/events/:id/renders` | render.view / render.create | Lista com progresso e "desatualizado" / gerar |
| GET/PATCH | `/api/renders/:id` | render.* / screen.operate | publish, unpublish, reorder, regenerate, retry, cancel |
| GET | `/api/renders/:id/download` | render.view | Redireciona para URL assinada do MP4 |
| GET | `/api/telao/:slug?k=` | chave do telão | Playlist publicada |
| GET | `/api/files/*` | URL assinada | Entrega do driver local (com Range) |
| GET/POST/PATCH | `/api/users`, `/api/users/:id` | admin | Usuários |
| PUT | `/api/events/:id/sponsorships/order` | list.manage | Ordem manual completa (1 SELECT + 1 UPDATE em lote, 409 se a lista mudou) |
| GET | `/api/events/:id/sponsorships?sort=event` | event.view | Listagem na ordem do evento |
| POST | `/api/events/:id/renders/sort-playlist` | screen.operate | Playlist do telão na ordem do evento |
| POST | `/api/events/:id/lists/parse` | list.manage | Lê CSV/XLSX (direto) ou PDF/foto (IA) e devolve as linhas para revisão — **não grava** |
| GET/POST | `/api/events/:id/lists` | list.export / list.manage | Listas do evento / grava a lista revisada e cruza com os cadastrados |
| GET/DELETE | `/api/lists/:listId` | list.export / list.manage | Conferência (contadores, linhas, só no painel, não identificadas) / excluir |
| POST | `/api/lists/:listId/logos` | list.manage | Upload em lote (1 arquivo por requisição) com encaixe automático; `ocr=true` lê o nome no logo |
| POST | `/api/lists/:listId/approve-linked` | list.manage + review | Aprova os vinculados pendentes que têm logo |
| GET | `/api/lists/:listId/export` | list.export | Excel de conferência (.xlsx em streaming) |
| PATCH | `/api/slots/:slotId` | list.manage | confirm, reject, ignore, restore, link, unlink, attach, edit |

## 5. Perfis e permissões

| Permissão | Admin geral | Organizador | Captador | Operador |
|---|:-:|:-:|:-:|:-:|
| Ver evento | ✔ | ✔ | ✔ | ✔ |
| Configurar evento, categorias, telões, equipe | ✔ | ✔ (não promove organizadores) | | |
| Cadastrar patrocinador / gerar link | ✔ | ✔ | ✔ | |
| Ver patrocinadores de todos | ✔ | ✔ | só os seus | ✔ |
| Aprovar / rejeitar / arquivar / excluir | ✔ | ✔ | excluir os próprios pendentes | |
| Gerar vídeos | ✔ | ✔ | | |
| Publicar / ordenar telão | ✔ | ✔ | | ✔ |
| Criar eventos / usuários | ✔ | | | |
| Importar lista oficial, encaixar logos, reordenar | ✔ | ✔ | | |
| Exportar Excel de conferência | ✔ | ✔ | | ✔ |

Isolamento: toda consulta de evento filtra por `organizationId` **e** por vínculo `EventMember`; um usuário sem vínculo recebe 404 (não revela a existência do evento). Assets só podem ser anexados ao mesmo evento e, para captadores, apenas os enviados por eles mesmos (proteção contra IDOR).

## 6. Pipeline de vídeo

1. `POST /renders` → `buildReelProps()` monta props com **chaves do storage** + `contentHash` → `VideoRender(QUEUED)` → BullMQ (`jobId = renderId`, idempotente).
2. Worker: baixa os PNGs para um diretório temporário, sobe um servidor HTTP efêmero em `127.0.0.1`, chama `selectComposition` + `renderMedia` (H.264, `yuv420p`, sem áudio, CRF ou bitrate), atualiza progresso a cada 1,5 s.
3. FFmpeg: `-movflags +faststart` (reprodução progressiva) e miniatura JPG.
4. Upload do MP4 e miniatura; `COMPLETED`. Se for regeneração de um vídeo que estava no telão, o novo assume a posição do antigo automaticamente.
5. Falhas: 3 tentativas com backoff exponencial; na última, `FAILED` com a mensagem. Botão "Tentar novamente".

Layout responsivo ao painel: tudo é calculado a partir de `width × height` e da margem de segurança; logotipos ficam dentro de caixas com `object-fit: contain` (nunca cortados ou deformados); em ultrawide o logotipo é limitado pela altura; a grade escolhe colunas × linhas que maximizam a célula.

## 6.1 Lista oficial e match de nomes

1. **Leitura** (`/lists/parse`): tipo detectado por magic bytes. CSV (UTF-8 ou Windows-1252, `;`/`,`/tab) e XLSX (exceljs, valor calculado das fórmulas) são lidos direto. PDF e foto vão ao Claude (`claude-opus-5-5`, visão, *structured outputs* com schema zod, revalidado no servidor). Nada é gravado nesta etapa.
2. **Revisão obrigatória** na tela (o manuscrito pode ser lido errado) → `/lists` grava a lista e os slots.
3. **Match** (`src/lib/matching.ts`, em memória): normalização (minúsculas, sem acento, sem extensão, sem `-_.&/`, sem ltda/me/s.a./logo…) e o maior entre três sinais:
   - nome inteiro sem espaços: Levenshtein e trigramas (Dice);
   - alinhamento palavra a palavra × cobertura (nome parcial nunca passa de 0,84);
   - todas as palavras do nome curto contidas no longo (0,82 → sempre pede confirmação).
   Decisão: **≥ 0,85 e 0,10 acima do 2º → vincula**; **0,60–0,85 ou empate → sugere**; **< 0,60 → não identificada**. A atribuição é gulosa pelos maiores scores, sem repetir patrocinador. Os candidatos incluem os nomes da empresa e os apelidos aprendidos.
4. **Encaixe do logo**: atualiza o patrocínio vinculado ou cria um novo (**PENDENTE**, ordem = linha da lista) e grava o apelido. Desvincular apaga o apelido daquele par.
5. **Conferência**: "X de N com logo", o que falta, sugeridos, "só no painel" e "Não identificadas" (arrastar até a linha ou menu "Encaixar em…").

## 7. Segurança

- Senhas bcrypt (custo 12); sessão opaca com hash no banco; cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção; logout/desativação/troca de senha encerram sessões.
- CSRF: verificação de `Origin` em todas as mutações.
- Rate limit (Redis) em login, uploads, links públicos e telão; honeypot no formulário público.
- Upload: tipo detectado por **magic bytes**; limite de tamanho; limite de pixels (anti "decompression bomb"); reprocessamento por `sharp` (remove metadados/EXIF); SVG sanitizado com DOMPurify (sem script, handlers, `foreignObject`, referências externas, DOCTYPE/ENTITY) e rasterizado; arquivos servidos com `nosniff` e CSP `sandbox`.
- URLs de arquivos sempre temporárias e assinadas (HMAC ou pré-assinadas S3).
- Links públicos: token de 192 bits, armazenado como hash, expiração, limite de uso com reserva atômica, revogação; materiais externos **sempre** pendentes.
- CSV exportado com neutralização de fórmulas (CSV injection).
- Auditoria de todas as alterações (antes/depois).
- Lista oficial: o evento é sempre resolvido no servidor a partir da lista/linha (nunca vem do cliente); upload em lote reaproveita o pipeline de imagem (magic bytes, sharp, EXIF removido, nome gerado no servidor — o nome original só serve de texto para o match); IA com rate limit (10/h por usuário, 30/dia por evento, 60/h para leitura de logos), chave só no servidor, conteúdo dos arquivos nunca registrado em log, texto da IA tratado como dado (React escapa; nada de `dangerouslySetInnerHTML`); Excel com textos que começam com `= + - @` prefixados.

## 8. Plano de implementação

| Etapa | Escopo | Estado |
|---|---|---|
| **1 – MVP** | Auth, eventos, categorias, cadastro mobile, upload/tratamento de logotipo, aprovação, vídeo coletivo MP4 1920×1080 no servidor | ✅ entregue |
| **2 – Formatos e vídeos** | 4K, vertical, quadrado, ultrawide, painéis personalizados; vídeo individual e por categoria; regeneração com 1 clique; download | ✅ entregue |
| **3 – Telão** | Player tela cheia, loop, playlist ordenável, cache local (Cache Storage), atualização sem interromper, contingência com arquivos locais | ✅ entregue |
| **4 – Captação** | Links de autoatendimento, biblioteca entre edições, duplicação de edição, indicadores por captador, CSV | ✅ entregue |
| 5 – Editor de templates | Editor visual dos campos de `VideoTemplate.config` (fontes, cores, tempos, transições, áreas) com prévia ao vivo; templates por organização | próximo |
| 6 – Avançado | Recorte manual no celular, remoção de fundo por IA (modelo local tipo rembg/U²-Net), imagens estáticas (PNG) e pacote ZIP, playlist M3U, SSO/2FA, Sentry/Prometheus, múltiplos workers por GPU | backlog |

## 9. Operação

- Escala horizontal: suba mais réplicas de `worker` (cada uma respeita `RENDER_CONCURRENCY`). Web é stateless.
- Recursos: um vídeo coletivo Full HD de ~2 min leva alguns minutos em 4 vCPUs. Ajuste `RENDER_FRAME_CONCURRENCY` e limite CPU/memória do container worker.
- Backup: `pg_dump` diário + versionamento do bucket (habilitado no `minio-init`). Originais dos logotipos nunca são sobrescritos.
- Logs: web e worker escrevem em stdout (coletáveis por Docker/Loki); worker registra carga, memória e duração de cada render.

## 10. Licenciamento do Remotion

O Remotion é gratuito para pessoas físicas, organizações sem fins lucrativos e empresas com até 3 funcionários. **Para uso comercial como SaaS por empresa maior é necessária a licença "Company License"** (remotion.dev/license). A Associação Acreditar, como entidade sem fins lucrativos, se enquadra no uso gratuito; ao comercializar a plataforma, a licença deve ser adquirida.
