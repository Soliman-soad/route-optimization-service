# ---- Builder stage ----
FROM node:20-slim AS builder

WORKDIR /app

# Install Python + pip for OR-Tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests
COPY package*.json ./
COPY requirements.txt ./

# Install Node deps
RUN npm ci --ignore-scripts

# Install Python OR-Tools
RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Generate Prisma client
COPY prisma/ ./prisma/
RUN npx prisma generate --schema=./prisma/schema.prisma

# Build TypeScript
RUN npm run build

# ---- Runtime stage ----
FROM node:20-slim

WORKDIR /app

# Install Python runtime (needed for OR-Tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Copy Python venv from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy built app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy Prisma schema and generated client
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy Python solver script (runtime needs it)
COPY src/solver/vrp_solver.py ./dist/solver/vrp_solver.py

# Copy migration entrypoint
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
