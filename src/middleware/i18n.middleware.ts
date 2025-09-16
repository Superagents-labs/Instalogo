// Simple i18n replacement to avoid telegraf-i18n dependency issues
import path from 'path';
import { BotContext } from '../types';
import { Scenes } from 'telegraf';
import fs from 'fs';

// Simple i18n class to replace telegraf-i18n
class SimpleI18n {
  private translations: { [lang: string]: any } = {};
  private defaultLanguage: string = 'en';

  constructor(options: { defaultLanguage: string; directory: string }) {
    this.defaultLanguage = options.defaultLanguage;
    this.loadTranslations(options.directory);
  }

  private loadTranslations(directory: string) {
    try {
      if (!fs.existsSync(directory)) {
        console.warn(`Locales directory '${directory}' not found, using default messages`);
        // Create default English translations
        this.translations.en = {
          welcome: { greeting: "Welcome to Instalogo Bot!" },
          errors: { generic: "An error occurred. Please try again." }
        };
        return;
      }

      const files = fs.readdirSync(directory).filter(file => file.endsWith('.json'));
      for (const file of files) {
        const lang = path.basename(file, '.json');
        const content = fs.readFileSync(path.join(directory, file), 'utf8');
        this.translations[lang] = JSON.parse(content);
      }
    } catch (error) {
      console.error('Error loading translations:', error);
      // Fallback to default
      this.translations.en = {
        welcome: { greeting: "Welcome to Instalogo Bot!" },
        errors: { generic: "An error occurred. Please try again." }
      };
    }
  }

  t(key: string, lang: string = this.defaultLanguage): string {
    const keys = key.split('.');
    let value = this.translations[lang] || this.translations[this.defaultLanguage];
    
    for (const k of keys) {
      value = value?.[k];
      if (!value) break;
    }
    
    return value || key; // Return key if translation not found
  }

  getAvailableLanguages(): string[] {
    return Object.keys(this.translations);
  }
}

// Create i18n instance
const i18n = new SimpleI18n({
  defaultLanguage: 'en',
  directory: path.resolve(process.cwd(), 'locales')
});

/**
 * Middleware to add simple i18n to context
 */
export const i18nMiddleware = async (ctx: BotContext, next: any) => {
  // Add simple i18n methods to context
  ctx.i18n = {
    t: (key: string, variables?: Record<string, any>) => {
      const lang = ctx.dbUser?.language || ctx.from?.language_code?.split('-')[0] || 'en';
      let translation = i18n.t(key, lang);
      
      // Replace template variables if provided
      if (variables) {
        Object.keys(variables).forEach(varKey => {
          const placeholder = `{{${varKey}}}`;
          translation = translation.replace(new RegExp(placeholder, 'g'), variables[varKey]);
        });
      }
      
      return translation;
    },
    locale: (lang?: string) => {
      if (lang && ctx.dbUser) {
        ctx.dbUser.language = lang;
        ctx.dbUser.save().catch(e => console.error('Error saving language:', e));
      }
      return ctx.dbUser?.language || 'en';
    }
  };
  
  return next();
};

/**
 * Function to extend the Stage with i18n middleware
 */
export const extendStageWithI18n = (stage: Scenes.Stage<BotContext>) => {
  // Add middleware to ensure i18n is available in scenes
  stage.use((ctx, next) => {
    if (!ctx.i18n) {
      // Add simple fallback i18n if missing
      ctx.i18n = {
        t: (key: string) => key,
        locale: () => 'en'
      };
    }
    return next();
  });
  
  return stage;
};

export default i18n;