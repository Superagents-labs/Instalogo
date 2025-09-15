import express, { Request, Response } from 'express';
import { Telegraf } from 'telegraf';
import { BotContext } from './types';

/**
 * Webhook server setup for production deployment
 * Provides HTTP endpoints for Telegram webhook and health checks
 */
export class WebhookServer {
  private app: express.Application;
  private bot: Telegraf<BotContext>;
  private port: number;

  constructor(bot: Telegraf<BotContext>, port: number = 3000) {
    this.app = express();
    this.bot = bot;
    this.port = port;
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Parse JSON bodies
    this.app.use(express.json({ limit: '50mb' }));
    
    // Basic security headers
    this.app.use((req, res, next) => {
      res.header('X-Powered-By', 'Instalogo-Bot');
      next();
    });
  }

  private setupRoutes(): void {
    // Root health check
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        service: 'Instalogo Bot',
        version: '1.0.0',
        mode: 'webhook',
        timestamp: new Date().toISOString()
      });
    });

    // Detailed health check
    this.app.get('/health', async (req: Request, res: Response) => {
      try {
        // Test bot connection
        const botInfo = await this.bot.telegram.getMe();
        
        res.json({
          status: 'healthy',
          bot: {
            username: botInfo.username,
            id: botInfo.id,
            first_name: botInfo.first_name
          },
          server: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString()
          }
        });
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Webhook endpoint - secured with bot token in path
    this.app.post(`/webhook/${process.env.BOT_TOKEN}`, (req: Request, res: Response) => {
      try {
        // Let Telegraf handle the update
        this.bot.handleUpdate(req.body, res);
      } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Catch-all route for invalid requests
    this.app.all('*', (req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not found',
        path: req.path,
        method: req.method
      });
    });
  }

  /**
   * Set webhook URL with Telegram
   */
  public async setWebhook(webhookUrl: string): Promise<void> {
    try {
      const webhookInfo = await this.bot.telegram.getWebhookInfo();
      
      if (webhookInfo.url === webhookUrl) {
        console.log(`✅ Webhook already set to: ${webhookUrl}`);
        return;
      }

      await this.bot.telegram.setWebhook(webhookUrl);
      console.log(`✅ Webhook set successfully: ${webhookUrl}`);
      
      // Verify webhook was set
      const verifyInfo = await this.bot.telegram.getWebhookInfo();
      console.log(`📊 Webhook verification:`, {
        url: verifyInfo.url,
        has_custom_certificate: verifyInfo.has_custom_certificate,
        pending_update_count: verifyInfo.pending_update_count,
        max_connections: verifyInfo.max_connections
      });
      
    } catch (error) {
      console.error('❌ Failed to set webhook:', error);
      throw error;
    }
  }

  /**
   * Remove webhook (fallback to polling)
   */
  public async removeWebhook(): Promise<void> {
    try {
      await this.bot.telegram.deleteWebhook({ drop_pending_updates: true });
      console.log('✅ Webhook removed successfully');
    } catch (error) {
      console.error('❌ Failed to remove webhook:', error);
      throw error;
    }
  }

  /**
   * Start the Express server
   */
  public async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const server = this.app.listen(this.port, () => {
          console.log(`🚀 Webhook server running on port ${this.port}`);
          console.log(`📡 Health check: http://localhost:${this.port}/health`);
          resolve();
        });

        // Graceful shutdown
        const gracefulShutdown = () => {
          console.log('🔄 Shutting down webhook server...');
          server.close(() => {
            console.log('✅ Webhook server stopped');
            process.exit(0);
          });
        };

        process.once('SIGINT', gracefulShutdown);
        process.once('SIGTERM', gracefulShutdown);
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get Express app instance (for testing)
   */
  public getApp(): express.Application {
    return this.app;
  }
}

/**
 * Factory function to create and configure webhook server
 */
export function createWebhookServer(bot: Telegraf<BotContext>): WebhookServer {
  const port = parseInt(process.env.PORT || '3000', 10);
  return new WebhookServer(bot, port);
}
