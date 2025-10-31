// @ts-nocheck
import { Scenes } from 'telegraf';
import { BotContext } from '../types';
import { OpenAIService } from '../services/openai.service';

export function createEditImageWizardScene(openaiService: OpenAIService) {
  const scene = new Scenes.WizardScene(
    'editImageWizard',
    
    // Step 1: Collect image
    async (ctx) => {
      await ctx.reply('📸 Send the image you want to edit:', {
        reply_markup: { remove_keyboard: true }
      });
      return ctx.wizard.next();
    },
    
    // Step 2: Select style  
    async (ctx) => {
      if (ctx.message && 'photo' in ctx.message) {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        (ctx.session as any).editFileId = photo.file_id;
        
        await ctx.reply('✅ Great! Choose editing style:', {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🚀 Modern', callback_data: 'modern' },
                { text: '🌈 Colorful', callback_data: 'colorful' }
              ],
              [
                { text: '✨ Minimal', callback_data: 'minimal' },
                { text: '🎨 Artistic', callback_data: 'artistic' }
              ],
              [
                { text: '💼 Professional', callback_data: 'professional' }
              ]
            ]
          }
        });
        return ctx.wizard.next();
      } else {
        await ctx.reply('❌ Please send a photo');
        return;
      }
    },
    
    // Step 3: Process
    async (ctx) => {
      if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
        await ctx.answerCbQuery();
        
        const style = ctx.callbackQuery.data;
        const prompts = {
          'modern': 'Transform this into a modern, sleek design',
          'colorful': 'Make this more vibrant and colorful', 
          'minimal': 'Simplify into minimal clean design',
          'artistic': 'Apply artistic creative styling',
          'professional': 'Make this look professional and business-ready'
        };
        
        const prompt = prompts[style] || 'Enhance this image';
        
        await ctx.reply('🎨 Editing with GPT-Image-1...');
        
        try {
          // Download image
          const fileLink = await ctx.telegram.getFileLink((ctx.session as any).editFileId);
          const imgResponse = await fetch(fileLink.href);
          const imageBuffer = Buffer.from(await imgResponse.arrayBuffer());
          
          console.log(`🚀 CALLING GPT-IMAGE-1: ${prompt}`);
          
          // Call GPT-Image-1
          const editResult = await openaiService.editImage({
            imageBuffer: imageBuffer,
            prompt: prompt,
            userId: ctx.from?.id
          });
          
          console.log(`✅ GPT-IMAGE-1 RESULT:`, editResult);
          
          if (editResult && editResult[0]) {
            // Download edited image
            const editedResponse = await fetch(editResult[0]);
            const editedBuffer = Buffer.from(await editedResponse.arrayBuffer());
            
            await ctx.replyWithPhoto(
              { source: editedBuffer }, 
              { caption: `✨ ${prompt} - Done! Try /start for more options.` }
            );
          } else {
            await ctx.reply('❌ Editing failed. Try /start for menu.');
          }
          
        } catch (error) {
          console.error('🚨 EDIT ERROR:', error);
          await ctx.reply('❌ Error: ' + error.message + '. Try /start for menu.');
        }
        
        return ctx.scene.leave();
      }
    }
  );
  
  return scene;
}