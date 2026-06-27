# =============================================================================
# Fleet Logger — Production Container
# =============================================================================
# Runs BOTH the Node.js Express backend AND the Python speech sidecar in one
# image. The Node entrypoint supervises the sidecar via deploy/entrypoint.sh
# so a sidecar crash doesn't take down the web server (and vice versa).
#
# Why one image?
#   Render's free tier gives one web service per repo. A single container that
#   hosts both workers is the cleanest fit while keeping the architecture
#   identical to local dev (port $PORT + port 5050, sidecar never exposed).
#
# Build locally (sanity check before deploying):
#     docker build -t fleet-logger .
# Run:
#     docker run --rm -p 3000:3000 \
#         -e NVIDIA_API_KEY=... \
#         -e TTS_FUNCTION_ID=... \
#         -e ASR_FUNCTION_ID=... \
#         fleet-logger
# =============================================================================

# ---------- Stage 1: Install JS deps + build the React/Express bundle ----------
FROM node:20-alpine AS build
WORKDIR /app

# Skip optional native builds (avoid expensive cmake/electron fetches)
COPY package.json package-lock.json* ./
RUN npm ci --omit=optional || npm install --omit=optional

# Build the frontend bundle (Vite) + server bundle (esbuild)
COPY . .
RUN npm run build

# ---------- Stage 2: Production runtime ----------
FROM node:20-alpine AS runtime

# Python is needed for the sidecar (Riva client + gRPC stack). Bookworm-style
# glibc wheels via the python:3.11-slim image would also work; Alpine is
# chosen because the base node:20-alpine already keeps the image small.
RUN apk add --no-cache \
        python3 python3-dev py3-pip python3-venv \
        libstdc++ libffi-dev openssl-dev build-base \
 && python3 --version \
 && pip3 --version

# Keep Python quiet in containers
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    PORT=3000

WORKDIR /app

# Production-only Node deps (skip Capacitor CLI scaffolding for the APK)
COPY --from=build /app/package.json /app/package-lock.json* ./
RUN npm ci --omit=dev --omit=optional || npm install --omit=dev --omit=optional

# Frontend bundle + Express server bundle (built earlier)
COPY --from=build /app/dist ./dist

# Source required at runtime by tsx watcher fallback (kept harmless if unused)
COPY --from=build /app/server.ts ./
COPY --from=build /app/.env.example ./.env.example
COPY --from=build /app/src ./src
COPY --from=build /app/vite.config.ts ./
COPY --from=build /app/tsconfig.json ./

# Python sidecar + pinned dependencies
COPY sidecar ./sidecar
RUN pip3 install --no-cache-dir -r sidecar/requirements.txt

# Init script that supervises the sidecar from the Node process. If the
# sidecar dies, it restarts up to N times. If Node dies, the container exits
# so Render detects a crash and rolls back / re-deploys.
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Render expects port 3000 for web services by convention. The Express server
# honors $PORT so this works without any code change.
EXPOSE 3000

# Health-check makes Render detect a stuck container and redeploy sooner.
HEALTHCHECK --interval=20s --timeout=5s --retries=3 --start-period=30s \
    CMD wget -q -O- http://127.0.0.1:3000/api/health >/dev/null || exit 1

# Run as the built-in 'node' user (safer container posture).
USER node
WORKDIR /app

CMD ["/usr/local/bin/entrypoint.sh"]
