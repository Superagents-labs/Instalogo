// @ts-nocheck - Disable TypeScript checking for this file due to i18n integration
import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../types';
import { OpenAIService } from '../services/openai.service';
import { MongoDBService } from '../services/mongodb.service';
import { StorageService } from '../services/storage.service';

/**
 * Scene for collecting style preferences and generating logos
 */
export function createStyleScene(
  openaiService: OpenAIService,
  mongodbService: MongoDBService,
  storageService: StorageService
): Scenes.BaseScene<BotContext> {
  const scene = new Scenes.BaseScene<BotContext>('styleScene');
  
  // Scene enter handler
  scene.enter(async (ctx) => {
    // If this scene is entered directly, check for required info
    if (!(ctx.session as any).name || !(ctx.session as any).industry) {
      await ctx.reply('Please first provide your business name and industry.');
      return ctx.scene.enter('nameScene');
    }
  });
  
  // Handle text messages in this scene
  scene.on('text', async (ctx) => {
    try {
      // Get user ID for rate limiting
      const userId = ctx.from?.id || 0;
      
      // Check rate limits
      const { limited, info } = await mongodbService.checkRateLimit(userId);
      if (limited) {
        const resetTime = new Date(info.resetDate + 86400000).toLocaleTimeString();
        await ctx.reply(`You've reached your daily generation limit. Please try again after ${resetTime}.`);
        return ctx.scene.leave();
      }
      
      // Store the style in session
      (ctx.session as any).stylePreferences = ctx.message.text.split(',').map(s => s.trim());
      
      // Let user know the logo is being generated
      await ctx.reply('🔄 Generating your logo, please wait...');
      
      // Call OpenAI to generate logos
      const prompt = openaiService.buildPrompt(ctx.session as any);
      const imageUrls = await openaiService.generateLogoImages({ prompt });
      
      // Store the generated URLs in session and MongoDB
      (ctx.session as any).generatedImages = imageUrls;
      
      // Process and send each image individually with proper storage
      for (let idx = 0; idx < imageUrls.length; idx++) {
        const imageUrl = imageUrls[idx];
        let storedUrl: string;
        
        // First upload to storage if it's a base64 image
        if (imageUrl.startsWith('data:image/')) {
          // Extract base64 data
          const base64Data = imageUrl.split(',')[1];
          const buffer = Buffer.from(base64Data, 'base64');
          
          // Upload to storage service first
          storedUrl = await storageService.uploadBuffer(buffer, {
            key: `logos/${(ctx.session as any).name?.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}-${idx}.png`,
            contentType: 'image/png'
          });
          
          // Store the S3 URL in session
          (ctx.session as any).generatedImages.push(storedUrl);
          
          // Send photo with buffer (more reliable than URL for Telegram)
          await ctx.replyWithPhoto(
            { source: buffer },
            { caption: idx === 0 ? `Logo option ${idx + 1} for ${(ctx.session as any).name}` : `Logo option ${idx + 1}` }
          );
        } else {
          // For regular URLs, store directly
          storedUrl = await storageService.uploadFromUrl(imageUrl, {
            key: `logos/${(ctx.session as any).name?.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}-${idx}.png`,
            contentType: 'image/png'
          });
          
          // Store the S3 URL in session
          (ctx.session as any).generatedImages.push(storedUrl);
          
          // Send photo with URL
          await ctx.replyWithPhoto(
            { url: storedUrl },
            { caption: idx === 0 ? `Logo option ${idx + 1} for ${(ctx.session as any).name}` : `Logo option ${idx + 1}` }
          );
        }
      }
      
      // Store the generated URLs in MongoDB
      await mongodbService.storeGeneratedImages(userId, (ctx.session as any).generatedImages);
      
      // Increment generation count for this user
      await mongodbService.incrementGenerationCount(userId);
      
      // Create inline keyboard for selection
      const buttons = (ctx.session as any).generatedImages.map((_: any, idx: number) => [
        Markup.button.callback(`Choose Logo #${idx + 1}`, `choose_${idx}`)
      ]);
      
      // Add regenerate button
      buttons.push([Markup.button.callback('🔄 Regenerate Logos', 'regenerate')]);
      
      await ctx.reply('Select your favorite logo or regenerate:', 
        Markup.inlineKeyboard(buttons)
      );
      
      // Exit the scene as we'll handle the rest via callbacks
      return ctx.scene.leave();
    } catch (error) {
      console.error('Error in style scene:', error);
      await ctx.reply('Sorry, there was an error generating your logos. Please try again later.');
      return ctx.scene.leave();
    }
  });
  
  // Handle non-text messages
  scene.on('message', async (ctx) => {
    await ctx.reply('Please describe your desired style as text.');
  });
  
  return scene;
}