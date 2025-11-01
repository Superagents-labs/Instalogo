import dotenv from 'dotenv';
import path from 'path';
import { connectDB, checkDBHealth } from './utils/dbConnect';
import axios from 'axios';
import { User } from './models/User';
import express from 'express';
import logger from './utils/logger';
import { config } from './config/config';
import { setupGracefulShutdown } from './utils/gracefulShutdown';
import { startServer, stopServer } from './api/server';

// Load environment variables first
dotenv.config();

// Disable noisy console logs in production (keep errors)
if (process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  console.log = () => {};
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  console.info = () => {};
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  console.debug = () => {};
}

import { Telegraf, session, Markup, Scenes } from 'telegraf';
import { BotContext } from './types';
import { createScenes } from './scenes';
import { setupCallbackHandlers } from './handlers/callback.handler';
import { OpenAIService } from './services/openai.service';
import { FluxService } from './services/flux.service';
import { MongoDBService } from './services/mongodb.service';
import { StorageService } from './services/storage.service';
// FluxService removed - using OpenAI gpt-image-1 instead

import { LogoVariantService } from './services/logoVariant.service';
import { CompleteAssetGenerationService } from './services/completeAssetGeneration.service';
import { handleImageGenerationError } from './utils/retry';
import { createTelegramStickerPack, addStickerToPack } from './utils/telegramStickerPack';
import { clearUserIntervals } from './utils/intervalManager';
import fs from 'fs';
import { startImageWorker, imageQueue } from './utils/imageQueue';
import { userLoader } from './middleware/userLoader';
import i18n, { i18nMiddleware } from './middleware/i18n.middleware';
import { sceneSessionResetMiddleware, ensureSessionCleanup } from './middleware/scene.middleware';
import { setupLanguageCommand } from './commands/language';
import sharp from 'sharp';

const { ImageGeneration } = require('./models/ImageGeneration');

logger.info('📦 Index file loaded - Initializing scalable bot architecture');

// --- Main Menu Helper ---
export async function sendMainMenu(ctx: BotContext) {
  // Show star balance if available
  let balanceMsg = '';
  if (ctx.dbUser) {
    balanceMsg = `\n\n*${ctx.i18n.t('welcome.star_balance')}:* ${ctx.dbUser.starBalance} ⭐`;
  }

  // Add beta testing notice if in testing mode
  let betaNotice = '';
  if (process.env.TESTING === 'true') {
    betaNotice = `\n\n🧪 *BETA TESTING MODE*\n🎉 *All features are FREE during testing!*\n📝 Help us improve by sharing feedback\n\n`;
  }

  await ctx.reply(
    `*${ctx.i18n.t('welcome.title')}*${betaNotice}\n${ctx.i18n.t('welcome.what_to_do')}${balanceMsg}\n\n_${ctx.i18n.t('welcome.built_by')}_`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: ctx.i18n.t('menu.generate_logo'), callback_data: 'generate_logo' },
            { text: ctx.i18n.t('menu.generate_memes'), callback_data: 'generate_memes' }
          ],
          [
            { text: ctx.i18n.t('menu.generate_stickers'), callback_data: 'generate_stickers' },
            { text: ctx.i18n.t('menu.edit_image'), callback_data: 'edit_image' }
          ],
          [
            { text: ctx.i18n.t('menu.starter_pack'), callback_data: 'starter_pack' },
            { text: ctx.i18n.t('menu.my_history'), callback_data: 'my_history' }
          ],
          [
            { text: ctx.i18n.t('menu.buy_stars'), callback_data: 'buy_stars' },
            { text: '🔗 Referrals', callback_data: 'referral_menu' }
          ],
          [
            { text: ctx.i18n.t('menu.language'), callback_data: 'change_language' }
          ]
        ]
      }
    }
  );
}

// Initialize services
const openaiService = new OpenAIService();
const fluxService = new FluxService();
const mongodbService = new MongoDBService();
const storageService = new StorageService();
// FluxService removed - using OpenAI gpt-image-1 instead
const logoVariantService = new LogoVariantService(storageService, openaiService);
const completeAssetGenerationService = new CompleteAssetGenerationService(storageService, openaiService);

// Initialize the bot with proper configuration
if (!config.telegram.botToken) {
  logger.error('❌ BOT_TOKEN is required but not found in environment variables');
  process.exit(1);
}

const bot = new Telegraf<BotContext>(config.telegram.botToken);

// Dynamically resolve bot username for Telegram sticker set naming
let RESOLVED_BOT_USERNAME: string = config.telegram.botUsername || '';
(async () => {
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
})();

// Removed context boundary middleware

// Setup session middleware
bot.use(session());
// Add our session cleanup middleware before user loading
bot.use(ensureSessionCleanup());
bot.use(userLoader);

// Add i18n middleware
bot.use(i18n.middleware());
bot.use(i18nMiddleware);

// Keep track of last command execution time per user
const lastStartCommand = new Map<number, number>();

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

// Add this after bot initialization to log all updates
bot.use((ctx, next) => {
  console.log('Received update:', ctx.updateType, ctx.update);
  return next();
});

// We'll handle individual cases rather than using middleware to avoid TypeScript errors

// Helper to force leave any active scene and clear session
async function forceLeaveCurrentScene(ctx: BotContext) {
  // Clear any running intervals that might be in the session
  if (ctx.session) {
    // Clear common known interval keys to prevent memory leaks
    const intervalKeys = ['__memeStillWorkingInterval', '__stickerStillWorkingInterval'];
    for (const key of intervalKeys) {
      if ((ctx.session as any)[key]) {
        clearInterval((ctx.session as any)[key]);
        console.log(`Cleared interval: ${key}`);
        delete (ctx.session as any)[key];
      }
    }
  }

  if (ctx.scene && ctx.scene.current) {
    // Preserve language setting if available
    const language = ctx.i18n?.locale();

    try {
      await ctx.scene.leave();
      console.log('Successfully left scene');
    } catch (err) {
      console.error('Error leaving scene:', err);
      // If we can't leave gracefully, we'll still reset the session below
    }

    // Completely reset session
    ctx.session = {
      __scenes: { current: null, state: {} }
    } as any;

    // Restore language setting
    if (language && ctx.i18n) {
      ctx.i18n.locale(language);
    }

    console.log('Scene left and session fully reset');
  } else if (!ctx.session) {
    // If no session at all, create one
    ctx.session = { __scenes: { current: null, state: {} } } as any;
  } else {
    // Even if not in a scene, clear everything except core structure
    ctx.session = { __scenes: { current: null, state: {} } } as any;

    // Restore language if it was set
    if (ctx.i18n) {
      const lang = ctx.i18n.locale();
      if (lang) {
        ctx.i18n.locale(lang);
      }
    }
  }
}

// Modify the bot.start handler to completely clear session data
bot.start(async (ctx) => {
  console.log(`[Start] /start by user=${ctx.from?.id}`);
  // Only process if this is not a duplicate command within 2 seconds
  const userId = ctx.from?.id || 0;
  const now = Date.now();
  const lastTime = lastStartCommand.get(userId) || 0;

  if (now - lastTime < 2000) {
    logger.debug('Ignoring duplicate /start command');
    return;
  }

  // Update the timestamp
  lastStartCommand.set(userId, now);

  // Process referral if present in start payload
  const startPayload = ctx.startPayload;
  if (startPayload && startPayload.startsWith('REF')) {
    try {
      const result = await mongodbService.processReferral(userId, startPayload);
      if (result.success) {
        await ctx.reply(
          `🎉 Welcome! You've joined via a referral link. Start using the bot to unlock rewards for your referrer!`
        );
      }
    } catch (error) {
      logger.error('Error processing referral:', error);
    }
  }

  // Add special beta testing welcome if in testing mode
  if (process.env.TESTING === 'true') {
    await ctx.reply(
      `🧪 *Welcome to Instalogo Beta Testing!*\n\n` +
      `🎉 You're part of our exclusive beta test group!\n` +
      `✨ All features are completely FREE during testing\n` +
      `📝 Your feedback helps us improve the bot\n` +
      `🚀 Test everything - logos, memes, stickers!\n\n` +
      `Thank you for being a beta tester! 🙏`,
      { parse_mode: 'Markdown' }
    );
  }

  // Force leave and clear any existing scene state
  await forceLeaveCurrentScene(ctx);

  // Extra step: Completely reset ALL session data to ensure nothing persists
  if (ctx.session) {
    const scenes = ctx.session.__scenes;
    // Create a fresh session with only the __scenes structure
    ctx.session = { __scenes: { current: null, state: {} } } as any;
    // Restore language if it was set
    if (ctx.i18n) {
      const lang = ctx.i18n.locale();
      if (lang) {
        ctx.i18n.locale(lang);
      }
    }
  }

  await sendMainMenu(ctx);
});

// Help command
bot.help(async (ctx) => {
  await forceLeaveCurrentScene(ctx);
  await sendMainMenu(ctx);
});

// Menu command
bot.command('menu', async (ctx) => {
  await forceLeaveCurrentScene(ctx);
  await sendMainMenu(ctx);
});

// Cancel command - explicitly exit any active scene
bot.command('cancel', async (ctx) => {
  await forceLeaveCurrentScene(ctx);
  await ctx.reply(ctx.i18n.t('general.cancel_command'));
  await sendMainMenu(ctx);
});

// Referral command
bot.command('referral', async (ctx) => {
  await forceLeaveCurrentScene(ctx);
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    let stats = await mongodbService.getReferralStats(userId);

    // Generate referral code if user doesn't have one
    if (!stats.referralCode) {
      const newCode = await mongodbService.generateReferralCode(userId);
      if (newCode) {
        stats.referralCode = newCode;
      }
    }

    if (stats.referralCode) {
      const referralLink = `https://t.me/${ctx.botInfo.username}?start=${stats.referralCode}`;

      await ctx.reply(
        `🔗 *Your Referral Program*\n\n` +
        `📋 *Your Referral Link:*\n\`${referralLink}\`\n\n` +
        `📊 *Your Stats:*\n` +
        `• Referrals: ${stats.referralCount}\n` +
        `• Total Rewards: ${stats.totalRewards} ⭐\n\n` +
        `💰 *Rewards:*\n` +
        `• You get: 20 ⭐ when they use the bot\n` +
        `• They get: No bonus (fair pricing for all)\n\n` +
        `Share your link and earn stars! 🚀`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📤 Share Link', url: `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('🎨 Join me on BrandForge Bot! Create amazing logos, memes, and stickers with AI.')}` }],
              [{ text: '🏠 Back to Menu', callback_data: 'back_to_menu' }]
            ]
          }
        }
      );
    } else {
      await ctx.reply('❌ Error generating referral code. Please try again later.');
    }
  } catch (error) {
    console.error('Error in referral command:', error);
    await ctx.reply('❌ Error accessing referral system. Please try again later.');
  }
});

// Generate logo command
bot.command('generate_logo', async (ctx) => {
  await forceLeaveCurrentScene(ctx);
  await ctx.scene.enter('logoWizard');
});

// Generate stickers command
bot.command('generate_stickers', async (ctx) => {
  await forceLeaveCurrentScene(ctx);
  await ctx.scene.enter('stickerWizard');
});


// Generate memes command (text trigger)
bot.hears('Generate Memes', async (ctx) => {
  await forceLeaveCurrentScene(ctx);
  // Reset any meme-related session data
  const memeKeys = ['memeImageFileId', 'memeText', 'memeMood', 'memeElements', 'memeStyle'];
  memeKeys.forEach(key => delete (ctx.session as any)[key]);
  await ctx.scene.enter('memeWizard');
});

// New: Inline button callback handler for 'Generate Memes'
bot.action('generate_memes', async (ctx) => {
  await ctx.answerCbQuery();
  await forceLeaveCurrentScene(ctx);

  // Completely reset ALL meme-related session data
  const memeKeys = [
    'memeImageFileId', 'memeImageSkipped', 'memeTopic',
    'memeAudience', 'memeMood', 'memeElements',
    'memeCatch', 'memeFormat', 'memeColor', 'memeStyle',
    'memeStyleDesc', 'memeText', 'awaitingCustomMemeStyle'
  ];

  // Remove all meme keys and ensure no old data persists
  if (ctx.session) {
    // Save important system properties
    const scenes = ctx.session.__scenes;
    const language = ctx.i18n?.locale();

    // Reset to a clean session
    ctx.session = { __scenes: scenes } as any;

    // Restore language
    if (language && ctx.i18n) {
      ctx.i18n.locale(language);
    }
  }

  // Show the Start Meme Flow button
  await ctx.reply('Ready to start meme creation?', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '▶️ Start Meme Flow', callback_data: 'memes_start' }]
      ]
    }
  });
});

