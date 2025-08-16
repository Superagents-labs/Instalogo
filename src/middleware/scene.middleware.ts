// @ts-nocheck - Disable TypeScript checking for this file due to i18n integration
import { Middleware } from 'telegraf';
import { BotContext } from '../types';

/**
 * Scene enter middleware that properly resets session state when entering a new scene
 * 
 * This middleware ensures that when a user enters a new scene (like switching from
 * logo generation to sticker generation), the previous session state is cleared
 * to avoid state bleeding between different wizards.
 */
export const sceneSessionResetMiddleware = (): Middleware<BotContext> => {
  return async (ctx, next) => {
    // Ensure we have a session and the function is called after scene middleware is initialized
    if (!ctx.session) ctx.session = {} as any;
    
    // If we don't have __scenes in session, set it up
    if (!ctx.session.__scenes) {
      ctx.session.__scenes = { current: null, state: {} };
    }
    
    // Save the original next function to call after our middleware
    const originalNext = next;
    
    // Replace next with our own function
    next = async () => {
      // After this middleware is done and scenes are set up properly
      if (ctx.scene && !ctx.scene.__reset_handler_registered) {
        // Mark that we've registered handlers to avoid double registration
        ctx.scene.__reset_handler_registered = true;
        
        // Store original enter method
        const originalEnter = ctx.scene.enter;
        
        // Override the enter method to reset session when entering a new scene
        ctx.scene.enter = async (sceneId, ...args) => {
          // Clear session if we're changing scenes
          if (ctx.session.__scenes && 
              ctx.session.__scenes.current &&
              ctx.session.__scenes.current !== sceneId) {
            
            console.log(`Switching scenes from ${ctx.session.__scenes.current} to ${sceneId}, resetting session`);
            
            // Preserve language setting if available
            const language = ctx.i18n?.locale();
            
            // Preserve __scenes to maintain Telegraf's scene tracking
            const scenes = ctx.session.__scenes;
            
            // Reset session but keep __scenes structure for proper scene management
            ctx.session = { __scenes: scenes } as any;
            
            // Restore language setting
            if (language && ctx.i18n) {
              ctx.i18n.locale(language);
            }
          }
          
          // Call original enter method
          return originalEnter.call(ctx.scene, sceneId, ...args);
        };
      }
      
      // Continue with middleware chain
      return originalNext();
    };
    
    return next();
  };
};

/**
 * Ensure all wizard scenes properly reset their step on enter
 * This is a utility function to add to your scene creation
 * @param scene The wizard scene to enhance
 * @returns The enhanced scene with proper step reset on enter
 */
export function ensureWizardReset(scene) {
  // If the scene doesn't already have an enter handler, add one
  if (!scene.enterHandler) {
    scene.enter(async (ctx) => {
      // For wizard scenes, we don't call selectStep directly
      // Instead just let the scene start naturally
      // This avoids the "Cannot read properties of undefined (reading 'selectStep')" error
    });
  }
  
  return scene;
}

// Add a new middleware function to clear stale sessions
export function ensureSessionCleanup() {
  return async (ctx, next) => {
    // Check if this is a command or callback that should reset session
    const isStartCommand = ctx.message && 'text' in ctx.message && ctx.message.text.startsWith('/start');
    const isMenuCommand = ctx.message && 'text' in ctx.message && ctx.message.text.startsWith('/menu');
    const isCancelCommand = ctx.message && 'text' in ctx.message && ctx.message.text.startsWith('/cancel');
    // FIXED: Don't clear session for generate_* callbacks - they handle their own session management
    const isCallbackForNewFlow = ctx.callbackQuery && ['main_menu'].includes(ctx.callbackQuery.data);
    
    // DEBUG: Log what's triggering session cleanup
    if (isStartCommand || isMenuCommand || isCancelCommand || isCallbackForNewFlow) {
      console.log(`🔍 DEBUG: Session cleanup triggered by:`, {
        isStartCommand,
        isMenuCommand, 
        isCancelCommand,
        isCallbackForNewFlow,
        callbackData: ctx.callbackQuery?.data,
        messageText: ctx.message && 'text' in ctx.message ? ctx.message.text : null
      });
      // Save important session values
      const scenes = ctx.session?.__scenes;
      const language = ctx.i18n?.locale();
      
      // Clear edit image session flags that persist outside of scenes
      const editImageKeys = [
        'awaitingEditPrompt',
        'stickerEditPrompt', 
        'awaitingStickerEdit',
        'awaitingStarterPackImage'
      ];
      
      if (ctx.session) {
        editImageKeys.forEach(key => {
          if ((ctx.session as any)[key]) {
            console.log(`Clearing edit image session flag: ${key}`);
            delete (ctx.session as any)[key];
          }
        });
      }
      
      // Reset the session entirely including wizard state
      ctx.session = { __scenes: { current: null, state: {} } } as any;
      
      // Restore language
      if (language && ctx.i18n) {
        ctx.i18n.locale(language);
      }
      
      // Reset wizard cursor if present
      if (ctx.wizard) {
        try {
          (ctx as any).wizard.cursor = 0;
          console.log('Middleware reset wizard cursor to 0');
        } catch (err) {
          console.log('Middleware could not reset wizard cursor:', err);
        }
      }
      
      console.log('Session cleared by middleware');
    }
    
    return next();
  };
} 