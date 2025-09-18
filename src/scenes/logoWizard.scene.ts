// @ts-nocheck - Disable TypeScript checking for this file due to i18n integration
import { Scenes } from 'telegraf';
import { BotContext } from '../types';
import { OpenAIService } from '../services/openai.service';
import { StorageService } from '../services/storage.service';
import { escapeMarkdownV2 } from '../utils/escapeMarkdownV2';
import { imageQueue } from '../utils/imageQueue';
import { ImageGeneration } from '../models/ImageGeneration';
import crypto from 'crypto';
import { addUserInterval } from '../utils/intervalManager';

// Define available options for button selections
const styleOptions = ['Minimalist', 'Elegant', 'Bold', 'Playful', 'Vintage/Retro', 'Modern', 'Corporate/Professional', 'Artistic/Hand-drawn', 'Other (custom)'];

// Expanded typography options with more specific font styles
const typographyOptions = [
  'Serif (classic, traditional)',
  'Sans-serif (clean, modern)',
  'Slab Serif (bold, attention-grabbing)',
  'Decorative (unique, stylized)',
  'Script (elegant, flowing)',
  'Monospace (technical, precise)', 
  'Handwritten (casual, personal)',
  'Geometric (structured, balanced)',
  'Display (distinctive, headline)',
  'Condensed (space-efficient, compact)',
  'Extended (stretched, prominent)',
  'Mixed fonts (combination)',
  'Surprise me'
];

const colorOptions = ['Blue tones', 'Red tones', 'Green tones', 'Black & White', 'Neon colors', 'Pastel colors', 'Earth tones', 'Custom colors'];
const vibeOptions = ['Playful', 'Luxury', 'Tech-savvy', 'Trustworthy', 'Creative', 'Eco-friendly', 'Energetic', 'Professional', 'Other (custom)'];
const industryOptions = ['Technology', 'Finance', 'Healthcare', 'Education', 'Retail', 'Food & Beverage', 'Entertainment', 'Real Estate', 'Other (custom)'];
const audienceOptions = ['Young adults', 'Professionals', 'Families', 'Business clients', 'Students', 'Luxury market', 'Global audience', 'Other (custom)'];

// Expanded icon options with industry-specific and universal symbols
const iconOptions = [
  // Abstract & Geometric
  'Abstract shape',
  'Geometric patterns',
  'Letter-based monogram',
  'Minimalist symbol',
  
  // Technology & Digital
  'Circuit pattern',
  'Tech node/connection',
  'Shield (security)',
  'Cloud symbol',
  'Gear/cog mechanism',
  
  // Nature & Environment
  'Leaf/plant element',
  'Water droplet',
  'Mountain/landscape',
  'Animal silhouette',
  'Sun/energy symbol',
  
  // Business & Commerce
  'Graph/chart motif',
  'Building/structure',
  'Handshake/partnership',
  'Crown/award element',
  'Arrow/direction',
  
  // Other Options
  'Human figure/silhouette',
  'Speech/chat bubble',
  'Star/sparkle accent',
  'Globe/world',
  'Network/connectivity',
  'Custom idea',
  'No icon needed'
];

// Question configuration
const questions = [
  {
    key: 'name',
    promptKey: 'logo.brand_name',
    useButtons: false
  },
  {
    key: 'tagline',
    promptKey: 'logo.tagline',
    useButtons: false
  },
  {
    key: 'mission',
    promptKey: 'logo.mission',
    useButtons: true,
    options: industryOptions,
    multiSelect: false
  },
  {
    key: 'vibe',
    promptKey: 'logo.vibe',
    useButtons: true,
    options: vibeOptions,
    multiSelect: true
  },
  {
    key: 'audience',
    promptKey: 'logo.audience',
    useButtons: true,
    options: audienceOptions,
    multiSelect: true
  },
  {
    key: 'stylePreferences',
    promptKey: 'logo.style_preferences',
    useButtons: true,
    options: styleOptions,
    multiSelect: true
  },
  {
    key: 'colorPreferences',
    promptKey: 'logo.color_preferences',
    useButtons: true,
    options: colorOptions,
    multiSelect: true
  },
  {
    key: 'typography',
    promptKey: 'logo.typography',
    useButtons: true,
    options: typographyOptions,
    multiSelect: true
  },
  {
    key: 'iconIdea',
    promptKey: 'logo.icon_idea',
    useButtons: true,
    options: iconOptions,
    multiSelect: true
  },
  {
    key: 'inspiration',
    promptKey: 'logo.inspiration',
    useButtons: false
  },
  {
    key: 'finalNotes',
    promptKey: 'logo.final_notes',
    useButtons: false
  }
];

