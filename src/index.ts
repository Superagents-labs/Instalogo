import dotenv from 'dotenv';
import path from 'path';

// Load environment variables FIRST before any other imports
dotenv.config();

import { connectDB } from './db/mongoose';
import axios from 'axios';
import { User } from './models/User';

import { Telegraf, session, Markup } from 'telegraf';
import { BotContext } from './types';
import { createScenes } from './scenes';
import { setupCallbackHandlers } from './handlers/callback.handler';
import { OpenAIService } from './services/openai.service';
import { MongoDBService } from './services/mongodb.service';
import { StorageService } from './services/storage.service';

import { createTelegramStickerPack, addStickerToPack } from './utils/telegramStickerPack';
import fs from 'fs';
import { startImageWorker, imageQueue } from './utils/imageQueue';
import { userLoader } from './middleware/userLoader';
import i18n, { i18nMiddleware } from './middleware/i18n.middleware';
import { sceneSessionResetMiddleware, ensureSessionCleanup } from './middleware/scene.middleware';
import { setupLanguageCommand } from './commands/language';

const { ImageGeneration } = require('./models/ImageGeneration');

console.log('Index file loaded');

// --- Main Menu Helper ---
export async function sendMainMenu(ctx: BotContext) {
  // Show star balance if available
  let balanceMsg = '';
  if (ctx.dbUser) {
    balanceMsg = `\n\n*${ctx.i18n.t('welcome.star_balance')}:* ${ctx.dbUser.starBalance} ⭐`;
  }
  await ctx.reply(
    `*${ctx.i18n.t('welcome.title')}*\n\n${ctx.i18n.t('welcome.what_to_do')}${balanceMsg}\n\n_${ctx.i18n.t('welcome.built_by')}_`,
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
            { text: ctx.i18n.t('menu.edit_image'), callback_data: 'edit_sticker' }
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
const mongodbService = new MongoDBService();
const storageService = new StorageService();

// Initialize the bot
const bot = new Telegraf<BotContext>(process.env.BOT_TOKEN || '');

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
const stage = createScenes(openaiService, mongodbService, storageService);

// Create a wrapper that will add i18n to all scene contexts
const wrappedStage = {
  middleware: () => (ctx: BotContext, next: any) => {
    // Ensure the ctx has i18n before passing to the scene middleware
    // @ts-ignore - Scene middleware context compatibility issue with i18n
    return stage.middleware()(ctx, next);
  }
};

// Apply stage middleware only - no scene session reset middleware
bot.use(wrappedStage.middleware());

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
    
    // Clear edit image session flags that persist outside of scenes
    const editImageKeys = [
      'awaitingEditPrompt',
      'stickerEditPrompt', 
      'awaitingStickerEdit',
      'awaitingStarterPackImage'
    ];
    
    editImageKeys.forEach(key => {
      if ((ctx.session as any)[key]) {
        console.log(`Force clearing edit image session flag: ${key}`);
        delete (ctx.session as any)[key];
      }
    });
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
    
    // Completely reset session including wizard state
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
    // This is crucial for wizard scenes that might persist state
    const language = ctx.i18n?.locale();
    ctx.session = { __scenes: { current: null, state: {} } } as any;
    
    // Restore language if it was set
    if (language && ctx.i18n) {
      ctx.i18n.locale(language);
    }
  }
  
  // Extra safety: If there's still a wizard context, reset it
  if (ctx.wizard) {
    try {
      // Reset wizard cursor to beginning
      (ctx as any).wizard.cursor = 0;
      console.log('Reset wizard cursor to 0');
    } catch (err) {
      console.log('Could not reset wizard cursor:', err);
    }
  }
}

