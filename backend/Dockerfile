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
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main"]
