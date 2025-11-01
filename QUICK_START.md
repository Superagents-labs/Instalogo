# Quick Start Guide - Scalability Improvements

## Installation

After pulling these changes, install the new dependencies:

```bash
npm install
```

This will install:
- `winston` & `winston-daily-rotate-file` - For professional logging
- `cors` & `@types/cors` - For CORS middleware
- `helmet` - For security headers
- `express-rate-limit` - For rate limiting

## New Files Created

1. **`src/config/config.ts`** - Centralized configuration
2. **`src/utils/logger.ts`** - Winston logger with daily rotation
3. **`src/utils/dbConnect.ts`** - Enhanced database connection with pooling
4. **`src/utils/gracefulShutdown.ts`** - Graceful shutdown handling
5. **`src/api/server.ts`** - HTTP server with health checks

## Environment Variables (New/Optional)

Add these to your `.env` file for optimal configuration:

```bash
# MongoDB Connection Pooling (Recommended for production)
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

## Testing

1. Build the project:
```bash
npm run build
```

2. Start the bot:
```bash
npm start
```

3. Check health endpoints (in another terminal):
```bash
# Health check
curl http://localhost:3000/healthz

# Readiness check
curl http://localhost:3000/readyz

# Detailed health
curl http://localhost:3000/health
```

## What Changed

- ✅ All `console.log` replaced with proper logger
- ✅ Database connection now uses connection pooling
- ✅ Graceful shutdown implemented
- ✅ Health check endpoints added
- ✅ Rate limiting added (for HTTP endpoints)
- ✅ Security headers added
- ✅ Logging to files with daily rotation

## Log Files

Logs are now written to the `logs/` directory:
- `application-YYYY-MM-DD.log` - All application logs
- `error-YYYY-MM-DD.log` - Error logs only
- `bot-YYYY-MM-DD.log` - Bot-specific logs

## Backward Compatibility

✅ All existing code continues to work
✅ No breaking changes to handlers or scenes
✅ Old `db/mongoose.ts` still works (re-exports from new utils)

## Next Steps

See `SCALABILITY_IMPROVEMENTS.md` for detailed documentation.

