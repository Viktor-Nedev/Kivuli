# Single-stage on purpose.
#
# A multi-stage build would produce a smaller image, but it has to carry
# `data/` into the runtime layer by hand — both the bundled station CSV and the
# committed ERA5 rainfall snapshot the Season page falls back on. Getting that
# copy wrong yields a container that boots cleanly and then 503s on /api/today,
# which is the worst possible failure to discover during a demo. Image size is
# not judged; a provably correct container is.
FROM node:22-slim

WORKDIR /app

# Dependencies first, so a source-only change reuses this layer.
COPY package*.json ./
RUN npm ci

# Everything else, including data/ and the committed cache.
COPY . .

# Build the client into dist/, which server/index.ts serves.
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

# tsx is a runtime dependency, not a dev one, precisely so this works.
# Finishes the thought server/index.ts starts: it binds 0.0.0.0 specifically so
# a health check can reach it from outside the container's network namespace.
# /api/health is deliberately shallow — it must not fail because Open-Meteo is
# having a bad day, or the platform would restart a perfectly healthy process.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3   CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