bot.action('starter_pack', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(ctx.i18n.t('general.please_upload'));
  (ctx.session as any).awaitingStarterPackImage = true;
});

// Edit Image Action - Start the new wizard
bot.action('edit_image', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter('editImageWizard');
});

// In the photo handler, always reply with a debug message
bot.on('photo', async (ctx) => {
  console.log('Received photo event');
  await ctx.reply(ctx.i18n.t('general.photo_received'));
  if ((ctx.session as any).awaitingStarterPackImage) {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);
    const response = await fetch(fileLink.href);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filePath = `starter-pack-${ctx.from.id}.png`;
    fs.writeFileSync(filePath, buffer);
    const packName = `starter_pack_${(ctx.from.username || ctx.from.id).toString().toLowerCase()}_by_logoaidbot`;
    const packTitle = `Starter Pack by ${ctx.from.first_name || 'User'}`;
    const emojis = '😎';
    try {
      await createTelegramStickerPack(
        bot,
        ctx.from.id,
        packName,
        packTitle,
        filePath,
        emojis
      );
      await ctx.reply(ctx.i18n.t('general.starter_pack_created', { packName }), { parse_mode: 'Markdown' });
    } catch (e: any) {
      // If the error is 'sticker set name is already occupied', add to existing set
      if (e && e.description && e.description.includes('sticker set name is already occupied')) {
        try {
          await addStickerToPack(
            bot,
            ctx.from.id,
            packName,
            filePath,
            emojis
          );
          await ctx.reply(ctx.i18n.t('general.starter_pack_created', { packName }), { parse_mode: 'Markdown' });
        } catch (addError: any) {
          await ctx.reply(ctx.i18n.t('errors.general_error', { error: addError.message }));
        }
      } else {
        await ctx.reply(ctx.i18n.t('errors.general_error', { error: e.message }));
      }
    }
    // Clean up the file after use
    fs.unlinkSync(filePath);
    (ctx.session as any).awaitingStarterPackImage = false;
  }
});

// Handle text commands (most text handling is now done within scenes)
bot.on('text', async (ctx) => {
  // Text handling is primarily managed within individual scenes
  console.log('Received message:', ctx.message.text);
});

// Setup error handling
function logCriticalErrorToFile(error: unknown, context: string): string {
  const ref = Math.random().toString(36).substring(2, 10);
  let errorMsg = '';
  if (typeof error === 'object' && error !== null && 'stack' in error && typeof (error as any).stack === 'string') {
    errorMsg = (error as any).stack;
  } else {
    errorMsg = String(error);
  }
  const logEntry = `[${new Date().toISOString()}] [Ref:${ref}] ${context} ${errorMsg}\n`;
  fs.appendFileSync('critical-errors.log', logEntry);
  return ref;
}

bot.catch((err, ctx) => {
  const ref = logCriticalErrorToFile(err, 'Bot error:');
  console.error('Bot error:', err);
  ctx.reply('Sorry, something went wrong. Please try again later. (Ref: ' + ref + ')');
});

// Helper to calculate meme cost based on quality
function calculateMemeCost(quality: string): number {
  if (quality.toLowerCase() === 'good') return 50;
  if (quality.toLowerCase() === 'medium') return 70;
  if (quality.toLowerCase() === 'high') return 90;
  return 50; // Default
}

/**
 * Build icon-specific prompts to make icons more distinct and prominent
 */
function buildIconSpecificPrompts(iconIdeas: string, brandName: string, style: string): { concept1: string; concept2: string } {
  const iconArray = iconIdeas.toLowerCase().split(', ');

  // Categorize icons for targeted prompts
  const techIcons = iconArray.filter(icon =>
    icon.includes('circuit') || icon.includes('tech') || icon.includes('node') ||
    icon.includes('shield') || icon.includes('cloud') || icon.includes('gear') ||
    icon.includes('cog') || icon.includes('network') || icon.includes('connectivity')
  );

  const natureIcons = iconArray.filter(icon =>
    icon.includes('leaf') || icon.includes('plant') || icon.includes('water') ||
    icon.includes('droplet') || icon.includes('mountain') || icon.includes('landscape') ||
    icon.includes('animal') || icon.includes('sun') || icon.includes('energy')
  );

  const businessIcons = iconArray.filter(icon =>
    icon.includes('graph') || icon.includes('chart') || icon.includes('building') ||
    icon.includes('structure') || icon.includes('handshake') || icon.includes('partnership') ||
    icon.includes('crown') || icon.includes('award') || icon.includes('arrow') ||
    icon.includes('direction')
  );

  const abstractIcons = iconArray.filter(icon =>
    icon.includes('abstract') || icon.includes('geometric') || icon.includes('pattern') ||
    icon.includes('monogram') || icon.includes('minimalist') || icon.includes('symbol') ||
    icon.includes('shape')
  );

  // Build concept-specific prompts
  let concept1 = '';
  let concept2 = '';

  if (techIcons.length > 0) {
    concept1 = `featuring a prominent TECH ICON with ${techIcons.join(' and ')}, modern sleek design, clean geometric lines, innovation-focused`;
    concept2 = `with a distinctive TECH SYMBOL incorporating ${techIcons.join(' and ')}, cutting-edge aesthetic, precision engineering visual`;
  } else if (natureIcons.length > 0) {
    concept1 = `featuring a distinctive NATURE ICON with ${natureIcons.join(' and ')}, organic flowing design, natural curves, sustainability-focused`;
    concept2 = `with a prominent NATURE SYMBOL incorporating ${natureIcons.join(' and ')}, botanical elements, earth-inspired shapes`;
  } else if (businessIcons.length > 0) {
    concept1 = `featuring a professional BUSINESS ICON with ${businessIcons.join(' and ')}, authoritative design, corporate aesthetics, success-focused`;
    concept2 = `with a distinctive BUSINESS SYMBOL incorporating ${businessIcons.join(' and ')}, structured elements, professional symbolism`;
  } else if (abstractIcons.length > 0) {
    concept1 = `featuring a unique ABSTRACT ICON with ${abstractIcons.join(' and ')}, creative geometric design, bold shapes, memorable visual`;
    concept2 = `with a distinctive ABSTRACT SYMBOL incorporating ${abstractIcons.join(' and ')}, creative geometry, distinctive visual elements`;
  } else {
    // Generic icon handling
    concept1 = `featuring a prominent ICON with ${iconIdeas.toLowerCase()}, distinctive design, strong visual impact`;
    concept2 = `with a distinctive SYMBOL incorporating ${iconIdeas.toLowerCase()}, unique visual elements, memorable design`;
  }

  // Add icon prominence requirements
  concept1 += ', icon must be DOMINANT VISUAL ELEMENT, bold and immediately recognizable';
  concept2 += ', symbol must be PROMINENT FEATURE, scalable and impactful';

  return { concept1, concept2 };
}

