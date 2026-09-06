# node:20-bookworm-slim (glibc) em vez de alpine — bcrypt usa binário nativo
# pré-compilado pra glibc; em alpine (musl) ele teria que compilar na hora,
# exigindo python3/make/g++ na imagem.

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
# ffmpeg: MediaStorageService usa o binário do sistema (child_process) pra
# converter áudio gravado no navegador (webm/opus) pra ogg/opus antes de
# mandar à Evolution API — o WhatsApp só aceita nota de voz nesse formato.
# "Acquire::Check-Valid-Until=false" só ignora o carimbo de validade do
# Release (útil quando o relógio do host de build está adiantado/atrasado
# em relação ao repositório Debian) — não desliga a checagem de assinatura.
RUN apt-get update -o Acquire::Check-Valid-Until=false \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main"]
