// @ts-nocheck - Disable TypeScript checking for this file due to i18n integration
import { Markup } from 'telegraf';
import { BotContext } from '../types';
import i18n from '../middleware/i18n.middleware';

/**
 * Language command handler
 * Handles language setting functionality
 */
export async function setupLanguageCommand(bot: any) {
  
  // Language command to let user choose language
  bot.command('language', async (ctx: BotContext) => {
    const availableLanguages = i18n.getAvailableLanguages();
    
    const buttons = availableLanguages.map(code => {
      // Map language codes to readable names
      const languageNames: Record<string, string> = {
        'en': 'English 🇬🇧',
        'es': 'Español 🇪🇸',
        'ru': 'Русский 🇷🇺',
        'fr': 'Français 🇫🇷',
        'zh': '中文 🇨🇳'
        // Add more languages as they become available
      };
      
      return Markup.button.callback(
        languageNames[code] || code,
        `set_lang:${code}`
      );
    });
    
    // Create rows of 2 buttons each
    const keyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      keyboard.push(buttons.slice(i, i + 2));
    }
    
    // Use a multilingual prompt for the language selection to ensure users understand
    await ctx.reply(
      'Please select your language / Por favor, selecciona tu idioma / Выберите язык / Choisissez votre langue / 请选择您的语言:',
      Markup.inlineKeyboard(keyboard)
    );
  });
  
  // Handle language selection callback
  bot.action(/set_lang:(.+)/, async (ctx: any) => {
    const match = ctx.match[1];
    const selectedLanguage = match.trim();
    
    if (i18n.getAvailableLanguages().includes(selectedLanguage)) {
      // Set the user's language preference
      ctx.i18n.locale(selectedLanguage);
      
      // Save the preference to the database if user exists
      if (ctx.dbUser) {
        ctx.dbUser.language = selectedLanguage;
        await ctx.dbUser.save().catch((e: Error) => console.error('Error saving language preference:', e));
      }
      
      // Confirm selection in the new language
      await ctx.answerCbQuery();
      
      // Use the translation for the confirmation message
      await ctx.editMessageText(ctx.i18n.t('language.changed'));
    } else {
      await ctx.answerCbQuery(ctx.i18n.t('language.not_available'));
    }
  });
}

export default setupLanguageCommand; 