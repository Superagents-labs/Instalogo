// @ts-nocheck - Disable TypeScript checking for this file due to i18n integration
import { Scenes } from 'telegraf';
import { BotContext } from '../types';
import { OpenAIService } from '../services/openai.service';
import { FluxService } from '../services/flux.service';
import sizeOf from 'image-size';
import sharp from 'sharp';
import createBackgroundRemoval from '@imgly/background-removal-node';
import { imageQueue } from '../utils/imageQueue';
import { ImageGeneration } from '../models/ImageGeneration';
import crypto from 'crypto';
import { addUserInterval } from '../utils/intervalManager';
import { telegramStarsService } from '../index';

function getStickerPackName(ctx: BotContext) {
  const username = ctx.from?.username || `user${ctx.from?.id}`;
  return `crypto_stickers_${username}_by_${process.env.BOT_USERNAME || 'yourbot'}`;
}

function getStickerPackTitle(ctx: BotContext) {
  return `${(ctx.session as any).stickerStyle || 'Crypto'} Stickers by ${ctx.from?.first_name || 'User'}`;
}

function isValidSticker(buffer: Buffer) {
  // Telegram requires PNG, 512x512, <512KB
  // 1. File size < 512KB
  // 2. PNG signature
  // 3. Dimensions 512x512
  if (buffer.length >= 512 * 1024) return false;
  if (!(buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47)) return false;
  try {
    const dimensions = sizeOf(buffer);
    if (dimensions.width !== 512 || dimensions.height !== 512) return false;
  } catch (e) {
    return false;
  }
  return true;
}

// Helper to wait for a given number of milliseconds
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper to ensure buffer is PNG, 512x512, <512KB, and background removed
async function ensureValidSticker(buffer: Buffer): Promise<Buffer> {
  let output = await sharp(buffer)
    .resize(512, 512, { fit: 'cover' })
    .ensureAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
  
  // Remove background with Node.js implementation
  try {
    const arrayBuffer = new Uint8Array(output).buffer;
    const blob = new Blob([arrayBuffer], { type: 'image/png' });
    const result = await createBackgroundRemoval(blob);
    output = Buffer.from(await result.arrayBuffer());
  } catch (initError) {
    console.error('Failed to remove background:', initError);
    // Fallback to original image
    return output;
  }
  
  // Post-process image to remove white background using sharp
  try {
    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += info.channels) {
      // Check if pixel is nearly white (adjust threshold as needed)
      if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) {
        // If there's an alpha channel, set it to 0 (transparent)
        if (info.channels === 4) {
          data[i + 3] = 0;
        } else {
          // For safety, if no alpha, do nothing (png conversion later adds alpha)
        }
      }
    }
    output = await sharp(data, { raw: info }).png({ compressionLevel: 9 }).toBuffer();
  } catch (postProcError) {
    console.error('Failed to post-process image:', postProcError);
  }
  
  // If still too large, try reducing quality
  let quality = 90;
  while (output.length >= 512 * 1024 && quality > 10) {
    output = await sharp(output)
      .png({ compressionLevel: 9, quality })
      .toBuffer();
    quality -= 10;
  }

  // Final check to ensure output is PNG
  try {
    // Force conversion to PNG one last time
    output = await sharp(output)
      .ensureAlpha()
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch (finalConversionError) {
    console.error('Final PNG conversion failed:', finalConversionError);
  }
  
  return output;
}

