# Multi-stage build for NestJS application

# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Configure npm registry
RUN npm config set registry https://registry.npmjs.org/

# Install dependencies (with retry) - include dev dependencies for build
RUN for i in 1 2 3 4 5; do \
      npm ci && break || \
      (echo "npm ci attempt $i failed, retrying in 10s..." && sleep 10); \
    done || (echo "npm ci failed after 5 attempts" && exit 1)

# Verify nest-cli is installed
RUN test -f node_modules/.bin/nest || (echo "nest-cli not found!" && npm list @nestjs/cli && exit 1)

# Copy source files
COPY . .

# Build the application - use npx to ensure nest is found
RUN npx nest build && test -f dist/main.js

# Stage 2: Production
FROM node:18-alpine
WORKDIR /app

# Install curl for health checks (with DNS retry)
RUN for i in 1 2 3 4 5; do \
      apk update && apk add --no-cache curl && break || \
      (echo "Attempt $i failed, retrying in 10s..." && sleep 10); \
    done

# Copy package files
COPY package*.json ./

# Configure npm registry
RUN npm config set registry https://registry.npmjs.org/

# Install all dependencies (NestJS needs all deps at runtime)
RUN for i in 1 2 3 4 5; do \
      npm ci && break || \
      (echo "npm ci attempt $i failed, retrying in 10s..." && sleep 10); \
    done || (echo "npm ci failed after 5 attempts" && exit 1)
RUN npm cache clean --force

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
	adduser -S nestjs -u 1001

# Copy built application with correct ownership (avoids chown later)
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
RUN test -f dist/main.js

# Verify @nestjs/core is available
RUN test -d node_modules/@nestjs/core || (echo "@nestjs/core not found in node_modules!" && npm list @nestjs/core && exit 1)

# Change ownership - only chown package.json (dist already has correct ownership from COPY --chown)
# node_modules can stay owned by root - files are readable by all users
RUN chown nestjs:nodejs /app/package*.json

# Switch to non-root user
USER nestjs

# Expose the application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
	CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "dist/main"]
