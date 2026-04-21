FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Build frontend
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy backend and built frontend
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/api ./api
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations

# Expose backend port
EXPOSE 3001

# Command to run migration and start backend
CMD ["sh", "-c", "npx tsx api/scripts/migrate.ts && npx tsx api/server.ts"]