// Helper function to create button grid (3 buttons per row)
function createButtonGrid(options, prefix, selectedOptions = [], ctx = null) {
  const buttonRows = [];
  for (let i = 0; i < options.length; i += 3) {
    const row = options.slice(i, i + 3).map(option => {
      const isSelected = selectedOptions.includes(option);
      // Add a checkmark to show selected options
      const text = isSelected ? `✓ ${option}` : option;
      return {
        text: text,
        callback_data: `${prefix}:${option}`
      };
    });
    buttonRows.push(row);
  }
  // Add "Done" button at the bottom for multi-select questions
  if (selectedOptions.length > 0) {
    const doneText = ctx && ctx.i18n ? ctx.i18n.t('logo.multiselect_done') : '✅ Done - Continue';
    buttonRows.push([{
      text: doneText,
      callback_data: `${prefix}:DONE`
    }]);
  }
  return buttonRows;
}

function logErrorWithRef(error: any) {
  const ref = crypto.randomBytes(4).toString('hex');
  console.error(`[ErrorRef:${ref}]`, error);
  return ref;
}

export function createLogoWizardScene(
  openaiService: OpenAIService,
  storageService: StorageService
): Scenes.BaseScene<BotContext> {
  const scene = new Scenes.BaseScene<BotContext>('logoWizard');

  scene.enter(async (ctx) => {
    (ctx.session as any).__step = 0;
    await ctx.reply(ctx.i18n.t(questions[0].promptKey));
  });

  // Handle button callback data
  scene.action(/^option:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const step = typeof (ctx.session as any).__step === 'number' ? (ctx.session as any).__step : 0;
    const question = questions[step];
    const key = question.key;
    const option = ctx.match[1];
    
    // Handle "Done" button for multi-select
    if (option === 'DONE') {
      await moveToNextStep(ctx, step);
      return;
    }
    
    // Handle custom option selection
    if (option.includes('Other') || option.includes('Custom')) {
      const fieldName = key.replace(/([A-Z])/g, ' $1').toLowerCase(); // Convert camelCase to spaces
      await ctx.reply(ctx.i18n.t('logo.custom_input', { field: fieldName }));
      (ctx.session as any).__waitingCustomInput = key;
      return;
    }
    
    // For multi-select questions, toggle the selection
    if (question.multiSelect) {
      // Initialize the array if it doesn't exist
      if (!Array.isArray((ctx.session as any)[key])) {
        (ctx.session as any)[key] = [];
      }
      
      const currentSelections = (ctx.session as any)[key];
      const optionIndex = currentSelections.indexOf(option);
      
      // Toggle selection
      if (optionIndex >= 0) {
        // Remove if already selected
        currentSelections.splice(optionIndex, 1);
      } else {
        // Add if not already selected
        currentSelections.push(option);
      }
      
      // Update the inline keyboard to reflect the selection
      await ctx.editMessageReplyMarkup({
        inline_keyboard: createButtonGrid(question.options, 'option', currentSelections, ctx)
      });
    } else {
      // For single-select, just store the option and move on
      if (key === 'stylePreferences') {
        (ctx.session as any)[key] = [option];
      } else {
        (ctx.session as any)[key] = option;
      }
      
      // Move to next step for single-select questions
      await moveToNextStep(ctx, step);
    }
  });

  // Function to move to the next question
  async function moveToNextStep(ctx, currentStep) {
    if (typeof currentStep === 'number' && currentStep + 1 < questions.length) {
      (ctx.session as any).__step = currentStep + 1;
      const nextQuestion = questions[currentStep + 1];
      
      if (nextQuestion.useButtons) {
        // Initialize empty selection array for multi-select questions
        if (nextQuestion.multiSelect && !Array.isArray((ctx.session as any)[nextQuestion.key])) {
          (ctx.session as any)[nextQuestion.key] = [];
        }
        
        // Get current selections (if any)
        const selectedOptions = Array.isArray((ctx.session as any)[nextQuestion.key]) 
          ? (ctx.session as any)[nextQuestion.key] 
          : [];
        
        const promptText = nextQuestion.multiSelect
          ? `${ctx.i18n.t(nextQuestion.promptKey)} ${ctx.i18n.t('logo.multiselect_hint')}`
          : ctx.i18n.t(nextQuestion.promptKey);
        
        await ctx.reply(promptText, {
          reply_markup: {
            inline_keyboard: createButtonGrid(nextQuestion.options, 'option', selectedOptions, ctx)
          }
        });
      } else {
        await ctx.reply(ctx.i18n.t(nextQuestion.promptKey));
      }
    } else {
      // End of wizard: summarize and confirm
      await showSummary(ctx);
    }
  }
  
  // Function to show the summary and confirmation buttons
  async function showSummary(ctx) {
    // Create user-friendly summary instead of technical asterisk format
    const session = ctx.session as any;
    
    let summary = `🎨 **Perfect! Here's your logo brief:**\n\n`;
    
    // Build friendly, conversational summary
    if (session.name) {
      summary += `📝 Brand Name: ${session.name}\n`;
    }
    
    if (session.tagline && session.tagline !== 'skip') {
      summary += `💭 Tagline: "${session.tagline}"\n`;
    }
    
    if (session.mission) {
      summary += `🏢 Industry: ${session.mission}\n`;
    }
    
    if (session.vibe && session.vibe.length > 0) {
      summary += `✨ Brand Personality: ${Array.isArray(session.vibe) ? session.vibe.join(', ') : session.vibe}\n`;
    }
    
    if (session.audience && session.audience.length > 0) {
      summary += `👥 Target Audience: ${Array.isArray(session.audience) ? session.audience.join(', ') : session.audience}\n`;
    }
    
    if (session.stylePreferences && session.stylePreferences.length > 0) {
      summary += `🎭 Design Style: ${Array.isArray(session.stylePreferences) ? session.stylePreferences.join(', ') : session.stylePreferences}\n`;
    }
    
    if (session.colorPreferences && session.colorPreferences.length > 0) {
      summary += `🎨 Colors: ${Array.isArray(session.colorPreferences) ? session.colorPreferences.join(', ') : session.colorPreferences}\n`;
    }
    
    if (session.typography && session.typography.length > 0) {
      summary += `📝 Typography: ${Array.isArray(session.typography) ? session.typography.join(', ') : session.typography}\n`;
    }
    
    if (session.iconIdea && session.iconIdea.length > 0) {
      summary += `🔰 Icon Ideas: ${Array.isArray(session.iconIdea) ? session.iconIdea.join(', ') : session.iconIdea}\n`;
    }
    
    if (session.inspiration && session.inspiration !== 'skip') {
      summary += `💡 Inspiration: ${session.inspiration}\n`;
    }
    
    if (session.finalNotes && session.finalNotes !== 'skip') {
      summary += `📋 Special Notes: ${session.finalNotes}\n`;
    }
    
    summary += `\n🚀 Ready to create your amazing logo!`;
    
    // Send user-friendly summary
    await ctx.replyWithMarkdownV2(escapeMarkdownV2(summary));
    await ctx.reply(ctx.i18n.t('logo.select_favorite'), {
      reply_markup: {
        inline_keyboard: [
          [{ text: ctx.i18n.t('logo.generate_logo'), callback_data: 'confirm_logo' }],
          [{ text: ctx.i18n.t('logo.restart'), callback_data: 'restart_logo' }]
        ]
      }
    });
    (ctx.session as any).__step = 'confirm';
  }

  scene.on('text', async (ctx, next) => {
    // Add retry counter for invalid input
    if (!ctx.session.__retries) ctx.session.__retries = 0;
    // Check if we're waiting for custom input
    if ((ctx.session as any).__waitingCustomInput) {
      const customKey = (ctx.session as any).__waitingCustomInput;
      const answer = ctx.message.text.trim();
      if (!answer) {
        ctx.session.__retries++;
        if (ctx.session.__retries >= 3) {
          await ctx.reply('Too many invalid attempts. Exiting.');
          return ctx.scene.leave();
        }
        await ctx.reply('Please provide a valid answer.');
        return;
      }
      // Store the custom input
      if (customKey === 'stylePreferences') {
        (ctx.session as any)[customKey] = [answer];
      } else {
        (ctx.session as any)[customKey] = answer;
      }
      
      // Clear the waiting flag
      delete (ctx.session as any).__waitingCustomInput;
      
      // Find the current step
      const currentStep = questions.findIndex(q => q.key === customKey);
      if (currentStep >= 0) {
        await moveToNextStep(ctx, currentStep);
      }
      ctx.session.__retries = 0;
      return;
    }
    
    // Skip this handler if we're in confirmation step
    if ((ctx.session as any).__step === 'confirm') {
      return next();
    }

    const step = typeof (ctx.session as any).__step === 'number' ? (ctx.session as any).__step : 0;
    const answer = ctx.message.text.trim();
    const key = questions[step].key;
    
    if (!answer) {
      ctx.session.__retries++;
      if (ctx.session.__retries >= 3) {
        await ctx.reply('Too many invalid attempts. Exiting.');
        return ctx.scene.leave();
      }
      await ctx.reply('Please provide a valid answer.');
      return;
    }

    // Store answer, handle skip for arrays
    if (key === 'stylePreferences') {
      (ctx.session as any)[key] = answer.toLowerCase() === 'skip' ? [] : answer.split(',').map(s => s.trim());
    } else if (answer.toLowerCase() !== 'skip') {
      (ctx.session as any)[key] = answer;
    }

    // Present next question
    await moveToNextStep(ctx, step);
    ctx.session.__retries = 0;
  });

  scene.action('confirm_logo', async (ctx) => {
    await ctx.answerCbQuery();
    const user = ctx.dbUser;
    if (!user) {
      await ctx.reply(ctx.i18n.t('errors.user_not_found'));
      return;
    }
    const cost = !user.freeGenerationUsed ? 0 : 50; // 50 stars per logo
    if (cost > 0 && user.starBalance < cost) {
      await ctx.reply(ctx.i18n.t('errors.insufficient_stars'));
      return;
    }
    await ctx.reply(ctx.i18n.t('logo.generating'));
    await ctx.scene.leave();
  });

  scene.action('restart_logo', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session = {} as any;
    (ctx.session as any).__step = 0;
    await ctx.reply(ctx.i18n.t('stickers.lets_start_over'));
    await ctx.reply(ctx.i18n.t(questions[0].promptKey));
  });

  scene.on('message', async (ctx, next) => {
    // Check for commands that should exit the scene
    if (ctx.message.text && ['/start', '/menu', '/help', '/exit', 'exit', 'cancel', '/cancel'].includes(ctx.message.text.toLowerCase().trim())) {
      // If user tries to exit, let them exit the scene
      await ctx.scene.leave();
      // After leaving, the bot's main handler will process the command
      return;
    }
    
    await ctx.reply(ctx.i18n.t('logo.please_answer_text'));
  });

  scene.leave(async (ctx) => {
    if ((ctx.session as any).name) {
      await ctx.reply(ctx.i18n.t('logo.generating_based_on'));
      try {
        // Add BullMQ job timeout (5 minutes) - using basic prompts
        await imageQueue.add('generate-logo', {
          session: ctx.session,
          userId: ctx.from?.id,
          chatId: ctx.chat?.id,
          freeGenerationUsed: ctx.dbUser?.freeGenerationUsed || false,
          updateUser: true,
          cost: !ctx.dbUser?.freeGenerationUsed ? 0 : 50,
          useDSPy: false // Disable DSPy - use basic prompts
        }, { timeout: 300000 });
        
        // Start periodic 'still working' updates
        const chatId = ctx.chat?.id;
        let stillWorking = true;
        let intervalId = setInterval(() => {
          if (stillWorking && chatId) {
            ctx.telegram.sendMessage(chatId, 'Still working on your logo...');
          }
        }, 60000);
        
        // Store interval globally instead of in session
        if (ctx.from?.id) {
          addUserInterval(ctx.from.id, intervalId);
        }
        const costMsg = !ctx.dbUser?.freeGenerationUsed ? ctx.i18n.t('stickers.free_generation') : ctx.i18n.t('stars.stars_deducted', { totalCost: 50 });
        await ctx.reply(ctx.i18n.t('logo.request_queued', { costMessage: costMsg }));
      } catch (error) {
        const ref = logErrorWithRef(error);
        await ctx.reply(ctx.i18n.t('errors.generation_failed') + ` (Ref: ${ref})`);
      }
    }
  });

  return scene;
} 