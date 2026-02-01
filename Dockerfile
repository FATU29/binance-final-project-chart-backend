# Multi-stage build for NestJS application

# Stage 1: Build
FROM node:18-alpine AS builder

# Install curl for network debugging and apk update
# Note: DNS is automatically handled by Docker, no need to modify /etc/resolv.conf
RUN apk update && apk add --no-cache curl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Configure npm for better network handling
RUN npm config set registry https://registry.npmjs.org/ && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5 && \
    npm config set fetch-timeout 300000

# Install all dependencies (including dev dependencies for build) with retries
RUN npm ci --prefer-offline || npm ci --prefer-offline || npm ci

# Copy all source files and configs (dockerignore will handle exclusions)
COPY . .

# Build the application with network retries
RUN npx nest build || npx nest build || npx nest build

# Stage 2: Production
FROM node:18-alpine

# Note: DNS is automatically handled by Docker, no need to modify /etc/resolv.conf
WORKDIR /app

# Install curl for health checks with apk update
RUN apk update && apk add --no-cache curl

# Copy package files
COPY package*.json ./

# Configure npm for production
RUN npm config set registry https://registry.npmjs.org/ && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5

# Install only production dependencies with retries
RUN npm ci --only=production --prefer-offline || npm ci --only=production --prefer-offline || npm ci --only=production
RUN npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
	adduser -S nestjs -u 1001

# Change ownership of the app directory
RUN chown -R nestjs:nodejs /app

# Switch to non-root user
USER nestjs

# Expose the application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
	CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "dist/main"]