async function generateStickersInBatches({
  ctx,
  count,
  batchSize,
  delayMs,
  generateStickerFn
}: {
  ctx: BotContext,
  count: number,
  batchSize: number,
  delayMs: number,
  generateStickerFn: (i: number) => Promise<Buffer>
}): Promise<Buffer[]> {
  const results: Buffer[] = [];
  for (let i = 0; i < count; i += batchSize) {
    const batch = [];
    for (let j = 0; j < batchSize && i + j < count; j++) {
      batch.push(generateStickerFn(i + j));
    }
    try {
      const batchResults = await Promise.all(batch);
      results.push(...batchResults);
    } catch (err: any) {
      if (err.code === 'rate_limit_exceeded' && err.error && err.error.message) {
        // Extract wait time from error message if available
        const match = err.error.message.match(/after ([\d.]+) seconds/);
        const waitSeconds = match ? parseFloat(match[1]) : 30;
        await ctx.reply(`Rate limit hit, waiting ${Math.ceil(waitSeconds)} seconds before continuing...`);
        await sleep(waitSeconds * 1000);
        i -= batchSize; // retry this batch
        continue;
      } else {
        throw err;
      }
    }
    await sleep(delayMs);
    await ctx.reply(`Progress: ${Math.min(i + batch.length, count)}/${count} stickers generated...`);
  }
  return results;
}

function logErrorWithRef(error: any) {
  const ref = crypto.randomBytes(4).toString('hex');
  console.error(`[ErrorRef:${ref}]`, error);
  return ref;
}

