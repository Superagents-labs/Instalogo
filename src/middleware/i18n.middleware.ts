// @ts-nocheck - Disable TypeScript checking for this file due to i18n integration
import TelegrafI18n from 'telegraf-i18n';
import path from 'path';
import { BotContext } from '../types';
import { Scenes } from 'telegraf';
import fs from 'fs';

// Find available languages by reading the locales directory
const getAvailableLanguages = (): string[] => {
  const localesDir = path.resolve(process.cwd(), 'locales');
  if (!fs.existsSync(localesDir)) {
    console.error(`Locales directory '${localesDir}' not found`);
    return ['en']; // Default to English if directory not found
  }
  
  return fs.readdirSync(localesDir)
    .filter(file => file.endsWith('.json'))
    .map(file => path.basename(file, '.json'));
};

// Create i18n instance
const i18n = new TelegrafI18n({
  defaultLanguage: 'en',
  allowMissing: true, // If a key is missing in a language, it will use the default language
  directory: path.resolve(process.cwd(), 'locales')
});

// Add a custom method to get available languages
i18n.getAvailableLanguages = getAvailableLanguages;

/**
 * Middleware to detect and set the user's language
 */
export const i18nMiddleware = async (ctx: BotContext, next: any) => {
  // If user exists in database and has a preferred language, use it
  if (ctx.dbUser && ctx.dbUser.language) {
    ctx.i18n.locale(ctx.dbUser.language);
  } else if (ctx.from && ctx.from.language_code) {
    // Try to use Telegram's language preference
    const langCode = ctx.from.language_code.split('-')[0]; // handle 'en-US' format
    
    // Check if we have this language
    if (getAvailableLanguages().includes(langCode)) {
      ctx.i18n.locale(langCode);
      
      // Save user's language preference if we have a DB user
      if (ctx.dbUser) {
        ctx.dbUser.language = langCode;
        await ctx.dbUser.save().catch(e => console.error('Error saving user language preference:', e));
      }
    }
  }
  
  return next();
};

/**
 * Function to extend the Stage with i18n middleware
 */
export const extendStageWithI18n = (stage: Scenes.Stage<BotContext>) => {
  // Add a middleware that ensures i18n is properly passed to all scenes
  stage.use((ctx, next) => {
    // Make sure i18n is accessible in scenes
    if (ctx.i18n) {
      return next();
    } else {
      console.error('i18n instance not found in context when entering scene');
      return next();
    }
  });
  
  return stage;
};

export default i18n; 