// Start the bot
const startBot = async () => {
  logger.info('🤖 Starting bot initialization...');
  try {
    // Check if LocalStack is running by ensuring the S3 bucket exists
    try {
      await storageService.ensureBucketExists();
      console.log('LocalStack is running and bucket is ready');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('LocalStack may not be available:', errorMessage);
      console.warn('Continuing anyway, but S3 storage operations may fail');
    }

    // Start the image generation worker
    console.log('Starting BullMQ image generation worker...');
    try {
      console.log('Registering worker function...');
      startImageWorker(async (job) => {
        console.log('Worker function is being invoked for job:', job.id, job.name, job.data);
        const { name, data } = job;
        const { prompt, userId, chatId, session, count } = data;

        try {
          console.log(`[ImageWorker] Starting job: ${job.id} (${name})`);
          if (name === 'generate-logo') {
            // Create consistent timestamp for this generation
            const generationTimestamp = Date.now();

            // Get parameters from job data
            const freeGenerationUsed = job.data.freeGenerationUsed || false;
            const cost = job.data.cost !== undefined ? job.data.cost : (!freeGenerationUsed ? 0 : 50);
            const useDSPy = false; // DSPy disabled - always use basic prompts

            console.log(`[ImageWorker] Processing logo generation. Cost: ${cost}, Free used: ${freeGenerationUsed}, DSPy: ${useDSPy}`);

            const sharp = require('sharp');
            const allSizes = [1024, 512, 256];

            // Get user balance for logging
            const user = await User.findOne({ userId });
            const userBalance = user?.starBalance || 0;

            let finalPrompts: string[] = [];
            let dspyResults: any[] = [];

            // Always use comprehensive prompt generation with ALL user selections
            console.log(`[ImageWorker] 📝 Using comprehensive prompt generation with OpenAI gpt-image-1...`);

            // Extract and format all user selections
            const brandName = session.name || 'your brand';
            const tagline = session.tagline && session.tagline !== 'skip' ? `Tagline: "${session.tagline}".` : '';
            const industry = session.mission || 'Business';
            const vibe = Array.isArray(session.vibe) ? session.vibe.join(', ') : session.vibe || 'Professional';
            const audience = Array.isArray(session.audience) ? session.audience.join(', ') : session.audience || 'General audience';
            const style = Array.isArray(session.stylePreferences) ? session.stylePreferences.join(', ') : session.stylePreferences || 'Modern';
            const colors = Array.isArray(session.colorPreferences) ? session.colorPreferences.join(', ') : session.colorPreferences || 'Professional palette';
            const typography = Array.isArray(session.typography) ? session.typography.join(', ') : session.typography || 'Clean';
            const iconIdeas = Array.isArray(session.iconIdea) ? session.iconIdea.join(', ') : session.iconIdea || 'Abstract symbol';
            const inspiration = session.inspiration && session.inspiration !== 'skip' ? `Inspired by: ${session.inspiration}.` : '';
            const notes = session.finalNotes && session.finalNotes !== 'skip' ? `Special requirements: ${session.finalNotes}.` : '';

            // Log comprehensive session data for debugging
            console.log(`[ImageWorker] Session data: Brand=${brandName}, Industry=${industry}, Vibe=${vibe}, Audience=${audience}, Style=${style}, Colors=${colors}, Typography=${typography}, Icons=${iconIdeas}`);

            // Enhanced icon-specific prompts for more distinct icon generation
            const iconSpecificPrompts = buildIconSpecificPrompts(iconIdeas, brandName, style);

            // Build comprehensive brand context for each concept
            const brandContext = [
              `=== BRAND IDENTITY ===`,
              `Brand Name: "${brandName}"`,
              tagline ? `Tagline/Slogan: "${tagline}"` : '',
              `Industry/Mission: ${industry}`,
              `Brand Vibe: ${vibe}`,
              `Target Audience: ${audience}`,
              `Visual Style: ${style}`,
              `Color Palette: ${colors}`,
              `Typography: ${typography}`,
              `Icon Elements: ${iconIdeas}`,
              inspiration ? `Design Inspiration: ${inspiration}` : '',
              notes ? `Special Requirements: ${notes}` : '',
              ''
            ].filter(Boolean).join('\n');

            const technicalRequirements = [
              `=== TECHNICAL REQUIREMENTS ===`,
              `Format: High-quality PNG with transparent background`,
              `Background: TRANSPARENT BACKGROUND ONLY, no background color, PNG with alpha channel`,
              `Composition: Isolated logo elements, clear background, transparent backdrop`,
              `Scalability: Vector-style design that works at all sizes`,
              `Compatibility: Works on both light and dark backgrounds`,
              `Quality: Professional industry standards`,
              ''
            ].join('\n');

            const designObjectives = [
              `=== DESIGN OBJECTIVES ===`,
              `1. Create a memorable and unique visual identity that stands out from competitors`,
              `2. Ensure the logo reflects the brand identity, values, and personality described above`,
              `3. Design with clear visual hierarchy and proper spacing for optimal readability`,
              `4. Use colors and typography that convey the right emotions and industry standards`,
              `5. Ensure the logo is instantly recognizable and works well at different sizes`,
              `6. Follow professional design principles with appropriate contrast and legibility`,
              `7. Create a timeless design that will remain relevant and effective over time`,
              ''
            ].join('\n');

            finalPrompts = [
              // Concept 1: Enhanced icon prominence with comprehensive context
              [
                brandContext,
                `=== CONCEPT 1: ICON-FOCUSED DESIGN ===`,
                `Design Approach: ${iconSpecificPrompts.concept1}`,
                technicalRequirements,
                designObjectives,
                `=== FINAL INSTRUCTION ===`,
                `Generate a professional logo for ${brandName} that incorporates ALL the above context, preferences, and requirements. Focus on creating a distinctive icon that represents the brand effectively.`
              ].join('\n'),

              // Concept 2: Alternative with enhanced icon focus and comprehensive context
              [
                brandContext,
                `=== CONCEPT 2: ALTERNATIVE DESIGN APPROACH ===`,
                `Design Approach: ${iconSpecificPrompts.concept2}`,
                `Style Emphasis: ${style.toLowerCase()} style with enhanced visual impact`,
                technicalRequirements,
                designObjectives,
                `=== FINAL INSTRUCTION ===`,
                `Generate a distinctive logo for ${brandName} that incorporates ALL the above context, preferences, and requirements. Create an alternative design approach that showcases different visual possibilities.`
              ].join('\n')
            ];

            if (!session.generatedLogos) session.generatedLogos = [];

            // Generate each logo separately with its own prompt and seed
            const generatedLogos: Array<{url: string, seed: number, prompt: string}> = [];

            for (let idx = 0; idx < finalPrompts.length; idx++) {
              const logoPrompt = finalPrompts[idx];
              console.log(`[ImageWorker] Generating logo ${idx + 1} with prompt: ${logoPrompt.substring(0, 100)}...`);

              try {
                // Use OpenAI service for logo generation with retry logic
                const openaiResult = await openaiService.generateLogoImages({
                  prompt: logoPrompt,
                  userId: userId,
                  sessionId: session?.sessionId,
                  freeGeneration: idx === 0 && !freeGenerationUsed
                });

                console.log(`[ImageWorker] Generated logo ${idx + 1} with OpenAI`);

                // Check if image data exists and is valid
                if (!openaiResult || openaiResult.length === 0) {
                  console.error(`[ImageWorker] No image data returned for logo ${idx + 1}`);
                  continue; // Skip this logo and continue with the next one
                }

              // Get the first image URL from OpenAI result
              const imageUrl = openaiResult[0];
              if (!imageUrl || typeof imageUrl !== 'string') {
                console.error(`[ImageWorker] Invalid image URL for logo ${idx + 1}:`, typeof imageUrl);
                continue; // Skip this logo
              }

              // Handle both base64 data URLs and direct URLs
              let imageBuffer: Buffer;
              if (imageUrl.startsWith('data:')) {
                // Base64 data URL
                imageBuffer = Buffer.from(imageUrl.split(',')[1], 'base64');
              } else {
                // Direct URL - fetch the image
                try {
                  const response = await fetch(imageUrl);
                  const arrayBuffer = await response.arrayBuffer();
                  imageBuffer = Buffer.from(arrayBuffer);
                } catch (fetchError) {
                  console.error(`[ImageWorker] Error fetching image from URL:`, fetchError);
                  continue; // Skip this logo
                }
              }
              const logoSet: Record<string, string> = {};

              // Create multiple sizes for each logo (OpenAI gpt-image-1 generates transparent PNGs natively)
              for (const size of allSizes) {
                // Simply resize the image - OpenAI gpt-image-1 already generates transparent PNGs
                const resized = await sharp(imageBuffer)
                  .resize(size, size)
                  .png({
                    quality: 100,
                    compressionLevel: 0,
                    adaptiveFiltering: false,
                    force: true // Force PNG output
                  })
                  .toBuffer();
                const storedUrl = await storageService.uploadBuffer(resized, {
                  key: `logos/${session?.name?.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}-${idx}-${size}.png`,
                  contentType: 'image/png'
                });
                logoSet[size] = storedUrl;
              }

              // Store the main logo URL (no seed for OpenAI gpt-image-1)
              generatedLogos.push({
                url: logoSet['1024'],
                seed: undefined, // OpenAI gpt-image-1 doesn't support seeds
                prompt: logoPrompt
              });

              session.generatedLogos.push(logoSet);

              // Send logo with basic concept description
              const conceptDescription = `Logo Concept ${idx + 1}`;
              const caption = `${conceptDescription}\n\n${cost === 0 ? '(Free)' : `(${cost} stars)`}`;

              // Process image for preview (OpenAI gpt-image-1 generates transparent PNGs natively)
              const previewBuffer = await sharp(imageBuffer)
                .png({
                  quality: 100,
                  compressionLevel: 0,
                  adaptiveFiltering: false,
                  force: true
                })
                .toBuffer();

              // Send preview as photo
              await bot.telegram.sendPhoto(chatId, { source: previewBuffer }, {
                caption: `📸 Preview: ${caption}`,
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: '👍 Like', callback_data: `feedback_like_${userId}_${generationTimestamp}_${idx}` },
                      { text: '👎 Dislike', callback_data: `feedback_dislike_${userId}_${generationTimestamp}_${idx}` }
                    ],
                    [
                      { text: '✅ Select This Logo', callback_data: `select_logo_${userId}_${generationTimestamp}_${idx}` },
                      { text: '🔄 Regenerate', callback_data: `regenerate_logo_${idx}` }
                    ]
                  ]
                }
              });

              // Send processed PNG as document for download
              await bot.telegram.sendDocument(chatId, {
                source: previewBuffer,
                filename: `${session?.name?.replace(/\s+/g, '-').toLowerCase() || 'logo'}-concept-${idx + 1}.png`
              }, {
                caption: `📥 Download: ${conceptDescription} (PNG Format)\n\nHigh-quality PNG with transparent background - perfect for professional use!`,
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: '📥 Download All Variants', callback_data: `download_all_variants_${userId}_${Date.now()}_${idx}` }
                    ]
                  ]
                }
              });

              } catch (logoError) {
                console.error(`[ImageWorker] Error generating logo ${idx + 1}:`, logoError);

                // Send user-friendly error message
                const errorMessage = handleImageGenerationError(logoError, `Logo ${idx + 1} generation`);
                await bot.telegram.sendMessage(chatId,
                  `❌ ${errorMessage}\n\nContinuing with other logos...`
                );

                // Continue with next logo instead of failing completely
                continue;
              }
            }

            // Check if we have any successful logos
            if (generatedLogos.length === 0) {
              console.error(`[ImageWorker] No logos were generated successfully for user ${userId}`);
              await bot.telegram.sendMessage(chatId,
                '❌ Sorry, all logo generation attempts failed. This might be due to network issues or service problems. Please try again later.'
              );

              // Clear intervals and exit
              clearUserIntervals(userId);
              return;
            }

            // Store generation data with seeds for variant generation
            const generationData = {
              userId,
              sessionId: session?.sessionId,
              originalPrompt: finalPrompts[0], // Store first prompt as base
              selectedImageIndex: 0, // Will be updated when user selects
              brandName: session?.name,
              seeds: generatedLogos.map(logo => logo.seed), // Store all seeds
              prompts: generatedLogos.map(logo => logo.prompt) // Store all prompts
            };

            // Store in session for variant generation
            (session as any).generationData = generationData;

            // Store in database with seed information and API cost
            try {
            const createdLogoGen = await ImageGeneration.create({
                userId,
                type: 'logo',
              cost,
              imageUrl: generatedLogos[0].url, // Store first logo URL
              apiProvider: 'openai',
              apiModel: openaiService.lastModel || undefined,
              apiCostUsd: openaiService.lastCallCostUsd || 0,
              apiUsage: openaiService.lastCallUsage || undefined,
              originalPrompt: finalPrompts[0],
              selectedImageIndex: 0,
              seed: generatedLogos[0].seed, // Store first seed
              timestamp: new Date(generationTimestamp), // Use consistent timestamp
              generationMetadata: {
                brandName: session?.name,
                sessionId: session?.sessionId,
                isVariant: false,
                allSeeds: generatedLogos.map(logo => logo.seed),
                allPrompts: generatedLogos.map(logo => logo.prompt),
                generationTimestamp: generationTimestamp // Store for callback data
              }
            });
            console.log(`[DB] Logo generation saved _id=${createdLogoGen._id} apiCostUsd=$${(createdLogoGen.apiCostUsd||0).toFixed(6)} provider=${createdLogoGen.apiProvider}`);
            } catch (dbErr) {
              console.error('[DB] Failed to save logo ImageGeneration:', dbErr);
            }

            // Update the user's status if needed
            if (job.data.updateUser) {
              try {
                const user = await User.findOne({ userId });
                if (user) {
                  if (!freeGenerationUsed) {
                    user.freeGenerationUsed = true;
                    console.log(`[ImageWorker] Marked free generation as used for user ${userId}`);
                  }

                  if (cost > 0) {
                    console.log(`[ImageWorker] User ${userId} previous balance: ${user.starBalance}`);
                    user.starBalance -= cost;
                    console.log(`[ImageWorker] User ${userId} new balance: ${user.starBalance}`);
                  }

                  await user.save();

                  // Check for referral conversion (first generation)
                  try {
                    const conversionResult = await mongodbService.processReferralConversion(userId);
                    if (conversionResult.success && conversionResult.referrerId) {
                      // Notify the referrer about the reward
                      await bot.telegram.sendMessage(
                        conversionResult.referrerId,
                        `🎉 Great news! Someone you referred just used the bot and you've earned ${conversionResult.referrerReward} ⭐ stars!`
                      ).catch(err => console.log('Could not notify referrer:', err));
                    }
                  } catch (conversionError) {
                    console.error(`[ImageWorker] Error processing referral conversion:`, conversionError);
                  }
                }
              } catch (dbError) {
                console.error(`[ImageWorker] Error updating user after logo generation:`, dbError);
              }
            }

            // Check if we have any successful logos
            if (generatedLogos.length === 0) {
              console.error(`[ImageWorker] No logos were generated successfully for user ${userId}`);
              await bot.telegram.sendMessage(chatId,
                '❌ Sorry, all logo generation attempts failed. This might be due to network issues or service problems. Please try again later.'
              );

              // Clear intervals and exit
              clearUserIntervals(userId);
              return;
            }

            // Store all logo sets in MongoDB for this user
            await mongodbService.setUserLogos(userId, session.generatedLogos);

            console.log(`[ImageWorker] Completed job: ${job.id} (generate-logo) - ${generatedLogos.length} logos generated`);

            // Logos are already sent immediately during generation above
            // No need to send them again here - this was causing duplicate/wrong images
            console.log(`[ImageWorker] Logo generation completed for user ${userId} - logos already sent during generation`);

            // 🧹 CLEAR ALL "STILL WORKING" INTERVALS FOR THIS USER
            clearUserIntervals(userId);
          } else if (name === 'generate-meme') {
            // Get parameters from job data
            const freeGenerationUsed = job.data.freeGenerationUsed || false;
            const quality = job.data.quality || 'Good';
            const cost = job.data.cost !== undefined ? job.data.cost : (!freeGenerationUsed ? 0 : calculateMemeCost(quality));

            console.log(`[ImageWorker] Processing meme generation. Quality: ${quality}, Cost: ${cost}, Free used: ${freeGenerationUsed}, Basic prompts enabled`);

            try {
              let buffer;
              let finalPrompt: string;

              // Get user balance for logging
              const user = await User.findOne({ userId });
              const userBalance = user?.starBalance || 0;

              // Build prompt from wizard and use FLUX for generation
              finalPrompt = prompt;
              console.log(`[ImageWorker] 🎛 Using FLUX for meme generation...`);
              const memeUrls = await fluxService.generateMemes({
                prompt: finalPrompt,
                count: 1,
                userId,
                sessionId: session?.sessionId,
                generationType: 'meme'
              });
              if (!memeUrls || memeUrls.length === 0) {
                throw new Error('No memes returned from FLUX');
              }
              // Download first meme URL to buffer
              const memeResp = await axios.get(memeUrls[0], { responseType: 'arraybuffer' });
              buffer = Buffer.from(memeResp.data as ArrayBuffer);

              const memeUrl = await storageService.uploadBuffer(buffer, {
                key: `memes/meme-${userId}-${Date.now()}.png`,
                contentType: 'image/png'
              });


              // Create DB record for the meme with API cost logging
              let imageGen: any;
              try {
              imageGen = await ImageGeneration.create({
                userId,
                type: 'meme',
                quality,
                cost,
                imageUrl: memeUrl,
                apiProvider: 'flux',
                apiModel: fluxService.lastModel || undefined,
                apiCostUsd: fluxService.lastCallCostUsd || 0,
                apiUsage: undefined,
              });
              console.log(`[DB] Meme generation saved _id=${imageGen._id} apiCostUsd=$${(imageGen.apiCostUsd||0).toFixed(6)} provider=${imageGen.apiProvider}`);
              } catch (dbErr) {
                console.error('[DB] Failed to save meme ImageGeneration:', dbErr);
              }

              // Update the user's status if needed
              if (job.data.updateUser) {
                try {
                  const user = await User.findOne({ userId });
                  if (user) {
                    if (!freeGenerationUsed) {
                      user.freeGenerationUsed = true;
                      console.log(`[ImageWorker] Marked free generation as used for user ${userId}`);
                    }

                    if (cost > 0) {
                      console.log(`[ImageWorker] User ${userId} previous balance: ${user.starBalance}`);
                      user.starBalance -= cost;
                      console.log(`[ImageWorker] User ${userId} new balance: ${user.starBalance}`);
                    }

                    await user.save();

                    // Check for referral conversion (first generation)
                    try {
                      const conversionResult = await mongodbService.processReferralConversion(userId);
                      if (conversionResult.success && conversionResult.referrerId) {
                        // Notify the referrer about the reward
                        await bot.telegram.sendMessage(
                          conversionResult.referrerId,
                          `🎉 Great news! Someone you referred just used the bot and you've earned ${conversionResult.referrerReward} ⭐ stars!`
                        ).catch(err => console.log('Could not notify referrer:', err));
                      }
                    } catch (conversionError) {
                      console.error(`[ImageWorker] Error processing referral conversion:`, conversionError);
                    }
                  }
                } catch (dbError) {
                  console.error(`[ImageWorker] Error updating user after meme generation:`, dbError);
                }
              }

              // Basic caption
              const conceptDescription = 'Your meme';
              const caption = `${conceptDescription}\n\n${cost === 0 ? '(Free)' : `(${cost} stars)`}`;

              console.log(`[ImageWorker] 📤 Sending meme to user ${userId} in chat ${chatId}...`);
              console.log(`[ImageWorker] 📝 Meme caption: ${caption}`);
              console.log(`[ImageWorker] 🖼️ Buffer size: ${buffer?.length || 'undefined'} bytes`);

              await bot.telegram.sendPhoto(chatId, { source: buffer }, {
                caption,
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: '👍 Like', callback_data: `feedback_like_meme_${userId}_${Date.now()}` },
                      { text: '👎 Dislike', callback_data: `feedback_dislike_meme_${userId}_${Date.now()}` }
                    ],
                    [
                      { text: '📤 Share', callback_data: `share_meme_${imageGen._id}` },
                      { text: '🔄 Regenerate', callback_data: `regenerate_meme_${userId}` }
                    ]
                  ]
                }
              });

              console.log(`[ImageWorker] ✅ Meme sent successfully to user ${userId}!`);

              // 🧹 CLEAR ALL "STILL WORKING" INTERVALS FOR THIS USER
              clearUserIntervals(userId);
            } catch (error) {
              console.error(`[ImageWorker] Error in meme generation:`, error);
              await bot.telegram.sendMessage(chatId, 'Sorry, there was an error generating your meme. Please try again.');

              // 🧹 CLEAR INTERVALS EVEN ON ERROR
              clearUserIntervals(userId);
            }
          } else if (name === 'generate-sticker') {
            // Calculate cost based on sticker count and free generation status
            const freeGenerationUsed = job.data.freeGenerationUsed || false;
            const stickerCount = count || 1;
            const costPerSticker = 50; // 50 stars per sticker
            let totalCost = 0;

            // Apply free generation if available
            if (!freeGenerationUsed && stickerCount > 0) {
              totalCost = (stickerCount - 1) * costPerSticker; // First one free
              console.log(`[ImageWorker] Free generation used. Cost for ${stickerCount} stickers: ${totalCost}`);
            } else {
              totalCost = stickerCount * costPerSticker;
              console.log(`[ImageWorker] Regular generation. Cost for ${stickerCount} stickers: ${totalCost}`);
            }

            // Log the balance deduction for accounting
            console.log(`[ImageWorker] User ${userId} generating ${count} stickers. Cost: ${totalCost} stars.`);

            // Get user balance for logging
            const user = await User.findOne({ userId });
            const userBalance = user?.starBalance || 0;

            const stickerDir = path.join(__dirname, '../stickers');
            if (!fs.existsSync(stickerDir)) fs.mkdirSync(stickerDir, { recursive: true });

            try {
              console.log(`[ImageWorker] Generating ${count} stickers with FLUX via Replicate...`);

              // Generate all stickers in batches using FLUX
              const stickerUrls = await fluxService.generateStickers({
                prompt: prompt,
                count: count,
                userId: userId,
                sessionId: session?.sessionId,
                generationType: 'sticker'
              });

              // Validate sticker URLs
              if (!stickerUrls || stickerUrls.length === 0) {
                throw new Error('No stickers returned from FLUX');
              }

              console.log(`[ImageWorker] FLUX generated ${stickerUrls.length} stickers`);

              // Process each generated sticker
              for (let i = 0; i < stickerUrls.length; i++) {
                try {
                  // Download sticker from Replicate URL
                  const response = await axios.get(stickerUrls[i], { responseType: 'arraybuffer' });
                  const buffer = Buffer.from(response.data as ArrayBuffer);

                  const localStickerPath = path.join(stickerDir, `sticker-${userId}-${Date.now()}-${i}.png`);
                  fs.writeFileSync(localStickerPath, buffer);

                  const stickerUrl = await storageService.uploadBuffer(buffer, {
                    key: `stickers/sticker-${userId}-${Date.now()}-${i}.png`,
                    contentType: 'image/png'
                  });

                  // Calculate cost per sticker
                  const stickerCost = i === 0 && !freeGenerationUsed ? 0 : costPerSticker;

                  // Create DB record for this sticker with API cost logging
                  let imageGen: any;
                  try {
                  imageGen = await ImageGeneration.create({
                    userId,
                    type: 'sticker',
                    cost: stickerCost,
                    imageUrl: stickerUrl,
                    localPath: localStickerPath,
                    apiProvider: 'flux',
                    apiModel: fluxService.lastModel || undefined,
                    apiCostUsd: fluxService.lastCallCostUsd || 0,
                    apiUsage: undefined,
                  });
                  console.log(`[DB] Sticker generation saved _id=${imageGen._id} apiCostUsd=$${(imageGen.apiCostUsd||0).toFixed(6)} provider=${imageGen.apiProvider}`);
                  } catch (dbErr) {
                    console.error('[DB] Failed to save sticker ImageGeneration:', dbErr);
                  }

                  // Send sticker to user
                  await bot.telegram.sendPhoto(chatId, { source: buffer }, {
                    caption: i === 0 ? `Here is your generated sticker! ${stickerCost === 0 ? '(Free)' : `(${stickerCost} stars)`}` : `Sticker #${i+1} (${stickerCost} stars)`,
                    reply_markup: {
                      inline_keyboard: [
                        [
                          { text: 'Select for Pack', callback_data: `toggle_select_sticker_${imageGen._id}` }
                        ]
                      ]
                    }
                  });

                } catch (stickerError) {
                  console.error(`[ImageWorker] Error processing sticker ${i + 1}:`, stickerError);
                  await bot.telegram.sendMessage(chatId, `Sorry, there was an error processing sticker ${i + 1}. Continuing with others...`);
                }
              }

              // Prompt user to finish selection and create sticker pack
              try {
                await bot.telegram.sendMessage(chatId,
                  'Tap "Select for Pack" on any stickers you want to include, then press Finish:',
                  {
                    reply_markup: {
                      inline_keyboard: [[{ text: '✅ Finish & Create Pack', callback_data: 'finish_add_stickers' }]]
                    }
                  }
                );
              } catch (postMsgErr) {
                console.error('Error sending finish selection prompt:', postMsgErr);
              }

            } catch (error) {
              console.error(`[ImageWorker] Error generating stickers with FLUX:`, error);
              await bot.telegram.sendMessage(chatId, 'Sorry, there was an error generating your stickers. Please try again later.');
            }

            // Update user balance and free generation status
            if (job.data.updateUser) {
              try {
                const user = await User.findOne({ userId });
                if (user) {
                  if (!freeGenerationUsed) {
                    user.freeGenerationUsed = true;
                    console.log(`[ImageWorker] Marked free generation as used for user ${userId}`);
                  }

                  if (totalCost > 0 && process.env.TESTING !== 'true') {
                    console.log(`[ImageWorker] User ${userId} previous balance: ${user.starBalance}`);
                    user.starBalance -= totalCost;
                    console.log(`[ImageWorker] User ${userId} new balance: ${user.starBalance}`);
                  } else if (process.env.TESTING === 'true') {
                    console.log(`[ImageWorker] Testing mode: Skipping balance deduction for user ${userId}. Cost would be: ${totalCost}`);
                  }

                  await user.save();

                  // Check for referral conversion (first generation)
                  try {
                    const conversionResult = await mongodbService.processReferralConversion(userId);
                    if (conversionResult.success && conversionResult.referrerId) {
                      // Notify the referrer about the reward
                      await bot.telegram.sendMessage(
                        conversionResult.referrerId,
                        `🎉 Great news! Someone you referred just used the bot and you've earned ${conversionResult.referrerReward} ⭐ stars!`
                      ).catch(err => console.log('Could not notify referrer:', err));
                    }
                  } catch (conversionError) {
                    console.error(`[ImageWorker] Error processing referral conversion:`, conversionError);
                  }
                }
              } catch (dbError) {
                console.error(`[ImageWorker] Error updating user after sticker generation:`, dbError);
              }
            }

            console.log(`[ImageWorker] Completed job: ${job.id} (generate-sticker)`);

            // 🧹 CLEAR ALL "STILL WORKING" INTERVALS FOR THIS USER
            clearUserIntervals(userId);
          }
        } catch (error) {
          console.error(`[ImageWorker] Error in job ${job.id}:`, error);

          // Clear intervals to prevent hanging
          clearUserIntervals(userId);

          try {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            let userMessage = 'Sorry, there was an error processing your request. Please try again.';

            // Provide specific error messages for common issues
            if (errorMessage.includes('timeout')) {
              userMessage = '⏰ Request timed out. This can happen with slow networks. Please try again.';
            } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
              userMessage = '🌐 Network error occurred. Please check your connection and try again.';
            } else if (errorMessage.includes('ENOENT') || errorMessage.includes('file')) {
              userMessage = '📁 File access error. Please try generating new content.';
            } else if (errorMessage.includes('insufficient')) {
              userMessage = '💰 Insufficient balance. Please buy more stars to continue.';
            } else if (errorMessage.includes('ENOMEM') || errorMessage.includes('memory')) {
              userMessage = '🧠 Server is under heavy load. Please try again in a few minutes.';
            }

            await bot.telegram.sendMessage(chatId, userMessage);
          } catch (notificationError) {
            console.error('[ImageWorker] Error sending error notification:', notificationError);
          }
        }
      });
    } catch (workerError) {
      console.error('Failed to start BullMQ image generation worker:', workerError);
    }

    console.log('About to launch bot...');
    // Set the bot's description (shown above the START button) and short description
    await bot.telegram.setMyDescription(
      '🚀 BrandForge Bot 🤖\n'
      + 'AI Logo & Branding\n'
      + '�� Blockchain-ready\n'
      + '✨ SuperAgent Labs'
    );
    const shortDescription = process.env.TESTING === 'true'
      ? '🧪 BETA - Instalogo Bot — FREE AI Logo Generator'
      : 'BrandForge Bot — AI Crypto Logo';

    await bot.telegram.setMyShortDescription(shortDescription);

    // Check if we're in production with webhook URL
    const isProduction = process.env.NODE_ENV === 'production';
    const webhookUrl = process.env.WEBHOOK_URL;
    const port = parseInt(process.env.PORT || '3000', 10);

    if (isProduction && webhookUrl) {
      console.log('🌐 Starting in WEBHOOK mode (production)');

      // Create Express app for webhook
      const app = express();
      app.use(express.json());

      // Health check endpoint
      app.get('/health', async (req, res) => {
        try {
          const botInfo = await bot.telegram.getMe();
          res.json({
            status: 'healthy',
            bot: {
              username: botInfo.username,
              id: botInfo.id,
              first_name: botInfo.first_name
            },
            server: {
              uptime: process.uptime(),
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

      // Webhook endpoint
      app.post(`/webhook/${process.env.BOT_TOKEN}`, (req, res) => {
        try {
          bot.handleUpdate(req.body, res);
        } catch (error) {
          console.error('Webhook error:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      });

      // Root endpoint
      app.get('/', (req, res) => {
        res.json({
          status: 'ok',
          service: 'Instalogo Bot',
          mode: 'webhook',
          timestamp: new Date().toISOString()
        });
      });

      // Set webhook with verification
      try {
        const webhookResult = await bot.telegram.setWebhook(webhookUrl);
        console.log(`✅ Webhook set to: ${webhookUrl}`);
        console.log('Webhook result:', webhookResult);

        // Verify webhook was actually set
        setTimeout(async () => {
          try {
            const webhookInfo = await bot.telegram.getWebhookInfo();
            console.log('Webhook verification:', webhookInfo);
            if (!webhookInfo.url) {
              console.error('⚠️ WARNING: Webhook URL is empty - attempting to set again');
              await bot.telegram.setWebhook(webhookUrl);
            }
          } catch (verifyError) {
            console.error('Error verifying webhook:', verifyError);
          }
        }, 2000);

        // Start Express server
        app.listen(port, () => {
          console.log(`🚀 Webhook server running on port ${port}`);
        });

      } catch (error) {
        console.error('❌ Failed to set webhook:', error);
        throw error;
      }

    } else {
      console.log('📡 Starting in POLLING mode (development)');
      try {
        await bot.launch();
        console.log('✅ Bot launched with polling');
      } catch (err) {
        console.error('❌ Error launching bot:', err);
        throw err;
      }
    }

    // Enable graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Failed to start bot:', errorMessage);
    process.exit(1);
  }
};

bot.action('my_history', async (ctx) => {
  await ctx.answerCbQuery();
  const user = ctx.dbUser;
  if (!user) {
    await ctx.reply('User not found.');
    return;
  }

  // First offer history options
  await ctx.reply(ctx.i18n.t('history.what_to_view'), {
    reply_markup: {
      inline_keyboard: [
        [
          { text: ctx.i18n.t('history.recent_all'), callback_data: 'history_all' },
        ],
        [
          { text: ctx.i18n.t('history.logo_history'), callback_data: 'history_logo' },
          { text: ctx.i18n.t('history.sticker_history'), callback_data: 'history_sticker' }
        ],
        [
          { text: ctx.i18n.t('history.meme_history'), callback_data: 'history_meme' },
          { text: ctx.i18n.t('history.star_transactions'), callback_data: 'history_stars' }
        ],
        [
          { text: ctx.i18n.t('history.back_to_menu'), callback_data: 'back_to_menu' }
        ]
      ]
    }
  });
});

// Handle specific history type requests
bot.action(/history_(\w+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const historyType = ctx.match[1];
  const user = ctx.dbUser;
  if (!user) {
    await ctx.reply('User not found.');
    return;
  }

  // Define query type to allow any properties for MongoDB
  let query: Record<string, any> = { userId: user.userId };
  let title = 'Generation History';

  if (historyType === 'logo') {
    query = { userId: user.userId, type: 'logo' };
    title = 'Logo Generation History';
  } else if (historyType === 'sticker') {
    query = { userId: user.userId, type: 'sticker' };
    title = 'Sticker Generation History';
  } else if (historyType === 'meme') {
    query = { userId: user.userId, type: 'meme' };
    title = 'Meme Generation History';
  } else if (historyType === 'stars') {
    // In a real implementation, you would have a separate star transaction log
    await ctx.reply('Star Transaction History feature coming soon!');
    return;
  }

  const history = await ImageGeneration.find(query).sort({ _id: -1 }).limit(10);
  if (!history.length) {
    await ctx.reply(`No ${historyType === 'all' ? '' : historyType + ' '}generation history found.`);
    return;
  }

  let totalCost = 0;
  let msg = `*${title}* (Last 10)\n\n`;

  const inlineKeyboard = [];

  for (let i = 0; i < history.length; i++) {
    const item = history[i];
    const date = new Date(item._id.getTimestamp()).toLocaleDateString();
    totalCost += item.cost;
    msg += `• *${item.type.charAt(0).toUpperCase() + item.type.slice(1)}*`;
    if (item.type === 'meme' && item.quality) {
      msg += ` (${item.quality})`;
    }
    msg += ` - ${item.cost}⭐ - ${date}`;

    // Add a row with View Image button for each item
    if (item.imageUrl) {
      // Check if URL is a localhost URL (which Telegram doesn't allow)
      const isLocalUrl = item.imageUrl.includes('localhost') ||
                         item.imageUrl.includes('127.0.0.1');

      if (!isLocalUrl) {
        inlineKeyboard.push([
          { text: `View ${item.type.charAt(0).toUpperCase() + item.type.slice(1)} #${i+1}`, url: item.imageUrl }
        ]);
      } else {
        // For local development, just add the URL as text (not clickable)
        msg += `\n  Image URL: ${item.imageUrl} (local development)`;
      }
    }

    msg += '\n\n';
  }

  msg += `Total spent: *${totalCost}⭐*`;

  // Add navigation buttons at the end
  inlineKeyboard.push(
    [{ text: 'Back to History', callback_data: 'my_history' }],
    [{ text: 'Back to Menu', callback_data: 'back_to_menu' }]
  );

  await ctx.reply(msg, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: inlineKeyboard
    }
  });
});

// Handle back to menu
bot.action('back_to_menu', async (ctx) => {
  await ctx.answerCbQuery();
  await sendMainMenu(ctx);
});

// Add the buy_stars action handler and detailed history
bot.action('buy_stars', async (ctx) => {
  await ctx.answerCbQuery();

  // First, force exit any active scene to avoid getting stuck
  await forceLeaveCurrentScene(ctx);

  const user = ctx.dbUser;
  if (!user) {
    await ctx.reply('User not found.');
    return;
  }

  await ctx.reply(ctx.i18n.t('stars.choose_amount'), {
    reply_markup: {
      inline_keyboard: [
        [
          { text: ctx.i18n.t('stars.stars_100'), callback_data: 'buy_stars_100' },
          { text: ctx.i18n.t('stars.stars_500'), callback_data: 'buy_stars_500' }
        ],
        [
          { text: ctx.i18n.t('stars.stars_1000'), callback_data: 'buy_stars_1000' },
          { text: ctx.i18n.t('stars.stars_2500'), callback_data: 'buy_stars_2500' }
        ],
        [
          { text: ctx.i18n.t('history.back_to_menu'), callback_data: 'back_to_menu' }
        ]
      ]
    }
  });
});

// Add handlers for each star purchase option
bot.action(/buy_stars_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  // Make sure we're not in any scene
  await forceLeaveCurrentScene(ctx);

  const starsAmount = parseInt(ctx.match[1]);

  // Calculate price based on star amount
  let price;
  switch(starsAmount) {
    case 100: price = 499; break;    // $4.99
    case 500: price = 1999; break;   // $19.99
    case 1000: price = 3499; break;  // $34.99
    case 2500: price = 6999; break;  // $69.99
    default: price = 499;
  }

  // Create an invoice with TON support
  const invoice = {
    title: `${starsAmount} Stars`,
    description: `Purchase ${starsAmount} ⭐ stars for your Crypto AI Images`,
    payload: `stars_${starsAmount}_${ctx.from.id}_${Date.now()}`,
    provider_token: process.env.PROVIDER_TOKEN || '',
    currency: 'USD',
    prices: [{ label: `${starsAmount} Stars`, amount: price }],
    start_parameter: `buy_stars_${starsAmount}`,
  };

  try {
    await ctx.replyWithInvoice(invoice);
  } catch (error) {
    console.error('Payment error:', error);
    await ctx.reply(ctx.i18n.t('stars.payment_unavailable'));
  }
});

// Handle successful payments
bot.on('pre_checkout_query', async (ctx) => {
  // Allow all payments to go through
  await ctx.answerPreCheckoutQuery(true);
});

bot.on('successful_payment', async (ctx) => {
  const payload = ctx.message.successful_payment.invoice_payload;
  const [type, amount, userId] = payload.split('_');

  if (type === 'stars' && amount && userId) {
    const starsAmount = parseInt(amount);

    try {
      // Update user's star balance
      const user = await User.findOne({ userId: parseInt(userId) });
      if (user) {
        user.starBalance += starsAmount;
        await user.save();
        await ctx.reply(ctx.i18n.t('stars.payment_successful', { amount: starsAmount, balance: user.starBalance }));

        // Force exit from any active scene to prevent being stuck in the loop
        await forceLeaveCurrentScene(ctx);
        // Add a helpful message about the /cancel command
        await ctx.reply(ctx.i18n.t('general.stuck_help'));
        // Show the main menu after successful payment
        await sendMainMenu(ctx);
      } else {
        await ctx.reply(ctx.i18n.t('stars.user_not_found'));
      }
    } catch (error) {
      console.error('Error updating user balance after payment:', error);
      await ctx.reply(ctx.i18n.t('stars.error_updating'));
      // Still try to exit any scene even if there was an error
      await forceLeaveCurrentScene(ctx);
      await sendMainMenu(ctx);
    }
  }
});

// 1. Sticker selection toggle handler
bot.action(/toggle_select_sticker_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const stickerId = ctx.match[1];
  if (!(ctx.session as any).selectedStickers) (ctx.session as any).selectedStickers = [];
  const selectedStickers: string[] = (ctx.session as any).selectedStickers;
  const idx = selectedStickers.indexOf(stickerId);
  let selected = false;
  if (idx === -1) {
    selectedStickers.push(stickerId);
    selected = true;
  } else {
    selectedStickers.splice(idx, 1);
    selected = false;
  }
  // Update the button text
  const newText = selected ? '✅ Selected' : 'Select for Pack';
  try {
    await ctx.editMessageReplyMarkup({
      inline_keyboard: [[{ text: newText, callback_data: `toggle_select_sticker_${stickerId}` }]]
    });
  } catch (e) {
    // Ignore if message is not modified
  }
});

// 2. Finish selection and add to pack handler
bot.action('finish_add_stickers', async (ctx) => {
  await ctx.answerCbQuery();
  const selected: string[] = (ctx.session as any).selectedStickers || [];
  if (!selected.length) {
    await ctx.reply('No stickers selected. Please select at least one sticker.');
    return;
  }
  // Fetch sticker image local paths from DB
  const stickers = await Promise.all(selected.map(async (id: string) => {
    const doc = await ImageGeneration.findById(id);
    return doc?.localPath || doc?.imageUrl;
  }));
  const validStickers = stickers.filter(Boolean);
  if (!validStickers.length) {
    await ctx.reply('Could not find selected stickers.');
    return;
  }
  // Create or add to the sticker pack
  // Build a valid sticker set name per Telegram rules:
  // - Only latin letters, digits, underscores
  // - Total length <= 64
  // - Must end with `_by_<bot_username>` where <bot_username> is EXACT
  const userSlug = (ctx.from.username || ctx.from.id).toString().toLowerCase();
  const baseRaw = `starter_pack_${userSlug}`;
  const suffix = RESOLVED_BOT_USERNAME ? `_by_${RESOLVED_BOT_USERNAME}` : '';
  const baseSanitized = baseRaw.replace(/[^a-zA-Z0-9_]/g, '_');
  const maxBaseLen = Math.max(1, 64 - suffix.length);
  const clippedBase = baseSanitized.slice(0, maxBaseLen);
  const packName = `${clippedBase}${suffix}`;
  const packTitle = `Starter Pack by ${ctx.from.first_name || 'User'}`;
  const emojis = '😎';
  try {
    // Try to create the pack with the first sticker
    await createTelegramStickerPack(
      bot,
      ctx.from.id,
      packName,
      packTitle,
      validStickers[0],
      emojis
    );
    // Add the rest
    for (let i = 1; i < validStickers.length; i++) {
      await addStickerToPack(
        bot,
        ctx.from.id,
        packName,
        validStickers[i],
        emojis
      );
    }
    await ctx.reply(
      `Your sticker pack is ready! [View it here](https://t.me/addstickers/${packName})`,
      { parse_mode: 'Markdown' }
    );
  } catch (e: any) {
    // If pack exists, just add all
    if (e && e.description && e.description.includes('sticker set name is already occupied')) {
      try {
        for (let i = 0; i < validStickers.length; i++) {
          await addStickerToPack(
            bot,
            ctx.from.id,
            packName,
            validStickers[i],
            emojis
          );
        }
        await ctx.reply(
          `Your sticker pack is ready! [View it here](https://t.me/addstickers/${packName})`,
          { parse_mode: 'Markdown' }
        );
      } catch (addErr) {
        await ctx.reply('Failed to add stickers to your existing pack. Make sure your images are PNG, 512x512, and less than 512KB.');
      }
    } else {
      await ctx.reply('Failed to create or update your sticker pack. Please try again.');
    }
  }
});

// Add this after the callback handlers setup
bot.action('change_language', async (ctx) => {
  await ctx.answerCbQuery();
  // Reuse the language command logic
  await bot.telegram.sendMessage(
    ctx.from.id,
    'Please select your language / Por favor, selecciona tu idioma / Выберите язык / Choisissez votre langue / 请选择您的语言:',
    {
      reply_markup: {
        // @ts-ignore - Custom method added to i18n instance
        inline_keyboard: i18n.getAvailableLanguages().map((code: string) => {
          const languageNames: Record<string, string> = {
            'en': 'English 🇬🇧',
            'es': 'Español 🇪🇸',
            'ru': 'Русский 🇷🇺',
            'fr': 'Français 🇫🇷',
            'zh': '中文 🇨🇳'
          };
          return [Markup.button.callback(languageNames[code] || code, `set_lang:${code}`)];
        })
      }
    }
  );
});

// Update the memes_start action handler to only enter the memeWizard
bot.action('memes_start', async (ctx) => {
  await ctx.answerCbQuery();

  // First make sure we leave any active scene and clean up the session
  await forceLeaveCurrentScene(ctx);

  // Add a flag to indicate we're coming from the Start Meme Flow button
  (ctx.session as any).__fromMemeStart = true;

  // Enter the meme wizard scene
  await ctx.scene.enter('memeWizard');
});

// Add referral menu handler
bot.action('referral_menu', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    let stats = await mongodbService.getReferralStats(userId);

    // Generate referral code if user doesn't have one
    if (!stats.referralCode) {
      const newCode = await mongodbService.generateReferralCode(userId);
      if (newCode) {
        stats.referralCode = newCode;
      }
    }

    if (stats.referralCode) {
      const referralLink = `https://t.me/${ctx.botInfo.username}?start=${stats.referralCode}`;

      await ctx.editMessageText(
        `🔗 *Your Referral Program*\n\n` +
        `📋 *Your Referral Link:*\n\`${referralLink}\`\n\n` +
        `📊 *Your Stats:*\n` +
        `• Referrals: ${stats.referralCount}\n` +
        `• Total Rewards: ${stats.totalRewards} ⭐\n\n` +
        `💰 *Rewards:*\n` +
        `• You get: 20 ⭐ when they use the bot\n` +
        `• They get: No bonus (fair pricing for all)\n\n` +
        `Share your link and earn stars! 🚀`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📤 Share Link', url: `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('🎨 Join me on BrandForge Bot! Create amazing logos, memes, and stickers with AI.')}` }],
              [{ text: '🏠 Back to Menu', callback_data: 'back_to_menu' }]
            ]
          }
        }
      );
    } else {
      await ctx.reply('❌ Error generating referral code. Please try again later.');
    }
  } catch (error) {
    console.error('Error in referral menu:', error);
    await ctx.reply('❌ Error accessing referral system. Please try again later.');
  }
});

