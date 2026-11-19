# Deposit Kit: the built web app plus the timestamp endpoint, in one small Node process.
# Build:  docker build -t deposit-kit .
# Run:    docker run -p 8080:8080 -e TRUST_PROXY=1 deposit-kit

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
# Node 22.18+ runs the TypeScript server directly (type stripping), so no build step for it.
WORKDIR /app
ENV NODE_ENV=production PORT=8080 STATIC_DIR=/app/dist
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/src/lib/tsp.ts ./src/lib/tsp.ts
COPY --from=build /app/package.json ./package.json
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "server/node.ts"]
