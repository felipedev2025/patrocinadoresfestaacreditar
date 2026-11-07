# Imagem única para o app web e o worker de renderização (comandos diferentes no compose).
FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
# FFmpeg, fontes e bibliotecas exigidas pelo Chrome Headless Shell usado pelo Remotion
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg ca-certificates openssl fonts-liberation fonts-dejavu-core fonts-noto-color-emoji \
      libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libgbm1 libasound2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
RUN npx prisma generate && npx next build && npx remotion browser ensure

FROM base AS runner
ENV NODE_ENV=production
RUN groupadd -r app && useradd -r -g app -m app
COPY --from=build --chown=app:app /app /app
# Diretório do volume de arquivos (logotipos e vídeos) pertencente ao usuário sem privilégios
RUN mkdir -p /app/storage && chown app:app /app/storage
# Chrome baixado pelo "remotion browser ensure" fica em node_modules/.remotion
USER app
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
