import logger from './logger';
import { disconnectDB } from './dbConnect';

// Track shutdown state
let shuttingDown = false;

/**
 * Graceful shutdown handler
 */
export async function gracefulShutdown(signal: string, bot?: any): Promise<void> {
  if (shuttingDown) {
    logger.warn('⚠️  Shutdown already in progress, forcing exit...');
    process.exit(1);
    return;
  }

  shuttingDown = true;
  logger.info(`🛑 ${signal} received, shutting down gracefully...`);

  try {
    // Stop the bot gracefully
    if (bot && typeof bot.stop === 'function') {
      logger.info('🤖 Stopping Telegram bot...');
      try {
        await bot.stop(signal);
        logger.info('✅ Telegram bot stopped');
      } catch (error) {
        logger.error('❌ Error stopping bot:', error);
      }
    }

    // Close database connections
    logger.info('🗄️  Disconnecting from MongoDB...');
    await disconnectDB();

    // Give a small delay for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));

    logger.info('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
}

/**
 * Setup graceful shutdown handlers
 */
export function setupGracefulShutdown(bot?: any): void {
  // Handle SIGTERM (used by process managers like PM2)
  process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM', bot);
  });

  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT', bot);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('❌ Uncaught Exception:', error);
    void gracefulShutdown('UNCAUGHT_EXCEPTION', bot);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    void gracefulShutdown('UNHANDLED_REJECTION', bot);
  });

  logger.info('🛡️  Graceful shutdown handlers registered');
}