// ============================================================================
// FEEDBACK COLLECTION HANDLERS FOR DSPY LEARNING
// ============================================================================

// Handle feedback: like/dislike
bot.action(/feedback_(like|dislike)_(\d+)_(\d+)_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const [, action, userId, timestamp, logoIndex] = ctx.match;
  const interactionType = action; // 'like' or 'dislike'

  try {
    // Get the session data and prompt used for this generation
    const user = await User.findOne({ userId: parseInt(userId) });
    if (!user) return;

    // Find the recent logo generation
    const recentGeneration = await ImageGeneration.findOne({
      userId: parseInt(userId),
      type: 'logo',
      createdAt: { $gte: new Date(parseInt(timestamp) - 300000) } // Within 5 minutes
    }).sort({ createdAt: -1 });

    if (recentGeneration) {
      // Log feedback for future analysis
      console.log(`[Feedback] User ${userId} ${interactionType}d logo ${logoIndex}`);
    }

    // Update the message to show feedback was recorded
    const emoji = action === 'like' ? '👍' : '👎';
    await ctx.editMessageReplyMarkup({
      inline_keyboard: [
        [
          { text: action === 'like' ? '👍 Liked!' : '👍 Like', callback_data: `feedback_like_${userId}_${timestamp}_${logoIndex}` },
          { text: action === 'dislike' ? '👎 Disliked!' : '👎 Dislike', callback_data: `feedback_dislike_${userId}_${timestamp}_${logoIndex}` }
        ],
        [
          { text: '✅ Select This Logo', callback_data: `select_logo_${userId}_${timestamp}_${logoIndex}` },
          { text: '🔄 Regenerate', callback_data: `regenerate_logo_${logoIndex}` }
        ]
      ]
    });

  } catch (error) {
    console.error('[Feedback] Error collecting feedback:', error);
  }
});

