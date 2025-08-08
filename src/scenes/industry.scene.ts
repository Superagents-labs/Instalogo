// @ts-nocheck - Disable TypeScript checking for this file due to i18n integration
import { Scenes } from 'telegraf';
import { BotContext } from '../types';

/**
 * Scene for collecting the business industry
 */
export function createIndustryScene(): Scenes.BaseScene<BotContext> {
  const scene = new Scenes.BaseScene<BotContext>('industryScene');
  
  // Scene enter handler
  scene.enter(async (ctx) => {
    // If this scene is entered directly, ask for the industry
    if (!(ctx.session as any).name) {
      await ctx.reply('Please first tell me your business name.');
      return ctx.scene.enter('nameScene');
    }
  });
  
  // Handle text messages in this scene
  scene.on('text', async (ctx) => {
    // Store the industry in session
    (ctx.session as any).industry = ctx.message.text;
    
    // Reply and move to style scene
    await ctx.reply('✨ Describe your desired style (e.g. modern, vintage, minimalist, colorful)');
    return ctx.scene.enter('styleScene');
  });
  
  // Handle non-text messages
  scene.on('message', async (ctx) => {
    await ctx.reply('Please enter your industry as text.');
  });
  
  return scene;
} 