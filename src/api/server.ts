import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { checkDBHealth } from '../utils/dbConnect';
import logger from '../utils/logger';
import { config } from '../config/config';
import { Telegraf } from 'telegraf';

// Create Express server
const app = express();
let httpServer: http.Server | null = null;

// Trust proxy for reverse proxies
app.set('trust proxy', 1);

// Configure CORS
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (no origin) and configured origins
    if (!origin || config.server.environment === 'development') {
      return callback(null, true);
    }
    // In production, add your allowed origins here
    return callback(null, true);
  },
  credentials: true
};

// Configure middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors(corsOptions));
app.use(helmet());

// Rate limiting
const isDevelopment = config.server.environment === 'development';
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 1000 : 100, // More lenient in development
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    message: `Rate limit exceeded. Please try again in ${Math.ceil(15)} minutes.`,
    retryAfter: 15 * 60
  }
});
app.use(limiter);

// Root-level health endpoints for platform probes
app.get('/healthz', (req, res) => {
  logger.info('💓 Liveness probe - Application is alive');
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

app.get('/readyz', async (req, res) => {
  try {
    const dbHealth = await checkDBHealth();
    if (dbHealth.healthy) {
      return res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
    }
    return res.status(503).json({ status: 'not_ready', reason: 'db_unhealthy', timestamp: new Date().toISOString() });
  } catch (e) {
    return res.status(503).json({ status: 'not_ready', reason: 'check_failed', timestamp: new Date().toISOString() });
  }
});

// Health endpoint with detailed information
app.get('/health', async (req, res) => {
  try {
    const dbHealth = await checkDBHealth();
    return res.status(dbHealth.healthy ? 200 : 503).json({
      status: dbHealth.healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      database: dbHealth,
      environment: config.server.environment
    });
  } catch (e) {
    return res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
});

// Webhook endpoint for Telegram (if using webhooks)
export function setupWebhook(bot: Telegraf, webhookPath: string = '/webhook'): void {
  app.post(webhookPath, async (req, res) => {
    try {
      await bot.handleUpdate(req.body);
      res.status(200).send('OK');
    } catch (error) {
      logger.error('Webhook error:', error);
      res.status(500).send('Internal Server Error');
    }
  });
  logger.info(`📡 Webhook endpoint set up at ${webhookPath}`);
}

export function startServer(): http.Server {
  const port = config.server.port;
  httpServer = app.listen(port, () => {
    logger.info(`🌐 HTTP Server started successfully`);
    logger.info(`📍 Server running on port ${port}`);
    logger.info(`📊 Environment: ${config.server.environment}`);
  });
  return httpServer;
}

export async function stopServer(): Promise<void> {
  if (!httpServer) return;
  await new Promise<void>((resolve, reject) => {
    httpServer?.close((err?: Error) => {
      if (err) return reject(err);
      resolve();
    });
  });
  httpServer = null;
  logger.info('🛑 HTTP Server closed');
}

export { app };