// Handle logo selection and generate complete professional package
bot.action(/select_logo_(\d+)_(\d+)_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const [, userId, timestamp, logoIndex] = ctx.match;
  const userIdNum = parseInt(userId);
  const logoIndexNum = parseInt(logoIndex);

  console.log(`[LogoSelection] User ${userId} selected logo ${logoIndex}`);

  try {
    // Find the generation data from session or database
    const user = await User.findOne({ userId: userIdNum });
    if (!user) {
      await ctx.reply('❌ User not found. Please try generating logos again.');
      return;
    }

    // Get the generation record
    const generationRecord = await ImageGeneration.findOne({
      userId: userIdNum,
      timestamp: new Date(parseInt(timestamp)),
      type: 'logo'
    });

    if (!generationRecord) {
      await ctx.reply('❌ Generation not found. Please try generating logos again.');
      return;
    }

    // Show processing message
    await ctx.editMessageReplyMarkup({
      inline_keyboard: [
        [
          { text: '⏳ Generating Complete Package...', callback_data: 'processing' }
        ]
      ]
    });

    await ctx.reply(
      `🎉 *Logo Selected!*\n\n` +
      `🎨 Generating your complete professional logo package...\n\n` +
      `This includes:\n` +
      `• Color variants (transparent, white, black)\n` +
      `• Size variants (favicon to print)\n` +
      `• Vector formats (SVG, PDF, EPS)\n` +
      `• Social media assets\n\n` +
      `⏳ Please wait while we create your professional package...`,
      { parse_mode: 'Markdown' }
    );

    // Generate complete package with timeout and retry logic
    try {
      const timeoutMs = 120000; // 2 minutes timeout
      const completePackage = await Promise.race([
        completeAssetGenerationService.generateCompletePackage({
          brandName: generationRecord.generationMetadata?.brandName || 'Your Brand',
          originalImageUrl: generationRecord.imageUrl, // Use the original selected logo URL
          userId: userIdNum.toString(),
          sessionId: generationRecord.generationMetadata?.sessionId || `complete-${userIdNum}-${Date.now()}`
        }),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Complete package generation timed out')), timeoutMs);
        })
      ]) as any;

      console.log(`[LogoSelection] Generated complete package for user ${userId}:`, {
        colorVariants: ['transparent', 'white', 'black'],
        sizes: Object.keys(completePackage.sizes),
        vectorFormats: completePackage.svg ? ['svg', 'pdf', 'eps'] : [],
        zipUrl: completePackage.zipUrl
      });

      // Store complete package in session
      if (!ctx.session) ctx.session = {} as any;
      (ctx.session as any).selectedLogo = {
        userId: userIdNum,
        timestamp: parseInt(timestamp),
        logoIndex: logoIndexNum,
        completePackage
      };

      // Show success message with download options
      await ctx.reply(
        `🎉 *Complete Professional Logo Package Ready!*\n\n` +
        `Your logo package includes:\n\n` +
        `📏 *Size Variants:*\n` +
        `• Favicon: 16px, 32px, 48px, 64px\n` +
        `• Web: 192px, 512px\n` +
        `• Social: 400px, 800px, 1080px\n` +
        `• Print: 1000px, 2000px, 3000px\n\n` +
        `🎯 *Specialized Icons:*\n` +
        `• AI-generated icon-only versions\n` +
        `• Optimized for different platforms\n` +
        `• Clean, text-free designs\n\n` +
        `Choose your download option:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📦 Download Complete Package (ZIP) - 50⭐', callback_data: `download_complete_package_${userId}_${timestamp}_${logoIndex}` }
              ],
              [
                { text: '📏 Size Variants', callback_data: `download_sizes_${userId}_${timestamp}_${logoIndex}` },
                { text: '🎯 Specialized Icons', callback_data: `download_icons_${userId}_${timestamp}_${logoIndex}` }
              ],
              [
                { text: '🔄 Generate More Variants', callback_data: `back_to_variants_${userId}_${timestamp}_${logoIndex}` }
              ],
              [
                { text: '🏠 Back to Menu', callback_data: 'back_to_menu' }
              ]
            ]
          }
        }
      );

    } catch (packageError) {
      console.error('[LogoSelection] Error generating complete package:', packageError);

      // Determine error type and provide appropriate message
      let errorMessage = "❌ Error generating complete package. Falling back to basic variants...";
      if (packageError instanceof Error) {
        if (packageError.message.includes('timed out')) {
          errorMessage = "⏰ Complete package generation timed out. This can happen with large images or slow networks.";
        } else if (packageError.message.includes('fetch')) {
          errorMessage = "🌐 Network error during package generation. Please try again.";
        } else if (packageError.message.includes('ENOENT') || packageError.message.includes('file')) {
          errorMessage = "📁 File access error. The logo may have been removed.";
        }
      }

      // Set up basic session data for downloads even when complete package fails
      try {
        if (!ctx.session) ctx.session = {} as any;
        (ctx.session as any).selectedLogo = {
          userId: userIdNum,
          timestamp: parseInt(timestamp),
          logoIndex: logoIndexNum,
          completePackage: {
            brandName: generationRecord.generationMetadata?.brandName || 'Your Brand',
            // Set empty sizes and formats since complete package failed
            sizes: {},
            svg: null,
            zipUrl: null,
            error: packageError instanceof Error ? packageError.message : 'Unknown error'
          }
        };
      } catch (sessionError) {
        console.error('[LogoSelection] Error setting up session fallback:', sessionError);
      }

      try {
        await ctx.reply(
          `${errorMessage}\n\n` +
          `You can still create basic variants of your selected logo:`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🖼️ Standard', callback_data: `generate_variant_standard_${userId}_${timestamp}_${logoIndex}` },
                  { text: '✨ Transparent', callback_data: `generate_variant_transparent_${userId}_${timestamp}_${logoIndex}` }
                ],
                [
                  { text: '⬜ White Background', callback_data: `generate_variant_white_${userId}_${timestamp}_${logoIndex}` },
                  { text: '🔠 Icon Only', callback_data: `generate_variant_icon_${userId}_${timestamp}_${logoIndex}` }
                ],
                [
                  { text: '🔄 Try Complete Package Again', callback_data: `select_logo_${userId}_${timestamp}_${logoIndex}` }
                ],
                [
                  { text: '🏠 Back to Menu', callback_data: 'back_to_menu' }
                ]
              ]
            }
          }
        );
      } catch (replyError) {
        console.error('[LogoSelection] Error sending fallback message:', replyError);

        // Try a simple fallback message
        try {
          await ctx.reply('❌ Error occurred. Please use /menu to restart.');
        } catch (finalError) {
          console.error('[LogoSelection] Final fallback message failed:', finalError);
        }
      }
    }

  } catch (error) {
    console.error('[LogoSelection] Error handling logo selection:', error);
    await ctx.reply('❌ Error processing your selection. Please try again.');
  }
});

// Handle variant generation
bot.action(/generate_variant_(standard|transparent|white|icon)_(\d+)_(\d+)_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const [, variantType, userId, timestamp, logoIndex] = ctx.match;
  const userIdNum = parseInt(userId);
  const logoIndexNum = parseInt(logoIndex);

  console.log(`[VariantGeneration] User ${userId} requesting ${variantType} variant for logo ${logoIndex}`);

  try {
    // Get user from database
    const user = await User.findOne({ userId: userIdNum });
    if (!user) {
      await ctx.reply('❌ User not found. Please try generating logos again.');
      return;
    }

    // For standard variant, just use the already generated logo
    if (variantType === 'standard') {
      // Get the stored generation data from database
      const generationRecord = await ImageGeneration.findOne({
        userId: userIdNum,
        type: 'logo',
        generationMetadata: { $exists: true }
      }).sort({ timestamp: -1 }); // Get most recent generation

      if (!generationRecord || !generationRecord.imageUrls || !generationRecord.imageUrls[logoIndexNum]) {
        await ctx.reply('❌ Logo not found. Please generate new logos first.');
        return;
      }

      // Use the already generated logo
      const logoUrl = generationRecord.imageUrls[logoIndexNum];

      await ctx.replyWithPhoto(
        logoUrl,
        {
          caption: `🖼️ Standard Logo\n\nThis is your original generated logo - no additional processing needed!`,
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📥 Download Original', url: logoUrl }
              ],
              [
                { text: '🔄 Back to Variants', callback_data: `back_to_variants_${userId}_${timestamp}_${logoIndex}` }
              ]
            ]
          }
        }
      );
      return;
    }

    // For other variants, show processing message
    await ctx.reply(`🎨 Generating ${variantType} variant... This may take a moment.`);

    // Get the stored generation data from database
    const generationRecord = await ImageGeneration.findOne({
      userId: userIdNum,
      type: 'logo',
      generationMetadata: { $exists: true }
    }).sort({ timestamp: -1 }); // Get most recent generation

    if (!generationRecord || !generationRecord.generationMetadata?.allSeeds) {
      await ctx.reply('❌ Generation data not found. Please generate new logos first.');
      return;
    }

    // Get the seed for the selected logo
    const selectedSeed = generationRecord.generationMetadata.allSeeds[logoIndexNum] ||
                        generationRecord.seed ||
                        Math.floor(Math.random() * 1000000);

    console.log(`[VariantGeneration] Using seed ${selectedSeed} for logo ${logoIndexNum}`);

    // Generate the variant using LogoVariantService with the correct seed
    const generationData = {
      userId: userIdNum,
      sessionId: generationRecord.generationMetadata.sessionId || `variant-${userIdNum}-${Date.now()}`,
      originalPrompt: generationRecord.originalPrompt || `Professional logo design for brand`,
      selectedImageIndex: logoIndexNum,
      brandName: generationRecord.generationMetadata.brandName || 'Your Brand',
      seed: selectedSeed // Use the stored seed
    };

    const selectedVariants = [variantType as 'standard' | 'transparent' | 'white' | 'icon'];
    const variants = await logoVariantService.generateVariants(generationData, selectedVariants);
    const variantUrl = variants[variantType];

    if (variantUrl) {
      // Fetch the variant image for sending
      try {
        const response = await fetch(variantUrl);
        const arrayBuffer = await response.arrayBuffer();
        const variantBuffer = Buffer.from(arrayBuffer);

        // Send preview as photo
        await ctx.replyWithPhoto(
          { source: variantBuffer },
          {
            caption: `📸 Preview: ${variantType.charAt(0).toUpperCase() + variantType.slice(1)} variant generated!`,
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🔄 Generate Another Variant', callback_data: `back_to_variants_${userId}_${timestamp}_${logoIndex}` },
                  { text: '🏠 Back to Menu', callback_data: 'back_to_menu' }
                ]
              ]
            }
          }
        );

        // Send original PNG as document for download
        await ctx.replyWithDocument(
          {
            source: variantBuffer,
            filename: `${generationData.brandName?.replace(/\s+/g, '-').toLowerCase() || 'logo'}-${variantType}.png`
          },
          {
            caption: `📥 Download: ${variantType.charAt(0).toUpperCase() + variantType.slice(1)} Variant (PNG Format)\n\nHigh-quality PNG with ${variantType === 'transparent' ? 'transparent' : variantType === 'white' ? 'white' : 'transparent'} background - perfect for professional use!`,
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🔄 Generate Another Variant', callback_data: `back_to_variants_${userId}_${timestamp}_${logoIndex}` },
                  { text: '🏠 Back to Menu', callback_data: 'back_to_menu' }
                ]
              ]
            }
          }
        );

      } catch (fetchError) {
        console.error('[VariantGeneration] Error fetching variant image:', fetchError);
        await ctx.reply('❌ Error processing variant image. Please try again.');
      }
    } else {
      await ctx.reply('❌ Failed to generate variant. Please try again.');
    }

  } catch (error) {
    console.error('[VariantGeneration] Error generating variant:', error);
    await ctx.reply('❌ Error generating variant. Please try again later.');
  }
});

// Handle generate all variants
bot.action(/generate_all_variants_(\d+)_(\d+)_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const [, userId, timestamp, logoIndex] = ctx.match;
  const userIdNum = parseInt(userId);
  const logoIndexNum = parseInt(logoIndex);

  console.log(`[VariantGeneration] User ${userId} generating all variants for logo ${logoIndex}`);

  try {
    // Get user from database
    const user = await User.findOne({ userId: userIdNum });
    if (!user) {
      await ctx.reply('❌ User not found. Please try generating logos again.');
      return;
    }

    // Show processing message
    await ctx.reply(`🎨 Generating all variants... This may take a few moments.`);

    const variants = ['standard', 'transparent', 'white', 'icon'];
    const results = [];

    for (const variantType of variants) {
      try {
        const generationData = {
          userId: userIdNum,
          sessionId: `variant-${userIdNum}-${Date.now()}`,
          originalPrompt: `Professional logo design for brand`,
          selectedImageIndex: logoIndexNum,
          brandName: 'Your Brand'
        };

        const selectedVariants = [variantType as 'standard' | 'transparent' | 'white' | 'icon'];
        const variants = await logoVariantService.generateVariants(generationData, selectedVariants);
        const variantUrl = variants[variantType];

        if (variantUrl) {
          results.push({ type: variantType, url: variantUrl });
        }
      } catch (error) {
        console.error(`[VariantGeneration] Error generating ${variantType}:`, error);
      }
    }

    if (results.length > 0) {
      let message = `🎉 Generated ${results.length} variants:\n\n`;
      for (const result of results) {
        message += `• ${result.type.charAt(0).toUpperCase() + result.type.slice(1)}: ✅\n`;
      }

      await ctx.reply(message, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Generate More Variants', callback_data: `back_to_variants_${userId}_${timestamp}_${logoIndex}` },
              { text: '🏠 Back to Menu', callback_data: 'back_to_menu' }
            ]
          ]
        }
      });

      // Send each variant as both photo preview and document download
      for (const result of results) {
        try {
          const response = await fetch(result.url);
          const arrayBuffer = await response.arrayBuffer();
          const variantBuffer = Buffer.from(arrayBuffer);

          // Send preview as photo
          await ctx.replyWithPhoto(
            { source: variantBuffer },
            {
              caption: `📸 Preview: ${result.type.charAt(0).toUpperCase() + result.type.slice(1)} Variant`
            }
          );

          // Send original PNG as document for download
          await ctx.replyWithDocument(
            {
              source: variantBuffer,
              filename: `logo-${result.type}.png`
            },
            {
              caption: `📥 Download: ${result.type.charAt(0).toUpperCase() + result.type.slice(1)} Variant (PNG Format)\n\nHigh-quality PNG - perfect for professional use!`
            }
          );

        } catch (fetchError) {
          console.error(`[VariantGeneration] Error fetching ${result.type} variant:`, fetchError);
        }
      }
    } else {
      await ctx.reply('❌ Failed to generate any variants. Please try again.');
    }

  } catch (error) {
    console.error('[VariantGeneration] Error generating all variants:', error);
    await ctx.reply('❌ Error generating variants. Please try again later.');
  }
});

// Handle back to variants menu
bot.action(/back_to_variants_(\d+)_(\d+)_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const [, userId, timestamp, logoIndex] = ctx.match;

  await ctx.reply(
    `Choose which variants to generate:`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🖼️ Standard', callback_data: `generate_variant_standard_${userId}_${timestamp}_${logoIndex}` },
            { text: '✨ Transparent', callback_data: `generate_variant_transparent_${userId}_${timestamp}_${logoIndex}` }
          ],
          [
            { text: '⬜ White Background', callback_data: `generate_variant_white_${userId}_${timestamp}_${logoIndex}` },
            { text: '🔠 Icon Only', callback_data: `generate_variant_icon_${userId}_${timestamp}_${logoIndex}` }
          ],
          [
            { text: '🎨 Generate All Variants', callback_data: `generate_all_variants_${userId}_${timestamp}_${logoIndex}` }
          ]
        ]
      }
    }
  );
});

// Handle complete package download
bot.action(/download_complete_package_(\d+)_(\d+)_(\d+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery('Preparing download...');
  } catch (err) {
    console.error('[Download] Error answering callback query:', err);
  }

  const [, userId, timestamp, logoIndex] = ctx.match;
  const userIdNum = parseInt(userId);

  console.log(`[Download] Complete package download requested: userId=${userId}, timestamp=${timestamp}, logoIndex=${logoIndex}`);

  try {
    // Check if we're in testing mode
    const isTestingMode = process.env.NODE_ENV !== 'production' || process.env.BETA_TESTING === 'true';

    if (!isTestingMode) {
      // Production mode - check user balance for 50 credits
      const user = await User.findOne({ userId: userIdNum });
      if (!user) {
        await ctx.reply('❌ User not found. Please try again.');
        return;
      }

      const requiredCredits = 50;
      if (user.starBalance < requiredCredits) {
        await ctx.reply(
          `❌ Insufficient balance!\n\n` +
          `Complete package costs: ${requiredCredits} ⭐\n` +
          `Your balance: ${user.starBalance} ⭐\n\n` +
          `Please top up your balance to download the complete package.`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '💳 Buy Stars', callback_data: 'buy_stars' }],
                [{ text: '🏠 Back to Menu', callback_data: 'back_to_menu' }]
              ]
            }
          }
        );
        return;
      }

      // Deduct credits
      user.starBalance -= requiredCredits;
      await user.save();

      console.log(`[Download] Deducted ${requiredCredits} credits from user ${userIdNum}. New balance: ${user.starBalance}`);
    } else {
      console.log(`[Download] Testing mode - skipping payment for user ${userIdNum}`);
    }

    const selectedLogo = (ctx.session as any)?.selectedLogo;

    console.log(`[Download] Session check: selectedLogo exists=${!!selectedLogo}, completePackage exists=${!!selectedLogo?.completePackage}`);

    if (!selectedLogo || !selectedLogo.completePackage) {
      console.error('[Download] No selectedLogo or completePackage in session');
      await ctx.reply('❌ Complete package not found. Please select a logo again.');
      return;
    }

    const zipUrl = selectedLogo.completePackage.zipUrl;
    console.log(`[Download] ZIP URL: ${zipUrl}`);

    if (!zipUrl) {
      console.error('[Download] ZIP URL is null or undefined');
      await ctx.reply('❌ ZIP package not available. Please try again.');
      return;
    }

    // Handle file:// URLs by reading directly from filesystem
    let zipBuffer: Buffer;
    if (zipUrl.startsWith('file://')) {
      const filePath = zipUrl.replace('file://', '');
      console.log(`[Download] Reading ZIP from file system: ${filePath}`);

      if (!await fs.promises.access(filePath).then(() => true).catch(() => false)) {
        console.error(`[Download] File not found: ${filePath}`);
        await ctx.reply('❌ ZIP file not found. It may have been deleted. Please generate a new logo.');
        return;
      }

      zipBuffer = await fs.promises.readFile(filePath);
      console.log(`[Download] Read ${zipBuffer.length} bytes from file system`);
    } else {
      // Handle HTTP URLs with fetch
      console.log(`[Download] Fetching ZIP from URL: ${zipUrl}`);
      const response = await fetch(zipUrl);

      if (!response.ok) {
        console.error(`[Download] Fetch failed: ${response.status} ${response.statusText}`);
        await ctx.reply(`❌ Failed to download package: ${response.statusText}`);
        return;
      }

      zipBuffer = Buffer.from(await response.arrayBuffer());
      console.log(`[Download] Downloaded ${zipBuffer.length} bytes from URL`);
    }

    console.log(`[Download] Sending ZIP document to user...`);

    // Check testing mode for display
    const isTestingModeDisplay = process.env.NODE_ENV !== 'production' || process.env.BETA_TESTING === 'true';

    await ctx.replyWithDocument(
      {
        source: zipBuffer,
        filename: `Complete_Logo_Package_${selectedLogo.completePackage.brandName || 'logo'}.zip`
      },
      {
        caption: `📦 *Complete Professional Logo Package*\n\n` +
        `Your complete logo package includes:\n` +
        `• Color variants (transparent, white, black)\n` +
        `• Size variants (favicon to print)\n` +
        `• Vector formats (SVG, PDF, EPS)\n` +
        `• Social media assets\n\n` +
        `${isTestingModeDisplay ? '🧪 Testing Mode - FREE!' : '💰 Cost: 50⭐'}\n` +
        `Perfect for professional use! 🚀`,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🏠 Back to Menu', callback_data: 'back_to_menu' }
            ]
          ]
        }
      }
    );

    console.log(`[Download] ZIP document sent successfully`);

  } catch (error) {
    console.error('[Download] Error downloading complete package:', error);
    await ctx.reply(`❌ Error downloading complete package: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`);
  }
});

// Handle specialized icons download
bot.action(/download_icons_(\d+)_(\d+)_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const [, userId, timestamp, logoIndex] = ctx.match;

  try {
    const selectedLogo = (ctx.session as any)?.selectedLogo;
    if (!selectedLogo || !selectedLogo.completePackage) {
      await ctx.reply('❌ Specialized icons not found. Please select a logo again.');
      return;
    }

    // Get the complete package ZIP URL and download it
    const logoPackage = selectedLogo.completePackage;
    if (logoPackage.zipUrl) {
      const response = await fetch(logoPackage.zipUrl);
      const buffer = Buffer.from(await response.arrayBuffer());

      await ctx.replyWithDocument(
        {
          source: buffer,
          filename: `specialized_icons_${logoPackage.brandName || 'logo'}.zip`
        },
        {
          caption: `🎯 Specialized Icons Package\n\nAI-generated icon-only versions optimized for different platforms:\n• Favicon (64x64)\n• App Icon (512x512)\n• Social Media (400x400)\n• Print (1000x1000)`
        }
      );
    } else {
      await ctx.reply('❌ Specialized icons package not available. Please try again.');
    }

  } catch (error) {
    console.error('[Download] Error downloading specialized icons:', error);
    await ctx.reply('❌ Error downloading specialized icons. Please try again.');
  }
});

// Handle size variants download
bot.action(/download_sizes_(\d+)_(\d+)_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const [, userId, timestamp, logoIndex] = ctx.match;

  try {
    const selectedLogo = (ctx.session as any)?.selectedLogo;
    if (!selectedLogo || !selectedLogo.completePackage) {
      await ctx.reply('❌ Size variants not found. Please select a logo again.');
      return;
    }

    const logoPackage = selectedLogo.completePackage;
    const sizeCategories = Object.entries(logoPackage.sizes);

    for (const [category, urls] of sizeCategories) {
      if (Array.isArray(urls) && urls.length > 0) {
        await ctx.reply(`📏 *${category.charAt(0).toUpperCase() + category.slice(1)} Sizes:*`);

        for (let i = 0; i < urls.length; i++) {
          try {
            const response = await fetch(urls[i]);
            const buffer = Buffer.from(await response.arrayBuffer());

            // Extract size from filename or use category info
            const size = category === 'favicon' ? [16, 32, 48, 64][i] :
                        category === 'web' ? [192, 512][i] :
                        category === 'social' ? [400, 800, 1080][i] :
                        category === 'print' ? [1000, 2000, 3000][i] : 'unknown';

            await ctx.replyWithDocument(
              {
                source: buffer,
                filename: `logo_${size}x${size}.png`
              },
              {
                caption: `📏 ${size}x${size}px - ${category.charAt(0).toUpperCase() + category.slice(1)} Size`
              }
            );
          } catch (fetchError) {
            console.error(`[Download] Error fetching size variant:`, fetchError);
          }
        }
      }
    }

  } catch (error) {
    console.error('[Download] Error downloading size variants:', error);
    await ctx.reply('❌ Error downloading size variants. Please try again.');
  }
});

// Handle vector formats download
bot.action(/download_vectors_(\d+)_(\d+)_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const [, userId, timestamp, logoIndex] = ctx.match;

  try {
    const selectedLogo = (ctx.session as any)?.selectedLogo;
    if (!selectedLogo || !selectedLogo.completePackage) {
      await ctx.reply('❌ Vector formats not found. Please select a logo again.');
      return;
    }

    const logoPackage = selectedLogo.completePackage;
    const vectorFormats = [
      { name: 'SVG', url: logoPackage.svg, filename: 'logo.svg' },
      { name: 'PDF', url: logoPackage.pdf, filename: 'logo.pdf' },
      { name: 'EPS', url: logoPackage.eps, filename: 'logo.eps' }
    ];

    let hasAnyFormat = false;

    for (const format of vectorFormats) {
      if (format.url) {
        hasAnyFormat = true;
        try {
          const response = await fetch(format.url);
          const buffer = Buffer.from(await response.arrayBuffer());

          await ctx.replyWithDocument(
            {
              source: buffer,
              filename: format.filename
            },
            {
              caption: `📐 ${format.name} Vector Format\n\n` +
              `Perfect for ${format.name === 'SVG' ? 'web and scalable graphics' :
                          format.name === 'PDF' ? 'print and documents' :
                          'professional printing and design'}!`
            }
          );
        } catch (fetchError) {
          console.error(`[Download] Error fetching ${format.name}:`, fetchError);
        }
      }
    }

    if (!hasAnyFormat) {
      await ctx.reply('❌ Vector formats not available. Using high-quality PNGs instead.');
    }

  } catch (error) {
    console.error('[Download] Error downloading vector formats:', error);
    await ctx.reply('❌ Error downloading vector formats. Please try again.');
  }
});

// Handle back to menu
bot.action('back_to_menu', async (ctx) => {
  await ctx.answerCbQuery();
  await sendMainMenu(ctx);
});

// Handle regenerate feedback
bot.action(/regenerate_logo_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery('Regenerating logo...');

  const logoIndex = parseInt(ctx.match[1]);
  const userId = ctx.from?.id;

  try {
    // Log regenerate feedback (indicates dissatisfaction)
    console.log(`[Feedback] User ${userId} requested regeneration of logo ${logoIndex}`);

    // Here you would implement the actual regeneration logic
    await ctx.reply('🔄 Regeneration feature coming soon.');

  } catch (error) {
    console.error('[Feedback] Error processing regeneration:', error);
    await ctx.reply('❌ Error processing regeneration. Please try again.');
  }
});

// Handle feedback: like/dislike for memes
bot.action(/feedback_(like|dislike)_meme_(\d+)_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const [, action, userId, timestamp] = ctx.match;
  const interactionType = action; // 'like' or 'dislike'

  try {
    // Find the recent meme generation
    const recentGeneration = await ImageGeneration.findOne({
      userId: parseInt(userId),
      type: 'meme',
      createdAt: { $gte: new Date(parseInt(timestamp) - 300000) } // Within 5 minutes
    }).sort({ createdAt: -1 });

    if (recentGeneration) {
      // Log feedback for future analysis
      console.log(`[Feedback] User ${userId} ${interactionType}d meme`);
    }

    // Update the message to show feedback was recorded
    const emoji = action === 'like' ? '👍' : '👎';
    await ctx.editMessageReplyMarkup({
      inline_keyboard: [
        [
          { text: action === 'like' ? '👍 Liked!' : '👍 Like', callback_data: `feedback_like_meme_${userId}_${timestamp}` },
          { text: action === 'dislike' ? '👎 Disliked!' : '👎 Dislike', callback_data: `feedback_dislike_meme_${userId}_${timestamp}` }
        ],
        [
          { text: '📤 Share', callback_data: `share_meme_${recentGeneration?._id}` },
          { text: '🔄 Regenerate', callback_data: `regenerate_meme_${userId}` }
        ]
      ]
    });

  } catch (error) {
    console.error('[Feedback] Error collecting meme feedback:', error);
  }
});

// Handle meme regeneration with feedback-driven improvement
bot.action(/regenerate_meme(_(\d+))?/, async (ctx) => {
  await ctx.answerCbQuery('🔄 Regenerating meme with improvements...');

  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    // Log regenerate feedback (indicates dissatisfaction)
    console.log(`[Feedback] User ${userId} requested meme regeneration`);

    // Get the user's last meme parameters
    const lastParams = await mongodbService.getLastMemeParams(userId);
    if (!lastParams) {
      await ctx.reply('❌ No previous meme data found. Please create a new meme.');
      return;
    }

    // Check user balance
    const user = await User.findOne({ userId });
    if (!user) {
      await ctx.reply('❌ User not found.');
      return;
    }

    const cost = 50; // Regeneration cost
    if (user.starBalance < cost) {
      await ctx.reply(`❌ Insufficient stars. Need ${cost} ⭐ stars for regeneration.`);
      return;
    }

    await ctx.reply('🧠 Analyzing previous feedback and regenerating improved meme...');

    // Queue regenerated meme with feedback integration
    await imageQueue.add('generate-meme', {
      prompt: 'DSPy will generate improved prompt based on feedback',
      userId: userId,
      chatId: ctx.chat?.id,
      session: lastParams,
      freeGenerationUsed: true, // Regenerations are never free
      updateUser: true,
      quality: 'Good',
      format: lastParams.memeFormat,
      cost: cost,
      imageBuffer: null,
      useDSPy: true,
      isRegeneration: true // Flag to indicate this is a feedback-driven regeneration
    }, { timeout: 300000 });

    console.log(`[Feedback] User ${userId} requested meme regeneration`);

  } catch (error) {
    console.error('[Feedback] Error processing meme regeneration:', error);
    await ctx.reply('❌ Error processing regeneration. Please try again.');
  }
});

// Handle meme sharing with referral link
bot.action(/share_meme_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const memeId = ctx.match[1];
  const userId = ctx.from?.id;

  if (!userId) return;

  try {
    // Get user's referral stats and generate code if needed
    let stats = await mongodbService.getReferralStats(userId);

    if (!stats.referralCode) {
      const newCode = await mongodbService.generateReferralCode(userId);
      if (newCode) {
        stats.referralCode = newCode;
      }
    }

    if (stats.referralCode) {
      const referralLink = `https://t.me/${ctx.botInfo.username}?start=${stats.referralCode}`;
      const shareText = `🎨 Check out this amazing meme I created with BrandForge Bot! Create your own AI-powered memes, logos, and stickers. Join me: ${referralLink}`;

      await ctx.reply(
        `📤 *Share Your Meme & Earn Stars!*\n\n` +
        `Copy this message to share your meme and referral link:\n\n` +
        `\`${shareText}\`\n\n` +
        `💰 *You earn 20 ⭐ stars* when someone joins and uses the bot!\n\n` +
        `🔗 Your referral stats: ${stats.referralCount} referrals, ${stats.totalRewards} ⭐ earned`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{
                text: '📱 Share via Telegram',
                url: `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`
              }],
              [{ text: '🏠 Back to Menu', callback_data: 'back_to_menu' }]
            ]
          }
        }
      );
    } else {
      await ctx.reply('❌ Error generating referral link. Please try again later.');
    }

  } catch (error) {
    console.error('[Share] Error sharing meme:', error);
    await ctx.reply('❌ Error sharing meme. Please try again.');
  }
});

