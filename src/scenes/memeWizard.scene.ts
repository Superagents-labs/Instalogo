// @ts-nocheck - Disable TypeScript checking for this file due to i18n integration
import { Scenes } from 'telegraf';
import { BotContext } from '../types';
import { OpenAIService } from '../services/openai.service';
import { imageQueue } from '../utils/imageQueue';
import { ImageGeneration } from '../models/ImageGeneration';
import crypto from 'crypto';
import { MongoDBService } from '../services/mongodb.service';
import { addUserInterval } from '../utils/intervalManager';

// Removed hardcoded questions - we'll use i18n translation keys instead
export function createMemeWizardScene(openaiService: OpenAIService, mongodbService: MongoDBService): Scenes.WizardScene<BotContext> {
  const scene = new Scenes.WizardScene<BotContext>(
    'memeWizard',
    // Step 1: Image upload or skip
    async (ctx) => {
      if (!ctx.message) {
        await ctx.reply('🖼️ Upload an image for your meme (or type "skip"):', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '⏭️ Skip Image', callback_data: 'meme_skip_image' }]
            ]
          }
        });
        return;
      }
      
      if (ctx.message && 'photo' in ctx.message) {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        (ctx.session as any).memeImageFileId = photo.file_id;
        (ctx.session as any).memeImageSkipped = false;
        try {
          const fileLink = await ctx.telegram.getFileLink(photo.file_id);
          const response = await fetch(fileLink.href);
          const arrayBuffer = await response.arrayBuffer();
          (ctx.session as any).memeImageBuffer = Buffer.from(arrayBuffer);
        } catch (err) {
          console.error('Failed to download meme image:', err);
          (ctx.session as any).memeImageBuffer = undefined;
        }
        await ctx.reply('✅ Image uploaded! Choose your meme topic:', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Crypto/Moon', callback_data: 'meme_topic_crypto' }],
              [{ text: '💰 DeFi/Trading', callback_data: 'meme_topic_defi' }],
              [{ text: '🎮 Gaming', callback_data: 'meme_topic_gaming' }],
              [{ text: '📱 Tech/Meta', callback_data: 'meme_topic_tech' }],
              [{ text: '🎯 Custom Topic', callback_data: 'meme_topic_custom' }]
            ]
          }
        });
        return;
      } else if (ctx.message && 'text' in ctx.message && ctx.message.text.trim().toLowerCase() === 'skip') {
        (ctx.session as any).memeImageFileId = undefined;
        (ctx.session as any).memeImageSkipped = true;
        (ctx.session as any).memeImageBuffer = undefined;
        await ctx.reply('✅ No image! Choose your meme topic:', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Crypto/Moon', callback_data: 'meme_topic_crypto' }],
              [{ text: '💰 DeFi/Trading', callback_data: 'meme_topic_defi' }],
              [{ text: '🎮 Gaming', callback_data: 'meme_topic_gaming' }],
              [{ text: '📱 Tech/Meta', callback_data: 'meme_topic_tech' }],
              [{ text: '🎯 Custom Topic', callback_data: 'meme_topic_custom' }]
            ]
          }
        });
        await ctx.wizard.next();
        return;
      } else {
        await ctx.reply('🖼️ Please upload an image or type "skip"');
        return;
      }
    },
    // Step 2: Mood selection
    async (ctx) => {
      if (ctx.callbackQuery && ctx.callbackQuery.data?.startsWith('meme_topic_')) {
        const topic = ctx.callbackQuery.data.replace('meme_topic_', '');
        (ctx.session as any).memeTopic = topic;
        await ctx.answerCbQuery(`Topic: ${topic}`);
        
        if (topic === 'custom') {
          await ctx.reply('✍️ What\'s your custom topic? (e.g., "Bitcoin", "NFTs", "AI")');
          return;
        }
        
        await ctx.reply('😄 Choose the mood:', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔥 Hype/Excited', callback_data: 'meme_mood_hype' }],
              [{ text: '😏 Sarcastic/Funny', callback_data: 'meme_mood_sarcastic' }],
              [{ text: '😢 Sad/Disappointed', callback_data: 'meme_mood_sad' }],
              [{ text: '🤔 Confused/Surprised', callback_data: 'meme_mood_confused' }],
              [{ text: '🎯 Custom Mood', callback_data: 'meme_mood_custom' }]
            ]
          }
        });
        return;
      } else if (ctx.message && 'text' in ctx.message) {
        (ctx.session as any).memeTopic = ctx.message.text;
        await ctx.reply('😄 Choose the mood:', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔥 Hype/Excited', callback_data: 'meme_mood_hype' }],
              [{ text: '😏 Sarcastic/Funny', callback_data: 'meme_mood_sarcastic' }],
              [{ text: '😢 Sad/Disappointed', callback_data: 'meme_mood_sad' }],
              [{ text: '🤔 Confused/Surprised', callback_data: 'meme_mood_confused' }],
              [{ text: '🎯 Custom Mood', callback_data: 'meme_mood_custom' }]
            ]
          }
        });
        return;
      } else {
        await ctx.reply('Please choose a topic first');
        return;
      }
    },
    // Step 3: Style selection
    async (ctx) => {
      if (ctx.callbackQuery && ctx.callbackQuery.data?.startsWith('meme_mood_')) {
        const mood = ctx.callbackQuery.data.replace('meme_mood_', '');
        (ctx.session as any).memeMood = mood;
        await ctx.answerCbQuery(`Mood: ${mood}`);
        
        if (mood === 'custom') {
          await ctx.reply('✍️ What mood? (e.g., "angry", "happy", "shocked")');
          return;
        }
        
        await ctx.reply('🎨 Choose meme style:', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🐕 Doge Style', callback_data: 'meme_style_doge' }],
              [{ text: '😔 Wojak/Feels', callback_data: 'meme_style_wojak' }],
              [{ text: '👀 Distracted BF', callback_data: 'meme_style_distracted' }],
              [{ text: '📈 Stonks Guy', callback_data: 'meme_style_stonks' }],
              [{ text: '🐸 Pepe', callback_data: 'meme_style_pepe' }],
              [{ text: '🎯 Custom Style', callback_data: 'meme_style_custom' }]
            ]
          }
        });
        return;
      } else if (ctx.message && 'text' in ctx.message) {
        (ctx.session as any).memeMood = ctx.message.text;
        await ctx.reply('🎨 Choose meme style:', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🐕 Doge Style', callback_data: 'meme_style_doge' }],
              [{ text: '😔 Wojak/Feels', callback_data: 'meme_style_wojak' }],
              [{ text: '👀 Distracted BF', callback_data: 'meme_style_distracted' }],
              [{ text: '📈 Stonks Guy', callback_data: 'meme_style_stonks' }],
              [{ text: '🐸 Pepe', callback_data: 'meme_style_pepe' }],
              [{ text: '🎯 Custom Style', callback_data: 'meme_style_custom' }]
            ]
          }
        });
        return;
      } else {
        await ctx.reply('Please choose a mood first');
        return;
      }
    },
    // Step 4: Final confirmation and generation
    async (ctx) => {
      if (ctx.callbackQuery && ctx.callbackQuery.data?.startsWith('meme_style_')) {
        const style = ctx.callbackQuery.data.replace('meme_style_', '');
        (ctx.session as any).memeStyle = style;
        await ctx.answerCbQuery(`Style: ${style}`);
        
        if (style === 'custom') {
          await ctx.reply('✍️ Describe your custom style (e.g., "minimalist", "vintage", "anime")');
          return;
        }
        
        // Show summary and generate
        const topic = (ctx.session as any).memeTopic || 'crypto';
        const mood = (ctx.session as any).memeMood || 'hype';
        const hasImage = !(ctx.session as any).memeImageSkipped;
        
        await ctx.reply(`🎯 **Your Meme Brief:**\n\n• Topic: ${topic}\n• Mood: ${mood}\n• Style: ${style}\n• Image: ${hasImage ? 'Yes' : 'No'}`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Generate Meme!', callback_data: 'confirm_meme' }],
              [{ text: '🔄 Start Over', callback_data: 'restart_meme' }]
            ]
          }
        });
        return;
      } else if (ctx.message && 'text' in ctx.message) {
        (ctx.session as any).memeStyle = ctx.message.text;
        
        // Show summary and generate
        const topic = (ctx.session as any).memeTopic || 'crypto';
        const mood = (ctx.session as any).memeMood || 'hype';
        const hasImage = !(ctx.session as any).memeImageSkipped;
        
        await ctx.reply(`🎯 **Your Meme Brief:**\n\n• Topic: ${topic}\n• Mood: ${mood}\n• Style: ${ctx.message.text}\n• Image: ${hasImage ? 'Yes' : 'No'}`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Generate Meme!', callback_data: 'confirm_meme' }],
              [{ text: '🔄 Start Over', callback_data: 'restart_meme' }]
            ]
          }
        });
        return;
      } else {
        await ctx.reply('Please choose a style first');
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
    
    // If no previous parameters or error, the wizard step 1 will handle showing the upload message
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
    // Skip credit check in testing mode
    if (process.env.TESTING !== 'true' && cost > 0 && user.starBalance < cost) {
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
    
    // Build simplified meme prompt
    const session = ctx.session as any;
    const topic = session.memeTopic || 'crypto';
    const mood = session.memeMood || 'hype';
    const style = session.memeStyle || 'doge';
    const hasImage = session.memeImageBuffer ? 'with uploaded image' : 'original meme';
    
    // Create simple, effective prompt
    const simplePrompt = `Create a ${mood} ${topic} meme in ${style} style, ${hasImage}. Make it funny and shareable with clear text.`;
    
    try {
      // Prepare cost message with manual interpolation fallback
      const costMessage = cost > 0 
        ? `${cost} stars will be deducted from your balance.`
        : ctx.i18n.t('memes.free_generation');
      
      await imageQueue.add('generate-meme', {
        prompt: simplePrompt,
        userId: ctx.from?.id,
        chatId: ctx.chat?.id,
        session: ctx.session,
        freeGenerationUsed: user.freeGenerationUsed,
        updateUser: true,
        quality: quality,
        format: memeFormat,
        cost: cost,
        imageBuffer: (ctx.session as any).memeImageBuffer,
        useDSPy: false
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
      
      // Store interval globally instead of in session
      if (ctx.from?.id) {
        addUserInterval(ctx.from.id, intervalId);
      }
      const queuedMsg = ctx.i18n.t('memes.request_queued').replace('{{costMessage}}', costMessage);
      await ctx.reply(queuedMsg);
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
    await ctx.reply('🖼️ Upload an image for your meme (or type "skip"):', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '⏭️ Skip Image', callback_data: 'meme_skip_image' }]
        ]
      }
    });
    // Go to step 1 (upload image handling)
    ctx.wizard.selectStep(1);
  });

  // Add action handlers for skip image
  scene.action('meme_skip_image', async (ctx) => {
    (ctx.session as any).memeImageFileId = undefined;
    (ctx.session as any).memeImageSkipped = true;
    (ctx.session as any).memeImageBuffer = undefined;
    await ctx.answerCbQuery('Skipped image!');
    await ctx.reply('✅ No image! Choose your meme topic:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 Crypto/Moon', callback_data: 'meme_topic_crypto' }],
          [{ text: '💰 DeFi/Trading', callback_data: 'meme_topic_defi' }],
          [{ text: '🎮 Gaming', callback_data: 'meme_topic_gaming' }],
          [{ text: '📱 Tech/Meta', callback_data: 'meme_topic_tech' }],
          [{ text: '🎯 Custom Topic', callback_data: 'meme_topic_custom' }]
        ]
      }
    });
    return ctx.wizard.next();
  });
  
  // Add action handlers for topic selection
  scene.action(/^meme_topic_(crypto|defi|gaming|tech|custom)$/, async (ctx) => {
    const topic = ctx.match[1];
    (ctx.session as any).memeTopic = topic;
    await ctx.answerCbQuery(`Topic: ${topic}`);
    
    if (topic === 'custom') {
      await ctx.reply('✍️ What\'s your custom topic? (e.g., "Bitcoin", "NFTs", "AI")');
      return;
    }
    
    await ctx.reply('😄 Choose the mood:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔥 Hype/Excited', callback_data: 'meme_mood_hype' }],
          [{ text: '😏 Sarcastic/Funny', callback_data: 'meme_mood_sarcastic' }],
          [{ text: '😢 Sad/Disappointed', callback_data: 'meme_mood_sad' }],
          [{ text: '🤔 Confused/Surprised', callback_data: 'meme_mood_confused' }],
          [{ text: '🎯 Custom Mood', callback_data: 'meme_mood_custom' }]
        ]
      }
    });
    return ctx.wizard.next();
  });

  // Add action handlers for mood selection
  scene.action(/^meme_mood_(hype|sarcastic|sad|confused|custom)$/, async (ctx) => {
    const mood = ctx.match[1];
    (ctx.session as any).memeMood = mood;
    await ctx.answerCbQuery(`Mood: ${mood}`);
    
    if (mood === 'custom') {
      await ctx.reply('✍️ What mood? (e.g., "angry", "happy", "shocked")');
      return;
    }
    
    await ctx.reply('🎨 Choose meme style:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🐕 Doge Style', callback_data: 'meme_style_doge' }],
          [{ text: '😔 Wojak/Feels', callback_data: 'meme_style_wojak' }],
          [{ text: '👀 Distracted BF', callback_data: 'meme_style_distracted' }],
          [{ text: '📈 Stonks Guy', callback_data: 'meme_style_stonks' }],
          [{ text: '🐸 Pepe', callback_data: 'meme_style_pepe' }],
          [{ text: '🎯 Custom Style', callback_data: 'meme_style_custom' }]
        ]
      }
    });
    return ctx.wizard.next();
  });

  // Add action handlers for style selection
  scene.action(/^meme_style_(doge|wojak|distracted|stonks|pepe|custom)$/, async (ctx) => {
    const style = ctx.match[1];
    (ctx.session as any).memeStyle = style;
    await ctx.answerCbQuery(`Style: ${style}`);
    
    if (style === 'custom') {
      await ctx.reply('✍️ Describe your custom style (e.g., "minimalist", "vintage", "anime")');
      return;
    }
    
    // Show summary and generate
    const topic = (ctx.session as any).memeTopic || 'crypto';
    const mood = (ctx.session as any).memeMood || 'hype';
    const hasImage = !(ctx.session as any).memeImageSkipped;
    
    await ctx.reply(`🎯 **Your Meme Brief:**\n\n• Topic: ${topic}\n• Mood: ${mood}\n• Style: ${style}\n• Image: ${hasImage ? 'Yes' : 'No'}`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 Generate Meme!', callback_data: 'confirm_meme' }],
          [{ text: '🔄 Start Over', callback_data: 'restart_meme' }]
        ]
      }
    });
    return ctx.wizard.next();
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