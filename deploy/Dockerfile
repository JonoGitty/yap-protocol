FROM node:22-alpine

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json tsconfig.json ./
COPY packages/tree/package.json packages/tree/
COPY packages/sdk/package.json packages/sdk/
COPY packages/notify/package.json packages/notify/

# Install deps
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy source
COPY packages/tree/ packages/tree/
COPY packages/sdk/ packages/sdk/
COPY packages/notify/ packages/notify/

# Install tsx globally for running TypeScript
RUN npm install -g tsx

# Non-root user
RUN adduser -D -u 1001 yaptree
RUN mkdir -p /data && chown yaptree:yaptree /data
USER yaptree

EXPOSE 8789

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:8789/health || exit 1

CMD ["tsx", "packages/tree/src/server.ts"]
