import { Telegraf, session } from 'telegraf';
import { BotContext } from '../types';
import { createScenes } from '../scenes';
import { setupCallbackHandlers } from '../handlers/callback.handler';
import { OpenAIService } from '../services/openai.service';
import { FluxService } from '../services/flux.service';
import { MongoDBService } from '../services/mongodb.service';
import { StorageService } from '../services/storage.service';
import { LogoVariantService } from '../services/logoVariant.service';
import { CompleteAssetGenerationService } from '../services/completeAssetGeneration.service';
import { userLoader } from '../middleware/userLoader';
import i18n, { i18nMiddleware } from '../middleware/i18n.middleware';
import { sceneSessionResetMiddleware, ensureSessionCleanup } from '../middleware/scene.middleware';
import { setupLanguageCommand } from '../commands/language';
import { startImageWorker } from '../utils/imageQueue';
import { config } from '../config/config';
import logger from '../utils/logger';
import { setupGracefulShutdown } from '../utils/gracefulShutdown';

// Import bot initialization logic from main index
// We'll extract the core bot setup here

let botInstance: Telegraf<BotContext> | null = null;
let RESOLVED_BOT_USERNAME: string = config.telegram.botUsername;

// Initialize services
const openaiService = new OpenAIService();
const fluxService = new FluxService();
const mongodbService = new MongoDBService();
const storageService = new StorageService();
const logoVariantService = new LogoVariantService(storageService, openaiService);
const completeAssetGenerationService = new CompleteAssetGenerationService(storageService, openaiService);

/**
 * Initialize and configure the Telegram bot
 */
export async function initializeBot(): Promise<Telegraf<BotContext>> {
  if (botInstance) {
    logger.info('Bot already initialized');
    return botInstance;
  }

  logger.info('🤖 Initializing Telegram bot...');

  // Validate bot token
  if (!config.telegram.botToken) {
    throw new Error('BOT_TOKEN is required but not found in environment variables');
  }

  // Initialize the bot
  const bot = new Telegraf<BotContext>(config.telegram.botToken);

  // Dynamically resolve bot username for Telegram sticker set naming
  try {
    const me = await bot.telegram.getMe();
    if (me?.username) {
      RESOLVED_BOT_USERNAME = me.username;
      logger.info(`✅ Resolved bot username: @${RESOLVED_BOT_USERNAME}`);
    } else {
      logger.warn('⚠️  Could not resolve bot username via getMe(); falling back to env BOT_USERNAME');
    }
  } catch (e) {
    logger.warn('⚠️  getMe() failed; using env BOT_USERNAME if set');
  }

  // Setup session middleware
  bot.use(session());

  // Add our session cleanup middleware before user loading
  bot.use(ensureSessionCleanup());
  bot.use(userLoader);

  // Add i18n middleware
  bot.use(i18n.middleware());
  bot.use(i18nMiddleware);

  // Setup scenes
  const stage = createScenes(openaiService, fluxService, mongodbService, storageService);

  // Create a wrapper that will add i18n to all scene contexts
  const wrappedStage = {
    middleware: () => (ctx: BotContext, next: any) => {
      // Ensure the ctx has i18n before passing to the scene middleware
      // @ts-ignore - Scene middleware context compatibility issue with i18n
      return stage.middleware()(ctx, next);
    }
  };

  // Apply stage middleware first, then the scene session reset middleware
  bot.use(wrappedStage.middleware());
  // Register scene reset middleware after stage is registered so ctx.scene exists
  bot.use(sceneSessionResetMiddleware());

  // Setup callback handlers
  setupCallbackHandlers(bot, openaiService, storageService, mongodbService);

  // Setup language command
  setupLanguageCommand(bot);

  // Error handling
  bot.catch((err, ctx) => {
    logger.error('❌ Bot error:', { error: err, update: ctx.update });
    ctx.reply('❌ An error occurred. Please try again later.').catch(e => {
      logger.error('Error sending error message:', e);
    });
  });

  botInstance = bot;
  logger.info('✅ Telegram bot initialized successfully');

  return bot;
}

/**
 * Start the bot (using polling)
 */
export async function startBot(): Promise<void> {
  const bot = await initializeBot();

  logger.info('🚀 Starting bot with polling...');

  try {
    // Start image worker if needed
    logger.info('🔄 Starting image generation worker...');
    startImageWorker();

    // Start bot polling
    await bot.launch({
      dropPendingUpdates: true,
      allowedUpdates: ['message', 'callback_query']
    });

    logger.info('✅ Bot is now running and ready to receive updates');

    // Setup graceful shutdown
    setupGracefulShutdown(bot);

  } catch (error) {
    logger.error('❌ Failed to start bot:', error);
    throw error;
  }
}

/**
 * Stop the bot gracefully
 */
export async function stopBot(): Promise<void> {
  if (!botInstance) {
    return;
  }

  logger.info('🛑 Stopping bot...');
  try {
    await botInstance.stop();
    botInstance = null;
    logger.info('✅ Bot stopped successfully');
  } catch (error) {
    logger.error('❌ Error stopping bot:', error);
    throw error;
  }
}

/**
 * Get the bot instance
 */
export function getBot(): Telegraf<BotContext> | null {
  return botInstance;
}

/**
 * Get resolved bot username
 */
export function getBotUsername(): string {
  return RESOLVED_BOT_USERNAME;
}

// Export services for use in scenes and handlers
export {
  openaiService,
  fluxService,
  mongodbService,
  storageService,
  logoVariantService,
  completeAssetGenerationService
};

