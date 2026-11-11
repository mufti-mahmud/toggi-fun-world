FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build \
 && mkdir -p /app/seed-data \
 && cp -r /app/data/. /app/seed-data/

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# A persistent volume mounted at /app/data hides the bundled data, so seed it on first start only.
CMD ["sh", "-c", "mkdir -p /app/data && if [ ! -f /app/data/tfw.db ]; then cp -r /app/seed-data/. /app/data/; fi && exec node server.mjs"]