// 🧪 Testing mode admin commands
bot.command('testingstatus', async (ctx) => {
  const isTestMode = process.env.TESTING === 'true';
  const statusEmoji = isTestMode ? '✅' : '❌';
  const statusText = isTestMode ? 'ENABLED' : 'DISABLED';

  const message = `🧪 **Testing Mode Status**\n\n` +
    `${statusEmoji} Testing Mode: **${statusText}**\n\n` +
    `📝 **What this means:**\n` +
    `• Credit checks: ${isTestMode ? 'SKIPPED' : 'ACTIVE'}\n` +
    `• Balance deduction: ${isTestMode ? 'SKIPPED' : 'ACTIVE'}\n` +
    `• Free generations: ${isTestMode ? 'UNLIMITED' : 'LIMITED'}\n\n` +
    `${isTestMode ? '🎉 Perfect for beta testing!' : '💰 Production mode active'}`;

  await ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('toggletesting', async (ctx) => {
  // This is just informational - actual toggle requires environment variable change
  await ctx.reply(
    '🔧 **How to Toggle Testing Mode:**\n\n' +
    '1. Update `.env` file:\n' +
    '   • `TESTING=true` for testing mode\n' +
    '   • `TESTING=false` for production mode\n\n' +
    '2. Restart the bot service\n\n' +
    'Use `/testingstatus` to check current status.',
    { parse_mode: 'Markdown' }
  );
});

// Main application startup function
async function startApplication(): Promise<void> {
  try {
    logger.info('🚀 Starting Instalogo Bot');
    logger.info('===============================');
    logger.info(`Environment: ${config.server.environment}`);
    logger.info(`Bot Username: ${config.telegram.botUsername || 'Not configured'}`);

    // Check MongoDB environment variable
    const mongoUrl = config.database.mongoUri;
    if (mongoUrl) {
      logger.info(`🔍 MongoDB URL found: ${mongoUrl.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
    } else {
      logger.warn('⚠️  No MongoDB connection URL found in environment variables');
      logger.warn('   Expected: MONGO_URI or MONGODB_URI');
    }
    logger.info('===============================');

    // Connect to database
    logger.info('🔌 Connecting to MongoDB...');
    await connectDB();

    // Verify database health
    logger.info('🏥 Checking database health...');
    const dbHealth = await checkDBHealth();

    if (dbHealth.healthy) {
      logger.info('✅ Database is healthy and ready');
      logger.info(`📊 Database Details: ${JSON.stringify(dbHealth.details, null, 2)}`);
    } else {
      logger.error('❌ Database health check failed:', dbHealth.status);
      logger.error('📊 Database Details:', dbHealth.details);
      process.exit(1);
    }

    // Start HTTP server (for health checks and webhooks if needed)
    logger.info('🌐 Starting HTTP server...');
    startServer();

    // Start the bot
    logger.info('🤖 Starting Telegram bot...');
    await startBot();

    // Setup graceful shutdown
    setupGracefulShutdown(bot);

    logger.info('🎯 Application startup completed successfully!');
    logger.info('📝 Bot is ready to receive messages');

  } catch (error) {
    logger.error('❌ Application startup failed:', error);
    process.exit(1);
  }
}

// Start the application
startApplication();