// Modify the bot.start handler to completely clear session data
bot.start(async (ctx) => {
  // Only process if this is not a duplicate command within 2 seconds
  const userId = ctx.from?.id || 0;
  const now = Date.now();
  const lastTime = lastStartCommand.get(userId) || 0;
  
  if (now - lastTime < 2000) {
    console.log('Ignoring duplicate /start command');
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
      console.error('Error processing referral:', error);
    }
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

// Edit sticker command
bot.command('edit_sticker', async (ctx) => {
  await forceLeaveCurrentScene(ctx);
  await ctx.reply(ctx.i18n.t('general.please_describe'));
  (ctx.session as any).awaitingEditPrompt = true;
});

// Generate memes command (text trigger)
bot.hears('Generate Memes', async (ctx) => {
  await forceLeaveCurrentScene(ctx);
  // Reset any meme-related session data
  const memeKeys = ['memeImageFileId', 'memeText', 'memeMood', 'memeElements', 'memeStyle'];
  memeKeys.forEach(key => delete (ctx.session as any)[key]);
  await ctx.scene.enter('memeWizard');
});

// NOTE: generate_memes callback handler moved to callback.handler.ts to avoid conflicts

bot.action('starter_pack', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(ctx.i18n.t('general.please_upload'));
  (ctx.session as any).awaitingStarterPackImage = true;
});

bot.action('edit_sticker', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(ctx.i18n.t('general.please_describe'));
  (ctx.session as any).awaitingEditPrompt = true;
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
  } else if ((ctx.session as any).awaitingStickerEdit || (ctx.session as any).stickerEditPrompt) {
    // Handle photo for sticker editing
    await ctx.reply(ctx.i18n.t('general.processing_image'));
    
    try {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const fileLink = await ctx.telegram.getFileLink(photo.file_id);
      const response = await fetch(fileLink.href);
      const buffer = Buffer.from(await response.arrayBuffer());
      
      const userId = ctx.from.id;
      const chatId = ctx.chat.id;
      const prompt = (ctx.session as any).stickerEditPrompt || 'Create a beautiful sticker with transparent background';
      
      // Add to image queue
      await imageQueue.add('edit-sticker', {
        userId,
        chatId,
        prompt,
        imageBuffer: buffer
      });
      
      await ctx.reply(ctx.i18n.t('general.image_queued'));
    } catch (error) {
      console.error('Error processing image for editing:', error);
      await ctx.reply(ctx.i18n.t('general.image_error'));
    }
    
    // Reset session
    delete (ctx.session as any).awaitingStickerEdit;
    delete (ctx.session as any).stickerEditPrompt;
  }
});

