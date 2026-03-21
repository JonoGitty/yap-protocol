FROM node:22-alpine

WORKDIR /app

# Copy only what the tree needs
COPY packages/tree/ packages/tree/
COPY packages/sdk/ packages/sdk/
COPY package.json package-lock.json tsconfig.json ./

# Install deps
RUN npm ci --omit=dev

# Install tsx for running TypeScript directly
RUN npm install -g tsx

# Non-root user for security
RUN adduser -D -u 1001 yaptree
USER yaptree

# Tree listens on 8789, registration API on 8790
EXPOSE 8789 8790

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:8790/info || exit 1

CMD ["tsx", "packages/tree/src/server.ts"]
