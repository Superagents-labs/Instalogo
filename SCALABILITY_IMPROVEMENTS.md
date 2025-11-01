# Scalability Improvements for Instalogo

This document outlines the scalability improvements made to the Instalogo project, following the architecture patterns from `chartguru/server`.

## Overview

The Instalogo bot has been refactored to support scalable production deployments with improved monitoring, error handling, and resource management.

## Key Improvements

### 1. **Centralized Configuration** (`src/config/config.ts`)
- All environment variables and settings consolidated in one place
- Type-safe configuration with proper defaults
- Easy to extend for new features

### 2. **Enhanced Database Connection** (`src/utils/dbConnect.ts`)
- **Connection Pooling**: Configurable min/max pool sizes for better resource management
- **Health Checks**: Built-in database health monitoring
- **Connection Status Tracking**: Real-time connection state monitoring
- **Graceful Reconnection**: Automatic reconnection handling
- Environment variables:
  - `MONGO_MAX_POOL_SIZE` (default: 20)
  - `MONGO_MIN_POOL_SIZE` (default: 5)
  - `MONGO_SERVER_SELECTION_TIMEOUT_MS` (default: 10000)
  - `MONGO_SOCKET_TIMEOUT_MS` (default: 45000)

### 3. **Professional Logging** (`src/utils/logger.ts`)
- **Winston Logger**: Industry-standard logging solution
- **Daily Rotation**: Logs automatically rotated daily with compression
- **Multiple Log Files**:
  - `application-*.log`: All application logs
  - `error-*.log`: Error logs only (kept for 30 days)
  - `bot-*.log`: Bot-specific logs
- **Environment-Aware**: Different log levels for development vs production
- **Structured Logging**: JSON format for easy parsing and analysis

### 4. **Graceful Shutdown** (`src/utils/gracefulShutdown.ts`)
- Handles SIGTERM and SIGINT signals
- Proper cleanup of database connections
- Graceful bot shutdown
- Error handling for uncaught exceptions and unhandled rejections
- Ensures no data loss during deployment or restarts

### 5. **Health Check Endpoints** (`src/api/server.ts`)
- `/healthz`: Liveness probe (basic alive check)
- `/readyz`: Readiness probe (checks database health)
- `/health`: Detailed health status with database information
- Essential for Kubernetes/Docker deployments and monitoring systems

### 6. **Rate Limiting** (`src/api/server.ts`)
- Express rate limiting middleware
- Configurable limits (1000 requests/15min in dev, 100 in production)
- Prevents abuse and ensures fair resource usage

### 7. **Security Enhancements**
- **Helmet**: Security headers for HTTP responses
- **CORS**: Configurable cross-origin resource sharing
- **Rate Limiting**: Protection against DDoS and abuse

## Architecture Changes

### Before
```
src/
├── index.ts (monolithic file with all logic)
├── db/
│   └── mongoose.ts (simple connection)
└── ... (other files)
```

### After
```
src/
├── index.ts (main entry point with startup logic)
├── config/
│   └── config.ts (centralized configuration)
├── utils/
│   ├── logger.ts (Winston logging)
│   ├── dbConnect.ts (enhanced DB connection)
│   └── gracefulShutdown.ts (shutdown handling)
├── api/
│   └── server.ts (HTTP server for health checks)
├── bot/
│   └── bot.ts (bot initialization - optional future refactor)
└── ... (other files)
```

## New Dependencies

Added to `package.json`:
- `winston`: Logging library
- `winston-daily-rotate-file`: Daily log rotation
- `express-rate-limit`: Rate limiting middleware
- `helmet`: Security headers
- `cors`: CORS middleware
- `@types/cors`: TypeScript types for CORS

## Environment Variables

### New Variables (Optional but Recommended)

```bash
# MongoDB Connection Pooling
MONGO_MAX_POOL_SIZE=20
MONGO_MIN_POOL_SIZE=5
MONGO_SERVER_SELECTION_TIMEOUT_MS=10000
MONGO_SOCKET_TIMEOUT_MS=45000

# Server Configuration
PORT=3000
NODE_ENV=production  # or development

# Logging
LOG_LEVEL=info  # error, warn, info, debug
```

## Deployment Considerations

### Production Checklist
1. ✅ Set `NODE_ENV=production` for optimized logging
2. ✅ Configure MongoDB connection pooling based on expected load
3. ✅ Monitor log files in `logs/` directory
4. ✅ Set up health check monitoring (use `/healthz` and `/readyz`)
5. ✅ Configure rate limits based on your needs
6. ✅ Use process manager (PM2, systemd, etc.) with graceful shutdown

### Scaling Tips
- **Horizontal Scaling**: Multiple bot instances can run with polling (each gets different updates)
- **Connection Pooling**: Adjust `MONGO_MAX_POOL_SIZE` based on number of instances
- **Log Rotation**: Logs auto-rotate daily, monitor disk space
- **Health Checks**: Use `/readyz` for Kubernetes readiness probes

## Monitoring

### Health Endpoints
```bash
# Basic health check
curl http://localhost:3000/healthz

# Readiness check (includes DB)
curl http://localhost:3000/readyz

# Detailed health status
curl http://localhost:3000/health
```

### Log Files
```bash
# View today's application logs
tail -f logs/application-$(date +%Y-%m-%d).log

# View today's error logs
tail -f logs/error-$(date +%Y-%m-%d).log

# View today's bot logs
tail -f logs/bot-$(date +%Y-%m-%d).log
```

## Migration Notes

### Backward Compatibility
- Old `db/mongoose.ts` still works (re-exports from new utils)
- All existing code continues to work
- No breaking changes to existing handlers or scenes

### Next Steps (Optional Future Improvements)
1. Extract bot handlers to separate files for better organization
2. Add request/response logging middleware
3. Implement metrics collection (Prometheus, etc.)
4. Add distributed tracing for debugging
5. Set up automated log aggregation (ELK stack, etc.)

## References

This architecture follows patterns from:
- `chartguru/server`: Reference implementation for scalable Node.js backend
- Best practices for production Node.js applications
- Telegram bot development best practices

