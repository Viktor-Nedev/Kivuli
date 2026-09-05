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
CMD ["npm", "start"]