// Handle text for edit prompt
bot.on('text', async (ctx) => {
  // Only process if we're awaiting an edit prompt
  if ((ctx.session as any).awaitingEditPrompt) {
    const prompt = ctx.message.text;
    (ctx.session as any).stickerEditPrompt = prompt;
    (ctx.session as any).awaitingEditPrompt = false;
    (ctx.session as any).awaitingStickerEdit = true;
    await ctx.reply('Great! Now please upload the image you want to edit into a sticker.');
    return;
  }
  
  // Keep the existing text message handling
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

// Start the bot
const startBot = async () => {
  console.log('startBot function is running...');
  try {
    // Check if Cloudinary is configured and accessible
    try {
      await storageService.ensureBucketExists();
      console.log('✅ Cloudinary is configured and ready for image storage');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('❌ Cloudinary may not be available:', errorMessage);
      console.warn('⚠️ Continuing anyway, but image storage operations may fail');
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
            
            // Always use basic prompt generation
            console.log(`[ImageWorker] 📝 Using basic prompt generation...`);
            finalPrompts = [
              `Create a professional, minimalist logo for ${session.name}. ${session.tagline ? `Tagline: ${session.tagline}.` : ''} Style: Modern, clean, scalable. Industry: ${session.mission || 'Business'}. Colors: ${session.colorPreferences || 'Professional palette'}. Make it distinctive and memorable.`,
              `Design a bold, symbolic logo for ${session.name}. ${session.tagline ? `Tagline: ${session.tagline}.` : ''} Style: Iconic, strong visual impact. Industry: ${session.mission || 'Business'}. Colors: ${session.colorPreferences || 'Professional palette'}. Focus on symbolism and brand recognition.`
            ];
            
            if (!session.generatedLogos) session.generatedLogos = [];
            
            // Generate each logo separately with its own prompt
            for (let idx = 0; idx < finalPrompts.length; idx++) {
              const logoPrompt = finalPrompts[idx];
              console.log(`[ImageWorker] Generating logo ${idx + 1} with prompt: ${logoPrompt.substring(0, 100)}...`);
              
              const imageB64s = await openaiService.generateImageWithOpenAI({
                prompt: logoPrompt,
                n: 1, // Generate only 1 image per prompt to avoid multiple logos in one image
                size: '1024x1024',
                model: 'gpt-image-1',
                userId,
                userBalance,
                sessionId: session?.sessionId,
                generationType: 'logo',
                freeGeneration: !freeGenerationUsed,
              });
              
              const buffer = Buffer.from(imageB64s[0], 'base64');
              const logoSet: Record<string, string> = {};
              
              // Create multiple sizes for each logo
              for (const size of allSizes) {
                const resized = await sharp(buffer).resize(size, size).png().toBuffer();
                const storedUrl = await storageService.uploadBuffer(resized, {
                  key: `logos/${session?.name?.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}-${idx}-${size}.png`,
                  contentType: 'image/png'
                });
                logoSet[size] = storedUrl;
              }
              
              session.generatedLogos.push(logoSet);
              
              // Send logo with basic concept description
              const conceptDescription = `Logo Concept ${idx + 1}`;
              const caption = `${conceptDescription}\n\n${cost === 0 ? '(Free)' : `(${cost} stars)`}`;
              
              await bot.telegram.sendPhoto(chatId, { source: buffer }, { 
                caption,
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: '👍 Like', callback_data: `feedback_like_${userId}_${Date.now()}_${idx}` },
                      { text: '👎 Dislike', callback_data: `feedback_dislike_${userId}_${Date.now()}_${idx}` }
                    ],
                    [
                      { text: '📥 Download HD', callback_data: `download_logo_${idx}` },
                      { text: '🔄 Regenerate', callback_data: `regenerate_logo_${idx}` }
                    ]
                  ]
                }
              });
              
              // Create DB record for the logo
              try {
                console.log(`[ImageWorker] Creating ImageGeneration record for userId: ${userId}, type: logo, cost: ${idx === 0 ? cost : 0}, imageUrl: ${logoSet['1024']}`);
                const imageGen = await ImageGeneration.create({
                  userId,
                  type: 'logo',
                  cost: idx === 0 ? cost : 0, // Only charge for the first logo
                  imageUrl: logoSet['1024'],
                });
                console.log(`[ImageWorker] Successfully created ImageGeneration record with ID: ${imageGen._id}`);
              } catch (dbError) {
                console.error(`[ImageWorker] Error creating ImageGeneration record:`, dbError);
              }
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
            
            // Store all logo sets in MongoDB for this user
            try {
              console.log(`[ImageWorker] Storing ${session.generatedLogos?.length || 0} logo sets in UserImages for userId: ${userId}`);
              await mongodbService.setUserLogos(userId, session.generatedLogos);
              console.log(`[ImageWorker] Successfully stored logo sets in UserImages`);
            } catch (dbError) {
              console.error(`[ImageWorker] Error storing logo sets in UserImages:`, dbError);
            }
            
            console.log(`[ImageWorker] Completed job: ${job.id} (generate-logo)`);
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
              
              // Use basic meme prompt generation
              console.log(`[ImageWorker] 📝 Using basic meme prompt generation...`);
              
              // Build basic meme prompt from session data
              finalPrompt = prompt; // Use the prompt built in the meme wizard
              
              console.log(`[ImageWorker] ✅ Basic meme prompt ready!`);
              
              if (job.data.imageBuffer) {
                // Use image+prompt API with basic prompt
                const response = await openaiService.generateImage({
                  prompt: finalPrompt,
                  image: job.data.imageBuffer,
                  model: 'gpt-image-1',
                  size: '1024x1024',
                  response_format: 'b64_json',
                  userId,
                  userBalance,
                  sessionId: session?.sessionId,
                  generationType: 'meme',
                });
                // The response may have .data[0].b64_json
                const b64 = response.data && response.data[0] && response.data[0].b64_json;
                if (!b64) throw new Error('No image returned from OpenAI image+prompt API');
                buffer = Buffer.from(b64, 'base64');
              } else {
                // Use prompt-only API with basic prompt
                console.log(`[ImageWorker] Generating meme with basic prompt: ${finalPrompt.substring(0, 100)}...`);
                const imageB64s = await openaiService.generateImageWithOpenAI({
                  prompt: finalPrompt,
                  n: 1,
                  size: '1024x1024',
                  model: 'gpt-image-1',
                  userId,
                  userBalance,
                  sessionId: session?.sessionId,
                  generationType: 'meme',
                  freeGeneration: !freeGenerationUsed,
                });
                buffer = Buffer.from(imageB64s[0], 'base64');
              }
              
              const memeUrl = await storageService.uploadBuffer(buffer, {
                key: `memes/meme-${userId}-${Date.now()}.png`,
                contentType: 'image/png'
              });

              
              // Create DB record for the meme
              const imageGen = await ImageGeneration.create({
                userId,
                type: 'meme',
                quality,
                cost,
                imageUrl: memeUrl,
              });
              
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
            } catch (error) {
              console.error(`[ImageWorker] Error in meme generation:`, error);
              await bot.telegram.sendMessage(chatId, 'Sorry, there was an error generating your meme. Please try again.');
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
            for (let i = 0; i < count; i++) {
              try {
                const variationPrompt = `${prompt} (variation ${i + 1})`;
                const imageB64s = await openaiService.generateImageWithOpenAI({
                  prompt: variationPrompt,
                  n: 1,
                  model: 'gpt-image-1',
                  userId,
                  userBalance,
                  sessionId: session?.sessionId,
                  generationType: 'sticker',
                  freeGeneration: i === 0 && !freeGenerationUsed,
                });
                const buffer = Buffer.from(imageB64s[0], 'base64');
                const localStickerPath = path.join(stickerDir, `sticker-${userId}-${Date.now()}-${i}.png`);
                fs.writeFileSync(localStickerPath, buffer);
                const stickerUrl = await storageService.uploadBuffer(buffer, {
                  key: `stickers/sticker-${userId}-${Date.now()}-${i}.png`,
                  contentType: 'image/png'
                });
                // Always create the DB record here for this sticker, include the actual cost per sticker
                const stickerCost = i === 0 && !freeGenerationUsed ? 0 : costPerSticker;
                const imageGen = await ImageGeneration.create({
                  userId,
                  type: 'sticker',
                  cost: stickerCost,
                  imageUrl: stickerUrl,
                  localPath: localStickerPath,
                });
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
              } catch (error) {
                console.error(`[ImageWorker] Error generating sticker ${i + 1}:`, error);
                await bot.telegram.sendMessage(chatId, `Sorry, there was an error generating sticker ${i + 1}. Continuing with others...`);
              }
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
                  
                  if (totalCost > 0) {
                    console.log(`[ImageWorker] User ${userId} previous balance: ${user.starBalance}`);
                    user.starBalance -= totalCost;
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
                console.error(`[ImageWorker] Error updating user after sticker generation:`, dbError);
              }
            }
            
            console.log(`[ImageWorker] Completed job: ${job.id} (generate-sticker)`);
          } else if (name === 'edit-sticker') {
            const { prompt, imageBuffer } = job.data;
            console.log(`[ImageWorker] Editing image for sticker with prompt: ${prompt}`);
            
            try {
              // Process the uploaded image with OpenAI
              const editedImageB64 = await openaiService.editImageForSticker({
                image: imageBuffer,
                prompt: `${prompt}. Make this a sticker with a transparent background.`
              });
              
              // Convert to buffer and send back to user
              const buffer = Buffer.from(editedImageB64, 'base64');
              await bot.telegram.sendPhoto(chatId, { source: buffer }, { 
                caption: 'Here is your edited sticker image!' 
              });
              
              console.log(`[ImageWorker] Completed job: ${job.id} (edit-sticker)`);
            } catch (error) {
              console.error('[ImageWorker] Error processing edited sticker:', error);
              await bot.telegram.sendMessage(chatId, 'Sorry, there was an error creating your sticker. Please try again.');
            }
          }
        } catch (error) {
          console.error(`[ImageWorker] Error in job ${job.id}:`, error);
          
          // Clear any "still working" intervals when job fails
          try {
            // Try to notify user of job failure
            if (name === 'generate-logo') {
              await bot.telegram.sendMessage(chatId, 'Sorry, there was an error generating your logo. Please try again.');
            } else if (name === 'generate-meme') {
              await bot.telegram.sendMessage(chatId, 'Sorry, there was an error generating your meme. Please try again.');
            } else if (name === 'generate-sticker') {
              await bot.telegram.sendMessage(chatId, 'Sorry, there was an error generating your stickers. Please try again.');
            } else {
              await bot.telegram.sendMessage(chatId, 'Sorry, there was an error processing your request. Please try again.');
            }
          } catch (notifyError) {
            console.error(`[ImageWorker] Could not notify user of job failure:`, notifyError);
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
    await bot.telegram.setMyShortDescription('BrandForge Bot — AI Crypto Logo');
    try {
      await bot.launch();
      console.log('Bot launched!');
    } catch (err) {
      console.error('Error launching bot:', err);
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
  
  // Calculate Star price based on credit amount (with discounts)
  let starPrice: number;
  switch(starsAmount) {
    case 100: starPrice = 100; break;   // 100 Stars = 100 Credits
    case 500: starPrice = 500; break;   // 500 Stars = 500 Credits  
    case 1000: starPrice = 950; break;  // 950 Stars = 1000 Credits (5% discount)
    case 2500: starPrice = 2250; break; // 2250 Stars = 2500 Credits (10% discount)
    default: starPrice = 100;
  }
  
  // Create a Telegram Stars invoice
  const invoice = {
    title: `${starsAmount} Logo Credits`,
    description: `Purchase ${starsAmount} ⭐ credits for AI logo generation`,
    payload: `stars_${starsAmount}_${ctx.from.id}_${Date.now()}`,
    provider_token: '',              // Empty for Telegram Stars
    currency: 'XTR',                 // Telegram Stars currency
    prices: [{ label: `${starsAmount} Credits`, amount: starPrice }], // Direct Stars
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
  const packName = `starter_pack_${(ctx.from.username || ctx.from.id).toString().toLowerCase()}_by_logoaidbot`;
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
          { text: '📥 Download HD', callback_data: `download_logo_${logoIndex}` },
          { text: '🔄 Regenerate', callback_data: `regenerate_logo_${logoIndex}` }
        ]
      ]
    });
    
  } catch (error) {
    console.error('[Feedback] Error collecting feedback:', error);
  }
});

// Handle download feedback
bot.action(/download_logo_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery('Preparing high-resolution download...');
  
  const logoIndex = parseInt(ctx.match[1]);
  const userId = ctx.from?.id;
  
  try {
    // Log download feedback
    console.log(`[Feedback] User ${userId} downloaded logo ${logoIndex}`);
    
    // Here you would implement the actual download logic
    await ctx.reply('🎉 High-resolution download feature coming soon.');
    
  } catch (error) {
    console.error('[Feedback] Error processing download:', error);
    await ctx.reply('❌ Error processing download. Please try again.');
  }
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

// Connect to MongoDB first, then start the bot
const initializeApp = async () => {
  try {
    console.log('🔄 Connecting to MongoDB Atlas...');
    await connectDB();
    console.log('✅ Database connection successful! Connected to instalogo database');
    console.log('🚀 Starting Telegram bot...');
    await startBot();
  } catch (error) {
    console.error('❌ Failed to initialize application:', error);
    console.error('💡 Check your MONGODB_URI in .env file');
    process.exit(1);
  }
};

initializeApp(); 