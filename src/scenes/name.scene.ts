// @ts-nocheck - Disable TypeScript checking for this file due to i18n integration
import { Scenes } from 'telegraf';
import { BotContext } from '../types';

/**
 * Scene for collecting the business name
 */
export function createNameScene(): Scenes.BaseScene<BotContext> {
  const scene = new Scenes.BaseScene<BotContext>('nameScene');
  
  // Scene enter handler
  scene.enter(async (ctx) => {
    await ctx.reply('🎨 Great! What\'s your business name?');
  });
  
  // Handle text messages in this scene
  scene.on('text', async (ctx) => {
    // Store the business name in session
    (ctx.session as any).name = ctx.message.text;
    
    // Reply and move to industry scene
    await ctx.reply('🏭 What industry are you in?');
    return ctx.scene.enter('industryScene');
  });
  
  // Handle non-text messages
  scene.on('message', async (ctx) => {
    await ctx.reply('Please enter your business name as text.');
  });
  
  return scene;
} 