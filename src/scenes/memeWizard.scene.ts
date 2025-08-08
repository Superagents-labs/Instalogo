// @ts-nocheck - Disable TypeScript checking for this file due to i18n integration
import { Scenes } from 'telegraf';
import { BotContext } from '../types';
import { OpenAIService } from '../services/openai.service';
import { imageQueue } from '../utils/imageQueue';
import { ImageGeneration } from '../models/ImageGeneration';
import crypto from 'crypto';
import { MongoDBService } from '../services/mongodb.service';

// Removed hardcoded questions - we'll use i18n translation keys instead
export function createMemeWizardScene(openaiService: OpenAIService, mongodbService: MongoDBService): Scenes.WizardScene<BotContext> {
  const scene = new Scenes.WizardScene<BotContext>(
    'memeWizard',
    // Step 1: Image or skip
    async (ctx) => {
      // Don't process if we're in a recursive middleware call
      if (ctx.__processingFlag) return;
      
      // Check if this is called from an action button to avoid duplicate messages
      // We'll use a session flag to track if we've already shown the upload message
      if (!(ctx.session as any).__uploadMessageShown) {
        await ctx.reply(ctx.i18n.t('memes.upload_image'));
        // Set a flag so we don't show it again
        (ctx.session as any).__uploadMessageShown = true;
      }
      
      console.log('[DEBUG] About to advance from Step 1, current step:', ctx.wizard.cursor);
      await ctx.wizard.next();
      console.log('[DEBUG] Advanced to step:', ctx.wizard.cursor);
      return;
    },
    // Step 2: Wait for image or skip
    async (ctx) => {
      // Don't process if we're in a recursive middleware call
      if (ctx.__processingFlag) return;
      
      if (ctx.message && 'photo' in ctx.message) {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        (ctx.session as any).memeImageFileId = photo.file_id;
        (ctx.session as any).memeImageSkipped = false;
        // Download the image and store the buffer
        try {
          const fileLink = await ctx.telegram.getFileLink(photo.file_id);
          const response = await fetch(fileLink.href);
          const arrayBuffer = await response.arrayBuffer();
          (ctx.session as any).memeImageBuffer = Buffer.from(arrayBuffer);
        } catch (err) {
          console.error('Failed to download meme image:', err);
          (ctx.session as any).memeImageBuffer = undefined;
        }
        // Present usage options
        await ctx.reply('How should the image be used in your meme?', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🤖 Let AI Decide (recommended)', callback_data: 'meme_image_usage_ai_decide' }],
              [{ text: '🖼️ Use as Background', callback_data: 'meme_image_usage_background' }],
              [{ text: '🎨 Inpaint/Modify', callback_data: 'meme_image_usage_inpaint' }],
              [{ text: '📋 Use as Template', callback_data: 'meme_image_usage_template' }]
            ]
          }
        });
        return; // Wait for user to select usage
      } else if (ctx.message && 'text' in ctx.message && ctx.message.text.trim().toLowerCase() === 'skip') {
        (ctx.session as any).memeImageFileId = undefined;
        (ctx.session as any).memeImageSkipped = true;
        (ctx.session as any).memeImageBuffer = undefined;
        (ctx.session as any).memeImageUsage = 'none';
        await ctx.reply(ctx.i18n.t('memes.no_image') + ' ' + ctx.i18n.t('memes.core_topic'));
        console.log('[DEBUG] About to advance from Step 2 (skip), current step:', ctx.wizard.cursor);
        await ctx.wizard.next();
        console.log('[DEBUG] Advanced to step:', ctx.wizard.cursor);
        return;
      } else if (ctx.message) {
        // Only send the prompt once per session to avoid duplication
        await ctx.reply(ctx.i18n.t('memes.upload_image'));
        return;
      }
    },
    // Step 3: Topic
    async (ctx) => {
      // Don't process if we're in a recursive middleware call
      if (ctx.__processingFlag) return;
      
      if (!ctx.session.__retries) ctx.session.__retries = 0;
      if (ctx.message && 'text' in ctx.message) {
        (ctx.session as any).memeTopic = ctx.message.text;
        ctx.session.__retries = 0;
        await ctx.reply(ctx.i18n.t('memes.target_audience'));
        console.log('[DEBUG] About to advance from Step 3, current step:', ctx.wizard.cursor);
        await ctx.wizard.next();
        console.log('[DEBUG] Advanced to step:', ctx.wizard.cursor);
        return;
      } else {
        ctx.session.__retries++;
        if (ctx.session.__retries >= 3) {
          await ctx.reply('Too many invalid attempts. Exiting.');
          return ctx.scene.leave();
        }
        await ctx.reply(ctx.i18n.t('memes.enter_topic'));
        return;
      }
    },
    // Step 4: Audience
    async (ctx) => {
      // Don't process if we're in a recursive middleware call
      if (ctx.__processingFlag) return;
      
      if (!ctx.session.__retries) ctx.session.__retries = 0;
      if (ctx.message && 'text' in ctx.message) {
        (ctx.session as any).memeAudience = ctx.message.text;
        ctx.session.__retries = 0;
        await ctx.reply(ctx.i18n.t('memes.mood_emotion'));
        console.log('[DEBUG] About to advance from Step 4, current step:', ctx.wizard.cursor);
        await ctx.wizard.next();
        console.log('[DEBUG] Advanced to step:', ctx.wizard.cursor);
        return;
      } else {
        ctx.session.__retries++;
        if (ctx.session.__retries >= 3) {
          await ctx.reply('Too many invalid attempts. Exiting.');
          return ctx.scene.leave();
        }
        await ctx.reply(ctx.i18n.t('memes.enter_audience'));
        return;
      }
    },
    // Step 5: Mood
    async (ctx) => {
      // Don't process if we're in a recursive middleware call
      if (ctx.__processingFlag) return;
      
      if (!ctx.session.__retries) ctx.session.__retries = 0;
      if (ctx.message && 'text' in ctx.message) {
        (ctx.session as any).memeMood = ctx.message.text;
        ctx.session.__retries = 0;
        await ctx.reply(ctx.i18n.t('memes.crypto_elements'));
        console.log('[DEBUG] About to advance from Step 5, current step:', ctx.wizard.cursor);
        await ctx.wizard.next();
        console.log('[DEBUG] Advanced to step:', ctx.wizard.cursor);
        return;
      } else {
        ctx.session.__retries++;
        if (ctx.session.__retries >= 3) {
          await ctx.reply('Too many invalid attempts. Exiting.');
          return ctx.scene.leave();
        }
        await ctx.reply(ctx.i18n.t('memes.enter_mood'));
        return;
      }
    },
    // Step 6: Elements
    async (ctx) => {
      // Don't process if we're in a recursive middleware call
      if (ctx.__processingFlag) return;
      
      if (ctx.message && 'text' in ctx.message && ctx.message.text.trim().toUpperCase() === 'DEBUG') {
        console.log('[DEBUG] Full session:', ctx.session);
        console.log('[DEBUG] Wizard step:', ctx.wizard.cursor);
        await ctx.reply('[DEBUG] Session and wizard step logged to server.');
        return;
      }
      console.log('[DEBUG] Step 6 (Elements) handler called. ctx.message:', ctx.message);
      if (ctx.message && 'text' in ctx.message) {
        console.log('[DEBUG] Step 6 received text:', ctx.message.text);
        (ctx.session as any).memeElements = ctx.message.text;
        console.log('[DEBUG] About to advance from Step 6, current step:', ctx.wizard.cursor);
        await ctx.wizard.next();
        console.log('[DEBUG] Advanced to step:', ctx.wizard.cursor);
        return;
      } else {
        console.log('[DEBUG] Step 6 received non-text or invalid input.');
        await ctx.reply('Please provide meme elements.');
        return;
      }
    },
    // Step 7: Inline Meme Style Selection
    async (ctx) => {
      if (ctx.callbackQuery && ctx.callbackQuery.data) {
        const data = ctx.callbackQuery.data;
        // Handle prefixed style selections 
        if (data.startsWith('meme_style_')) {
          const styleKey = data.replace('meme_style_', '');
          (ctx.session as any).memeStyle = styleKey;
          await ctx.answerCbQuery(`Style selected: ${styleKey}`);
          return ctx.wizard.next();
        }
        // Direct style key selection (fallback handling for existing buttons)
        else {
          (ctx.session as any).memeStyle = data;
          await ctx.answerCbQuery(`Style selected: ${data}`);
          return ctx.wizard.next();
        }
      } else {
        // Present inline button options for meme styles
        const memeStyles = [
          { key: 'doge', label: 'Doge Style 🐕' },
          { key: 'wojak', label: 'Wojak/Feels Guy 😔' },
          { key: 'distracted', label: 'Distracted Boyfriend 👀' },
          { key: 'stonks', label: 'Stonks Guy 📈' },
          { key: 'pepe', label: 'Pepe The Frog 🐸' },
          { key: 'custom', label: 'Custom Style' }
        ];
        await ctx.reply(ctx.i18n.t('memes.style_select') || 'Choose a meme style:', {
          reply_markup: {
            inline_keyboard: memeStyles.map(style => ([{ 
              text: style.label, 
              callback_data: `meme_style_${style.key}` 
            }]))
          }
        });
        // Wait here for the user to press a button
      }
    },
    // Step 8: Handle custom style input if the user selected 'custom'
    async (ctx) => {
      // Skip processing on callback events; the action handler already prompted
      if (ctx.callbackQuery) return;
      const styleKey = (ctx.session as any).memeStyle;
      const isCustomStyle = styleKey === 'custom';
      if (isCustomStyle) {
        if (ctx.message && 'text' in ctx.message) {
          (ctx.session as any).memeStyle = ctx.message.text;
          if (!(ctx.session as any).__punchlineShown) {
            await ctx.reply(ctx.i18n.t('memes.punchline'));
            (ctx.session as any).__punchlineShown = true;
          }
          return ctx.wizard.next();
        } else {
          await ctx.reply(ctx.i18n.t('memes.custom_style_prompt') || 'Please describe your custom meme style:');
        }
      } else {
        if (!(ctx.session as any).__punchlineShown) {
          await ctx.reply(ctx.i18n.t('memes.punchline'));
          (ctx.session as any).__punchlineShown = true;
        }
        return ctx.wizard.next();
      }
    },
    // Step 9: Punchline/Caption
    async (ctx) => {
      if (!ctx.session.__retries) ctx.session.__retries = 0;
      if (ctx.message && 'text' in ctx.message) {
        (ctx.session as any).memeCatch = ctx.message.text;
        ctx.session.__retries = 0;
        await ctx.reply(ctx.i18n.t('memes.format'));
        return ctx.wizard.next();
      } else {
        ctx.session.__retries++;
        if (ctx.session.__retries >= 3) {
          await ctx.reply('Too many invalid attempts. Exiting.');
          return ctx.scene.leave();
        }
        await ctx.reply(ctx.i18n.t('memes.enter_punchline'));
        return;
      }
    },
    // Step 10: Format
    async (ctx) => {
      if (!ctx.session.__retries) ctx.session.__retries = 0;
      if (ctx.message && 'text' in ctx.message) {
        (ctx.session as any).memeFormat = ctx.message.text;
        ctx.session.__retries = 0;
        await ctx.reply(ctx.i18n.t('memes.color_mood'));
        return ctx.wizard.next();
      } else {
        ctx.session.__retries++;
        if (ctx.session.__retries >= 3) {
          await ctx.reply('Too many invalid attempts. Exiting.');
          return ctx.scene.leave();
        }
        await ctx.reply(ctx.i18n.t('memes.enter_format'));
        return;
      }
    },
    // Step 11: Color mood and summary
    async (ctx) => {
      if (!ctx.session.__retries) ctx.session.__retries = 0;
      if (ctx.message && 'text' in ctx.message) {
        (ctx.session as any).memeColor = ctx.message.text;
        ctx.session.__retries = 0;
        
        // Display summary
        let summary = ctx.i18n.t('memes.meme_brief') + '\n';
        summary += `• ${ctx.i18n.t('memes.topic')}: ${(ctx.session as any).memeTopic || ''}\n`;
        summary += `• ${ctx.i18n.t('memes.audience')}: ${(ctx.session as any).memeAudience || ''}\n`;
        summary += `• ${ctx.i18n.t('memes.mood')}: ${(ctx.session as any).memeMood || ''}\n`;
        summary += `• ${ctx.i18n.t('memes.elements')}: ${(ctx.session as any).memeElements || ''}\n`;
        summary += `• ${ctx.i18n.t('memes.punchline_caption')}: ${(ctx.session as any).memeCatch || ''}\n`;
        summary += `• ${ctx.i18n.t('memes.format_type')}: ${(ctx.session as any).memeFormat || ''}\n`;
        summary += `• ${ctx.i18n.t('memes.color')}: ${(ctx.session as any).memeColor || ''}`;
        
        await ctx.reply(summary);
        await ctx.reply(ctx.i18n.t('memes.select_favorite') || 'Ready to generate your meme? Choose an option:', {
          reply_markup: {
            inline_keyboard: [
              [{ text: ctx.i18n.t('memes.generate_meme'), callback_data: 'confirm_meme' }],
              [{ text: ctx.i18n.t('memes.restart'), callback_data: 'restart_meme' }]
            ]
          }
        });
        
        return;
      } else {
        ctx.session.__retries++;
        if (ctx.session.__retries >= 3) {
          await ctx.reply('Too many invalid attempts. Exiting.');
          return ctx.scene.leave();
        }
        await ctx.reply(ctx.i18n.t('memes.enter_color'));
        return;
      }
    }
  );
  
  // Add an enter handler to reset session state
  scene.enter(async (ctx) => {
    // Reset all meme-related session variables, including legacy keys
    const memeKeys = [
      'memeImageFileId',
      'memeImageSkipped',
      'memeTopic',
      'memeAudience',
      'memeMood',
      'memeElements',
      'memeCatch',
      'memeFormat',
      'memeColor',
      'memeStyle',
      'memeStyleDesc',
      'memeText',
      '__uploadMessageShown',
      '__punchlineShown'
    ];
    memeKeys.forEach(key => delete (ctx.session as any)[key]);
    
    // Save and clear the flag to avoid reusing it
    const fromMemeStart = (ctx.session as any).__fromMemeStart;
    delete (ctx.session as any).__fromMemeStart;
    
    // Check if the user has previous meme parameters
    if (ctx.from?.id) {
      try {
        const hasLastParams = await mongodbService.getLastMemeParams(ctx.from.id);
        
        if (hasLastParams) {
          // If they have previous parameters, offer to reload WITHOUT showing "Upload your image" message
          await ctx.reply('You have previous meme settings:', {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Use Previous Meme Settings', callback_data: 'reload_last_meme' }],
                [{ text: '🆕 Create New Meme', callback_data: 'new_meme' }]
              ]
            }
          });
          return;
        }
      } catch (error) {
        console.error('Error checking for previous meme parameters:', error);
        // Continue with normal flow if there's an error
      }
    }
    
    // If no previous parameters or error, start the regular flow
    (ctx.session as any).__uploadMessageShown = true; // Mark as shown since we're about to show it
    await ctx.reply(ctx.i18n.t('memes.upload_image'));
  });
  
  // Register action handlers
  scene.action('confirm_meme', async (ctx) => {
    await ctx.answerCbQuery();
    const user = ctx.dbUser;
    if (!user) {
      await ctx.reply(ctx.i18n.t('errors.user_not_found'));
      return ctx.scene.leave();
    }
    
    // Use the meme format for display but map to standard quality levels for cost
    const memeFormat = (ctx.session as any).memeFormat || 'Classic Impact font';
    
    // Map the format to standard quality levels for cost calculation
    let quality = 'Good';  // Default quality level
    if (memeFormat.toLowerCase().includes('comic') || 
        memeFormat.toLowerCase().includes('panel')) {
      quality = 'Medium';
    } else if (memeFormat.toLowerCase().includes('surreal') || 
              memeFormat.toLowerCase().includes('collage')) {
      quality = 'High';
    }
    
    const cost = !user.freeGenerationUsed ? 0 : calculateMemeCost(quality);
    if (cost > 0 && user.starBalance < cost) {
      await ctx.reply(ctx.i18n.t('errors.insufficient_stars'));
      return ctx.scene.leave();
    }
    await ctx.reply(ctx.i18n.t('memes.generating'));
    
    // Save the current meme parameters for future use
    const memeParams = {
      memeTopic: (ctx.session as any).memeTopic,
      memeAudience: (ctx.session as any).memeAudience,
      memeMood: (ctx.session as any).memeMood,
      memeElements: (ctx.session as any).memeElements,
      memeCatch: (ctx.session as any).memeCatch,
      memeFormat: (ctx.session as any).memeFormat,
      memeColor: (ctx.session as any).memeColor,
      memeStyle: (ctx.session as any).memeStyle,
      timestamp: Date.now()
    };
    
    // Store in MongoDB with the user's ID
    if (ctx.from?.id) {
      await mongodbService.setLastMemeParams(ctx.from.id, memeParams);
    }
    
    // Build the meme prompt from session
    let memePrompt = `Create a viral crypto meme`;
    if ((ctx.session as any).memeImageBuffer && (ctx.session as any).memeImageUsage) {
      const usage = (ctx.session as any).memeImageUsage;
      if (usage === 'ai_decide') {
        memePrompt += `. Use the uploaded image in the most meme-appropriate way (background, template, or inpainting) based on the meme style and content.`;
      } else if (usage === 'background') {
        memePrompt += `. Use the uploaded image as the meme background. Overlay all text and elements, do not modify the image content.`;
      } else if (usage === 'inpaint') {
        memePrompt += `. Modify the uploaded image to fit the meme joke, but keep the main subject recognizable.`;
      } else if (usage === 'template') {
        memePrompt += `. Use the uploaded image as a classic meme template. Place text and elements in standard meme locations for this format.`;
      }
    }
    if ((ctx.session as any).memeTopic) memePrompt += ` about ${(ctx.session as any).memeTopic}`;
    if ((ctx.session as any).memeAudience) memePrompt += ` for ${(ctx.session as any).memeAudience}`;
    if ((ctx.session as any).memeMood) memePrompt += ` in a ${(ctx.session as any).memeMood} style`;
    if ((ctx.session as any).memeElements) memePrompt += ` with ${(ctx.session as any).memeElements}`;
    if ((ctx.session as any).memeCatch && (ctx.session as any).memeCatch.toLowerCase() !== 'skip') {
      memePrompt += `. Caption: ${(ctx.session as any).memeCatch}`;
    }
    if ((ctx.session as any).memeFormat && (ctx.session as any).memeFormat.toLowerCase() !== 'other') {
      memePrompt += `. Format: ${(ctx.session as any).memeFormat}`;
    }
    if ((ctx.session as any).memeColor && (ctx.session as any).memeColor.toLowerCase() !== 'skip') {
      memePrompt += `. Color mood: ${(ctx.session as any).memeColor}`;
    }
    if ((ctx.session as any).memeStyleDesc) memePrompt += `. Style: ${(ctx.session as any).memeStyleDesc}`;
    else if ((ctx.session as any).memeStyle) memePrompt += `. Style: ${(ctx.session as any).memeStyle}`;
    memePrompt += ".";
    memePrompt += " CRITICAL RULE: All text MUST be positioned well within the image boundaries with substantial margins (at least 10% of image height from top and bottom edges). Absolutely NO text or important elements should be cut off or cropped at the edges. Place text centrally and ensure there is ample padding around all text elements. Text should be clearly legible with high contrast against the background. For headlines or main text, position them in the middle 70% of the image area. Ensure correct spelling and grammar for all text. Do not generate any random characters or watermarks. Avoid weird hands, faces, or other parts. No visual artifacts, no borders, and ensure high visual clarity. The meme should look like a professional, well-composed poster or social media meme.";
    
    try {
      // Prepare cost message
      const costMessage = cost > 0 
        ? ctx.i18n.t('memes.stars_deducted', { totalCost: cost }) 
        : ctx.i18n.t('memes.free_generation');
      
      await imageQueue.add('generate-meme', {
        prompt: memePrompt,
        userId: ctx.from?.id,
        chatId: ctx.chat?.id,
        session: ctx.session,
        freeGenerationUsed: user.freeGenerationUsed,
        updateUser: true,
        quality: quality,  // Use standardized quality for DB
        format: memeFormat, // Keep original format for reference
        cost: cost,
        imageBuffer: (ctx.session as any).memeImageBuffer,
        useDSPy: false // Disable DSPy - use basic prompts
      }, { timeout: 300000 });
      
      // Start periodic 'still working' updates with longer intervals and a maximum count
      const chatId = ctx.chat?.id;
      let stillWorking = true;
      let updateCount = 0;
      const MAX_UPDATES = 3; // Maximum number of "still working" messages to send
      
      let intervalId = setInterval(() => {
        if (stillWorking && chatId && updateCount < MAX_UPDATES) {
          updateCount++;
          ctx.telegram.sendMessage(chatId, 'Still working on your meme...');
          
          // If we've reached the maximum, don't send any more but keep the interval running
          // in case we need to clear it when the job completes
          if (updateCount >= MAX_UPDATES) {
            console.log('Maximum "still working" updates sent');
          }
        }
      }, 120000); // Increase to 2 minutes between updates (was 60000 = 1 minute)
      
      ctx.session.__memeStillWorkingInterval = intervalId;
      await ctx.reply(ctx.i18n.t('memes.request_queued', { costMessage }));
    } catch (err) {
      const ref = logErrorWithRef(err);
      await ctx.reply(ctx.i18n.t('errors.generation_failed') + ` (Ref: ${ref})`);
    }
    
    // Save important properties before leaving scene
    const scenes = ctx.session?.__scenes;
    const language = ctx.i18n?.locale();
    
    // Leave the scene
    await ctx.scene.leave();
    
    // Ensure the session is completely reset except for essential system properties
    ctx.session = { 
      __scenes: scenes || { current: null, state: {} }
    } as any;
    
    // Restore language
    if (language && ctx.i18n) {
      ctx.i18n.locale(language);
    }
    
    console.log('Meme wizard scene left and session fully reset');
  });
  
  scene.action('restart_meme', async (ctx) => {
    await ctx.answerCbQuery();
    
    // Save important properties before leaving scene
    const scenes = ctx.session?.__scenes;
    const language = ctx.i18n?.locale();
    
    // Leave the scene
    await ctx.scene.leave();
    
    // Ensure the session is completely reset except for essential system properties
    ctx.session = { 
      __scenes: scenes || { current: null, state: {} }
    } as any;
    
    // Restore language
    if (language && ctx.i18n) {
      ctx.i18n.locale(language);
    }
    
    console.log('Meme wizard restarted and session fully reset');
    
    await ctx.reply(ctx.i18n.t('memes.lets_start_over'));
    
    // Re-enter the scene to start from the beginning
    await ctx.scene.enter('memeWizard');
  });
  
  // Register style selection action handlers
  const memeStyles = [
    { key: 'doge', label: 'Doge Style 🐕' },
    { key: 'wojak', label: 'Wojak/Feels Guy 😔' },
    { key: 'distracted', label: 'Distracted Boyfriend 👀' },
    { key: 'stonks', label: 'Stonks Guy 📈' },
    { key: 'pepe', label: 'Pepe The Frog 🐸' },
    { key: 'custom', label: 'Custom Style' }
  ];
  
  // Register handlers for each style button
  memeStyles.forEach(style => {
    scene.action(`meme_style_${style.key}`, async (ctx) => {
      await ctx.answerCbQuery(`Selected: ${style.label}`);
      (ctx.session as any).memeStyle = style.key;
      
      if (style.key === 'custom') {
        await ctx.reply(ctx.i18n.t('memes.custom_style_prompt') || 'Please describe your custom meme style:');
      } else {
        await ctx.reply(ctx.i18n.t('memes.punchline'));
        return ctx.wizard.next();
      }
    });
  });
  
  // Add a new action to reload previous meme parameters
  scene.action('reload_last_meme', async (ctx) => {
    await ctx.answerCbQuery();
    
    if (!ctx.from?.id) {
      await ctx.reply('Could not identify your user account.');
      return;
    }
    
    // Try to get the last meme parameters
    const lastParams = await mongodbService.getLastMemeParams(ctx.from.id);
    
    if (!lastParams) {
      await ctx.reply('No previous meme parameters found. Please create a new meme from scratch.');
      return;
    }
    
    // Restore the parameters to the session
    Object.assign(ctx.session, lastParams);
    
    // Skip to the summary step
    ctx.wizard.selectStep(11); // Assuming step 11 is the summary step
    
    // Display summary of loaded parameters
    let summary = ctx.i18n.t('memes.meme_brief') + '\n';
    summary += `• ${ctx.i18n.t('memes.topic')}: ${lastParams.memeTopic || ''}\n`;
    summary += `• ${ctx.i18n.t('memes.audience')}: ${lastParams.memeAudience || ''}\n`;
    summary += `• ${ctx.i18n.t('memes.mood')}: ${lastParams.memeMood || ''}\n`;
    summary += `• ${ctx.i18n.t('memes.elements')}: ${lastParams.memeElements || ''}\n`;
    summary += `• ${ctx.i18n.t('memes.punchline_caption')}: ${lastParams.memeCatch || ''}\n`;
    summary += `• ${ctx.i18n.t('memes.format_type')}: ${lastParams.memeFormat || ''}\n`;
    summary += `• ${ctx.i18n.t('memes.color')}: ${lastParams.memeColor || ''}`;
    
    await ctx.reply('Loaded your last meme settings:\n\n' + summary);
    await ctx.reply('Ready to generate your meme?', {
      reply_markup: {
        inline_keyboard: [
          [{ text: ctx.i18n.t('memes.generate_meme'), callback_data: 'confirm_meme' }],
          [{ text: ctx.i18n.t('memes.restart'), callback_data: 'restart_meme' }]
        ]
      }
    });
  });

  // Handle the new_meme action
  scene.action('new_meme', async (ctx) => {
    await ctx.answerCbQuery();
    // Set the flag to indicate we've already shown the upload message
    (ctx.session as any).__uploadMessageShown = true;
    // Show the upload message manually
    await ctx.reply(ctx.i18n.t('memes.upload_image'));
    // Go to step 1 (upload image handling)
    ctx.wizard.selectStep(1);
  });
  
  // Add action handlers for image usage selection
  scene.action(/^meme_image_usage_(ai_decide|background|inpaint|template)$/, async (ctx) => {
    const usage = ctx.match[1];
    (ctx.session as any).memeImageUsage = usage;
    await ctx.answerCbQuery('Image usage set!');
    await ctx.reply(ctx.i18n.t('memes.core_topic'));
    return ctx.wizard.next();
  });
  
  // Add a middleware to handle the "need to type twice" issue specifically for the double input
  scene.use(async (ctx, next) => {
    // Only process text messages, and only for the problematic step
    if (ctx.message && 'text' in ctx.message && ctx.wizard.cursor === 5) {
      // Set a flag to prevent recursive processing
      if (!ctx.__processingFlag) {
        await next();
        
        // After the step 6 handler runs, check if we've advanced to step 7
        if (ctx.wizard.cursor === 6) {
          // Store the text message for re-use
          const textMessage = ctx.message.text;
          
          // Set a processing flag for the recursion detection
          ctx.__processingFlag = true;
          
          // Clear the message to simulate a fresh context
          delete ctx.message; 
          
          // We need to explicitly set the step for the style selection
          await scene.middleware()(ctx);
          
          // Reset the flag
          ctx.__processingFlag = false;
          
          // Log for debugging
          console.log('[DEBUG] Simulating next step handler automatically.');
        }
      } else {
        // If we're in a recursive call, just process normally
        await next();
      }
    } else {
      await next();
    }
  });
  
  // Add a leave handler to properly clean up the scene
  scene.leave(async (ctx) => {
    // Clear any interval timers to prevent memory leaks
    if (ctx.session?.__memeStillWorkingInterval) {
      clearInterval(ctx.session.__memeStillWorkingInterval);
      delete ctx.session.__memeStillWorkingInterval;
    }
    
    // Clear all meme-related session keys
    const memeKeys = [
      'memeImageFileId', 'memeImageSkipped', 'memeTopic', 
      'memeAudience', 'memeMood', 'memeElements', 
      'memeCatch', 'memeFormat', 'memeColor', 'memeStyle', 
      'memeStyleDesc', 'memeImageBuffer', 'memeImageUsage',
      '__uploadMessageShown',
      '__punchlineShown'
    ];
    
    // Remove session data but preserve system properties
    memeKeys.forEach(key => {
      if (ctx.session) delete (ctx.session as any)[key];
    });
    
    console.log('Scene leave handler: cleaned up meme session data');
  });
  
  return scene;
}

function calculateMemeCost(quality: string): number {
  if (quality.toLowerCase() === 'good') return 50;
  if (quality.toLowerCase() === 'medium') return 70;
  if (quality.toLowerCase() === 'high') return 90;
  return 50; // Default
}

function logErrorWithRef(error: any) {
  const ref = crypto.randomBytes(4).toString('hex');
  console.error(`[ErrorRef:${ref}]`, error);
  return ref;
} 