export function createStickerWizardScene(openaiService: OpenAIService, fluxService: FluxService): Scenes.WizardScene<BotContext> {
  const scene = new Scenes.WizardScene<BotContext>(
    'stickerWizard',
    // Step 1: Logo upload or skip
    async (ctx) => {
      await ctx.reply(ctx.i18n.t('stickers.upload_image'));
      return ctx.wizard.next();
    },
    // Step 2: Style selection
    async (ctx) => {
      if (ctx.message && 'photo' in ctx.message) {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        (ctx.session as any).stickerImageFileId = photo.file_id;
        (ctx.session as any).stickerImageSkipped = false;
        await ctx.reply(ctx.i18n.t('stickers.pick_style'));
        return ctx.wizard.next();
      } else if (ctx.message && 'text' in ctx.message && ctx.message.text.trim().toLowerCase() === 'skip') {
        (ctx.session as any).stickerImageFileId = undefined;
        (ctx.session as any).stickerImageSkipped = true;
        await ctx.reply(ctx.i18n.t('memes.no_image') + ' ' + ctx.i18n.t('stickers.pick_style'));
        return ctx.wizard.next();
      } else {
        await ctx.reply(ctx.i18n.t('stickers.upload_image'));
        return;
      }
    },
    // Step 3: Phrases/emojis
    async (ctx) => {
      if (ctx.message && 'text' in ctx.message) {
        (ctx.session as any).stickerStyle = ctx.message.text;
        await ctx.reply(ctx.i18n.t('stickers.phrases_emojis'));
        return ctx.wizard.next();
      } else {
        await ctx.reply(ctx.i18n.t('stickers.enter_style'));
      }
    },
    // Step 4: Sticker count
    async (ctx) => {
      if (ctx.message && 'text' in ctx.message) {
        (ctx.session as any).stickerPhrases = ctx.message.text;
        await ctx.reply(ctx.i18n.t('stickers.sticker_count'));
        return ctx.wizard.next();
      } else {
        await ctx.reply(ctx.i18n.t('stickers.enter_phrases'));
      }
    },
    // Step 5: Generate stickers (with batching/throttling and Telegram upload)
    async (ctx) => {
      // Add retry counter for invalid input
      if (!ctx.session.__retries) ctx.session.__retries = 0;
      const user = ctx.dbUser;
      if (!user) {
        await ctx.reply(ctx.i18n.t('errors.user_not_found'));
        return ctx.scene.leave();
      }
      
      // Validate and convert sticker count
      let count = 10; // Default
      if (ctx.message && 'text' in ctx.message) {
        // Try to parse sticker count
        const num = parseInt(ctx.message.text);
        if (!isNaN(num) && num >= 1 && num <= 100) {
          count = num;
          (ctx.session as any).stickerCount = count; // Persist to session
        } else {
          ctx.session.__retries++;
          if (ctx.session.__retries >= 3) {
            await ctx.reply('Too many invalid attempts. Exiting.');
            return ctx.scene.leave();
          }
          await ctx.reply('Please enter a valid sticker count (1-100).');
          return;
        }
      }
      (ctx.session as any).stickerCount = count; // Persist even if default
      ctx.session.__retries = 0;
      
      // Display summary
      let summary = ctx.i18n.t('stickers.sticker_brief') + '\n';
      summary += `• ${ctx.i18n.t('stickers.style')}: ${(ctx.session as any).stickerStyle || 'Default'}\n`;
      summary += `• ${ctx.i18n.t('stickers.phrases')}: ${(ctx.session as any).stickerPhrases || 'None'}\n`;
      summary += `• ${ctx.i18n.t('stickers.count')}: ${count}`;
      
      await ctx.reply(summary);
      
      // Calculate total cost
      // First sticker free if free generation is available
      const freeGenerationUsed = user.freeGenerationUsed;
      const costPerSticker = 50; // 50 stars per sticker
      let totalCost: number = 0;
      
      // Apply free generation discount if available
      if (!freeGenerationUsed && count > 0) {
        totalCost = Math.max(0, (count - 1) * costPerSticker); // First sticker free
      } else {
        totalCost = count * costPerSticker;
      }
      
      // Skip credit check in testing mode
      if (process.env.TESTING !== 'true' && totalCost > 0) {
        // Auto-sync balance before checking
        const currentBalance = await telegramStarsService.getUserStarsBalance(ctx.from!.id);
        
        if (currentBalance < totalCost) {
          await ctx.reply(
            ctx.i18n.t('errors.insufficient_stars') + `\n\n` +
            `Your balance: ${currentBalance} ⭐\n` +
            `Required: ${totalCost} ⭐\n\n` +
            `💡 Tip: After purchasing stars from @premiumbot, your balance will auto-sync!`,
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '💳 Buy Stars', callback_data: 'buy_stars' }],
                  [{ text: '🔄 Refresh Balance', callback_data: 'refresh_stars_balance' }]
                ]
              }
            }
          );
          return ctx.scene.leave();
        }
      }
      
      // Ask for confirmation
      console.log(`[StickerWizard] summary ready for user=${ctx.from?.id}, count=${count}, totalCost=${totalCost}, testing=${process.env.TESTING}`);
      await ctx.reply(
        `${count} ${ctx.i18n.t('stickers.count')}. ${totalCost > 0 ? ctx.i18n.t('stickers.stars_deducted', { totalCost }) : ctx.i18n.t('stickers.free_generation')}`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: ctx.i18n.t('stickers.generate_stickers'), callback_data: 'confirm_stickers' }],
              [{ text: ctx.i18n.t('stickers.restart'), callback_data: 'restart_stickers' }]
            ]
          }
        }
      );
    }
  );
  
  // Add an enter handler to reset session state
  scene.enter(async (ctx) => {
    console.log(`[StickerWizard] enter: user=${ctx.from?.id}`);
    // Reset all sticker-related session data
    const stickerKeys = [
      'stickerImageFileId', 'stickerImageSkipped', 'stickerStyle', 
      'stickerPhrases', 'stickerCount', 'selectedStickers'
    ];
    
    // Clear any previous sticker state
    for (const key of stickerKeys) {
      delete (ctx.session as any)[key];
    }
    
    // Don't use selectStep here - let the scene start naturally
    // The first handler will be called automatically
  });
  
  // Confirm sticker generation
  scene.action('confirm_stickers', async (ctx) => {
    console.log(`[StickerWizard] confirm_stickers: user=${ctx.from?.id}`);
    await ctx.answerCbQuery();
    const user = ctx.dbUser;
    if (!user) {
      await ctx.reply(ctx.i18n.t('errors.user_not_found'));
      return ctx.scene.leave();
    }
    
    // Extract session data
    const style = (ctx.session as any).stickerStyle || 'Crypto';
    const phrases = (ctx.session as any).stickerPhrases || '';
    const hasImage = !(ctx.session as any).stickerImageSkipped;
    let count = 10; // Default count
    
    if ((ctx.session as any).stickerCount) {
      count = parseInt((ctx.session as any).stickerCount);
    }
    
    // Calculate cost one more time in case anything changed
    const freeGenerationUsed = user.freeGenerationUsed;
    const costPerSticker = 50; // 50 stars per sticker
    let totalCost: number = 0;
    
    // Apply free generation discount if available
    if (!freeGenerationUsed && count > 0) {
      totalCost = Math.max(0, (count - 1) * costPerSticker); // First sticker free
    } else {
      totalCost = count * costPerSticker;
    }
    
    // Check if user has enough stars again (skip in testing mode)
    if (process.env.TESTING !== 'true' && totalCost > 0) {
      // Auto-sync balance before checking
      const currentBalance = await telegramStarsService.getUserStarsBalance(ctx.from!.id);
      
      if (currentBalance < totalCost) {
        await ctx.reply(
          ctx.i18n.t('errors.insufficient_stars') + `\n\n` +
          `Your balance: ${currentBalance} ⭐\n` +
          `Required: ${totalCost} ⭐\n\n` +
          `💡 Tip: After purchasing stars from @premiumbot, your balance will auto-sync!`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '💳 Buy Stars', callback_data: 'buy_stars' }],
                [{ text: '🔄 Refresh Balance', callback_data: 'refresh_stars_balance' }]
              ]
            }
          }
        );
        return ctx.scene.leave();
      }
    }
    
    await ctx.reply(ctx.i18n.t('stickers.generating'));
    
    // Build comprehensive sticker prompt using FLUX service
    const session = ctx.session as any;
    const comprehensivePrompt = fluxService.buildStickerPrompt(session);
    
    try {
      // Prepare cost message for the queue message
      const costMessage = totalCost > 0 
        ? ctx.i18n.t('stickers.stars_deducted', { totalCost }) 
        : ctx.i18n.t('stickers.free_generation');
      
      // Queue all the stickers for generation with timeout
      console.log(`[StickerWizard] queueing generate-sticker: user=${ctx.from?.id}, count=${count}, freeGenerationUsed=${freeGenerationUsed}, cost=${totalCost}`);
      await imageQueue.add('generate-sticker', {
        prompt: comprehensivePrompt,
        userId: ctx.from?.id,
        chatId: ctx.chat?.id,
        count,
        freeGenerationUsed,
        updateUser: true,
        cost: totalCost,
      }, { timeout: 300000 });
      
      // Start periodic 'still working' updates
      const chatId = ctx.chat?.id;
      let stillWorking = true;
      let intervalId = setInterval(() => {
        if (stillWorking && chatId) {
          ctx.telegram.sendMessage(chatId, 'Still working on your stickers...');
        }
      }, 60000);
      // Store interval globally instead of in session
      if (ctx.from?.id) {
        addUserInterval(ctx.from.id, intervalId);
      }
      await ctx.reply(ctx.i18n.t('stickers.request_queued', { costMessage }));
      await ctx.scene.leave();
    } catch (error) {
      const ref = logErrorWithRef(error);
      await ctx.reply(ctx.i18n.t('errors.generation_failed') + ` (Ref: ${ref})`);
      return ctx.scene.leave();
    }
  });
  
  // Cancel/restart
  scene.action('restart_stickers', async (ctx) => {
    await ctx.answerCbQuery();
    
    // Reset all sticker-related session data but keep Telegraf's scene structure
    const stickerKeys = [
      'stickerImageFileId', 'stickerImageSkipped', 'stickerStyle', 
      'stickerPhrases', 'stickerCount', 'selectedStickers'
    ];
    
    // Clear any previous sticker state
    for (const key of stickerKeys) {
      delete (ctx.session as any)[key];
    }
    
    await ctx.reply(ctx.i18n.t('stickers.lets_start_over'));
    
    // Re-enter the scene to start from the beginning
    await ctx.scene.leave();
    await ctx.scene.enter('stickerWizard');
  });
  
  return scene;
} 