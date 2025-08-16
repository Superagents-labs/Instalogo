// More targeted debugging for callback handler failure
const { readFileSync, writeFileSync } = require('fs');

console.log('🔍 Adding detailed debug logging to callback handler...');

const callbackPath = './dist/src/handlers/callback.handler.js';
let content = readFileSync(callbackPath, 'utf8');

// Add comprehensive debug logging around each step
if (!content.includes('STEP 1: answerCbQuery')) {
  content = content.replace(
    /bot\.action\('generate_stickers', async \(ctx\) => \{[\s\S]*?console\.log\('🚨 DEBUG: ctx\.callbackQuery:', ctx\.callbackQuery\);/,
    `bot.action('generate_stickers', async (ctx) => {
        console.log('🚨 DEBUG: generate_stickers callback received!');
        console.log('🚨 DEBUG: ctx.from:', ctx.from);
        console.log('🚨 DEBUG: ctx.callbackQuery:', ctx.callbackQuery);
        
        try {
            console.log('🚨 STEP 1: Starting answerCbQuery...');
            await ctx.answerCbQuery();
            console.log('🚨 STEP 1: answerCbQuery completed');
            
            console.log('🚨 STEP 2: Starting clearSessionForSceneSwitch...');
            await clearSessionForSceneSwitch(ctx);
            console.log('🚨 STEP 2: clearSessionForSceneSwitch completed');
            
            console.log('🚨 STEP 3: Starting scene.enter...');
            await ctx.scene.enter('stickerWizard');
            console.log('🚨 STEP 3: scene.enter completed - SUCCESS!');
        } catch (error) {
            console.error('🚨 ERROR in generate_stickers handler:', error);
            console.error('🚨 ERROR stack:', error.stack);
        }`
  );
  
  writeFileSync(callbackPath, content);
  console.log('✅ Enhanced debug logging added');
  console.log('🔄 Restart the bot and try "Generate Stickers" button');
} else {
  console.log('❌ Could not add debug logging - handler structure may have changed');
}

console.log('\n📋 Next steps:');
console.log('1. Restart bot: pkill -f "node dist/src/index.js" && sleep 2 && nohup node dist/src/index.js > telegram-bot.log 2>&1 &');
console.log('2. Click "Generate Stickers"');
console.log('3. Check: tail -20 telegram-bot.log'); 