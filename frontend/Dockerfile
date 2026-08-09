# NEXT_PUBLIC_* são embutidos no bundle em build-time (o browser do cliente
# é quem os lê, não o container) — por isso entram como ARG aqui, não só
# como env do serviço no docker-compose.

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_EVOLUTION_INSTANCE
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    NEXT_PUBLIC_EVOLUTION_INSTANCE=$NEXT_PUBLIC_EVOLUTION_INSTANCE

RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./next.config.js
EXPOSE 3001
CMD ["npm", "run", "start"]
