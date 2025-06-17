# VerusDB Docker Image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Create app user for security
RUN addgroup -g 1001 -S verusdb && \
    adduser -S verusdb -u 1001

# Install dependencies for bcrypt compilation
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p /app/data /app/logs /app/backups && \
    chown -R verusdb:verusdb /app

# Set environment variables
ENV NODE_ENV=production \
    VERUSDB_PATH=/app/data/database.vdb \
    VERUSDB_LOG_DIR=/app/logs \
    VERUSDB_BACKUP_DIR=/app/backups \
    VERUSDB_ADMIN_HOST=0.0.0.0 \
    VERUSDB_ADMIN_PORT=4321

# Expose port
EXPOSE 4321

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "const http = require('http'); \
        http.get('http://localhost:4321/health', (res) => { \
            if (res.statusCode === 200) process.exit(0); \
            else process.exit(1); \
        }).on('error', () => process.exit(1));"

# Switch to non-root user
USER verusdb

# Start the application
CMD ["node", "index.js"]
