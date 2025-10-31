import { BotContext } from '../types';
import { OpenAIService } from '../services/openai.service';
import { StorageService } from '../services/storage.service';
import { MongoDBService } from '../services/mongodb.service';
import { Markup } from 'telegraf';
import JSZip from 'jszip';
import fetch from 'node-fetch';
import sharp from 'sharp';
import { Telegraf, Context } from 'telegraf';
import { sendMainMenu } from '../index';

/**
 * Helper function to clear session when switching scenes
 * This is a local version to avoid circular dependencies with index.ts
 */
async function clearSessionForSceneSwitch(ctx: BotContext) {
  if (ctx.scene && ctx.scene.current) {
    // Preserve language setting if available
    const language = ctx.i18n?.locale();
    
    await ctx.scene.leave();
    
    // Save __scenes to preserve Telegraf's scene state handling
    const scenes = ctx.session.__scenes;
    
    // Reset session but keep Telegraf's scene handling structures
    ctx.session = { __scenes: scenes } as any;
    
    // Restore language setting
    if (language && ctx.i18n) {
      ctx.i18n.locale(language);
    }
  }
}

/**
 * Handle callback queries for logo selection and regeneration
 */
export function setupCallbackHandlers(
  bot: Telegraf<BotContext>,
  openaiService: OpenAIService,
  storageService: StorageService,
  mongodbService: MongoDBService
): void {
  // Handle main menu return
  bot.action('main_menu', async (ctx: BotContext) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      'Welcome back to the main menu! What would you like to do?',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Generate Logo 🎨', callback_data: 'generate_logo' }],
            [{ text: 'Generate Stickers 🖼️', callback_data: 'generate_stickers' }],
            [{ text: 'Generate Memes 😂', callback_data: 'generate_memes' }]
          ]
        }
      }
    );
  });
  
  // Handle logo generation menu entry
  bot.action('generate_logo', async (ctx: BotContext) => {
    await ctx.answerCbQuery();
    await clearSessionForSceneSwitch(ctx);
    await ctx.scene.enter('logoWizard');
  });

  // Handle entering meme wizard scene
  bot.action('generate_memes', async (ctx: BotContext) => {
    await ctx.answerCbQuery();
    console.log(`[User Action] generate_memes clicked by user=${ctx.from?.id}`);
    await clearSessionForSceneSwitch(ctx);
    await ctx.scene.enter('memeWizard');
  });

  // Handle entering sticker wizard scene
  bot.action('generate_stickers', async (ctx: BotContext) => {
    await ctx.answerCbQuery();
    console.log(`[User Action] generate_stickers clicked by user=${ctx.from?.id}`);
    await clearSessionForSceneSwitch(ctx);
    await ctx.scene.enter('stickerWizard');
  });

  // Handle choose_N callbacks
  bot.action(/^choose_(\d+)$/, async (ctx: any) => {
    try {
      await ctx.answerCbQuery();
      
      const index = parseInt(ctx.match[1]);
      const images = (ctx.session as any).generatedImages;
      
      if (!images || !Array.isArray(images) || !images[index]) {
        await ctx.reply('Sorry, the selected logo was not found. Please generate logos again.');
        return;
      }
      
      // Store the selected index
      (ctx.session as any).selectedImageIndex = index;
      
      // Get the selected image
      const logoUrl = (ctx.session as any).generatedImages[index];
      
      // Notify user of selection
      await ctx.reply(`You've chosen logo #${index + 1}. Would you like to generate a branding guide based on this logo?`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Yes, generate branding guide', callback_data: 'generate_branding' }],
            [{ text: 'No, just keep the logo', callback_data: 'keep_logo' }]
          ]
        }
      });
    } catch (error) {
      console.error('Error selecting logo:', error);
      await ctx.reply('There was an error selecting your logo. Please try again.');
    }
  });

  // Handle regenerate callback
  bot.action('regenerate', async (ctx: BotContext) => {
    try {
      await ctx.answerCbQuery();
      
      // Check if we have enough info to regenerate
      if (!(ctx.session as any).stylePreferences || !(ctx.session as any).name || !(ctx.session as any).industry) {
        await ctx.reply('Sorry, I need your business details to generate logos. Let\'s start again.');
        return ctx.scene.enter('logoWizard');
      }
      
      await ctx.reply('Regenerating your logos with the same criteria...');
      
      // Build the prompt again
      const prompt = openaiService.buildPrompt(ctx.session as any);
      
      try {
        // Generate again
        const imageUrls = await openaiService.generateLogoImages({ prompt });
        
        // Create new array
        (ctx.session as any).generatedImages = [];
        
        // Process and send each image individually
        for (let idx = 0; idx < imageUrls.length; idx++) {
          const imageUrl = imageUrls[idx];
          let storedUrl;
          
          if (imageUrl.startsWith('data:image/')) {
            // Process base64 image...
            const base64Data = imageUrl.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            
            storedUrl = await storageService.uploadBuffer(buffer, {
              key: `logos/${(ctx.session as any).name?.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}-${idx}.png`,
              contentType: 'image/png'
            });
            
            (ctx.session as any).generatedImages.push(storedUrl);
            
            await ctx.replyWithPhoto(
              { source: buffer },
              { caption: `New option ${idx + 1}` }
            );
          } else {
            // Process URL image...
            storedUrl = await storageService.uploadFromUrl(imageUrl, {
              key: `logos/${(ctx.session as any).name?.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}-${idx}.png`,
              contentType: 'image/png'
            });
            
            (ctx.session as any).generatedImages.push(storedUrl);
            
            await ctx.replyWithPhoto({ url: storedUrl }, { caption: `New option ${idx + 1}` });
          }
        }
        
        // Create selection keyboard
        const buttons = (ctx.session as any).generatedImages.map((_: any, idx: number) => [
          Markup.button.callback(`Choose Logo #${idx + 1}`, `choose_${idx}`)
        ]);
        
        buttons.push([Markup.button.callback('🔄 Regenerate Again', 'regenerate')]);
        
        await ctx.reply('Here are your new logo options:', Markup.inlineKeyboard(buttons));
      } catch (error) {
        console.error('Error regenerating logos:', error);
        await ctx.reply('Sorry, there was an error regenerating your logos. Please try again.');
      }
    } catch (error) {
      console.error('Regenerate callback error:', error);
      await ctx.reply('There was an unexpected error. Please try again.');
    }
  });

  // Handler for choosing a logo and delivering all sizes as a ZIP
  bot.action(/^choose_logo_(\d+)$/, async (ctx: BotContext) => {
    const idx = parseInt((ctx as any).match[1], 10);
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply('User ID not found.');
      return;
    }
    try {
      const logoSets = await mongodbService.getUserLogos(userId);
      const logoSet = logoSets[idx];
      if (!logoSet) {
        await ctx.reply('Sorry, logo not found.');
        return;
      }

      // Download all logo PNGs
      const files = [];
      for (const [size, url] of Object.entries(logoSet)) {
        const res = await fetch(url as string);
        const buffer = Buffer.from(await res.arrayBuffer());
        files.push({ name: `logo_${size}.png`, buffer });
        // Always generate PDF for 1024 size
        if (size === '1024') {
          try {
            const pdfBuffer = await sharp(buffer).resize(1024, 1024).toFormat('pdf').toBuffer();
            files.push({ name: 'logo_1024.pdf', buffer: pdfBuffer });
          } catch (err) {
            console.error('Failed to generate PDF from PNG buffer:', err);
          }
        }
      }

      // Optionally, add SVG if you have a vector version (not possible from raster with sharp)
      // If you have SVG, add: files.push({ name: 'logo.svg', buffer: svgBuffer });

      // Create ZIP
      const zip = new JSZip();
      for (const file of files) {
        zip.file(file.name, file.buffer);
      }
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      // Send ZIP to user
      await ctx.replyWithDocument({ source: zipBuffer, filename: 'logo_files.zip' }, { caption: 'Here are your logo files in all standard sizes (PNG, PDF).' });
    } catch (error) {
      console.error('Error handling logo selection:', error);
      await ctx.reply('Sorry, there was an error selecting your logo. Please try again.');
    }
  });
} 