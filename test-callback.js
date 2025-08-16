// Quick test to debug generate_stickers callback
console.log('🧪 Testing live bot callback handling...');

// Add some debug logging to the bot
const { readFileSync, writeFileSync } = require('fs');
const callbackHandlerPath = './dist/src/handlers/callback.handler.js';

console.log('📝 Adding debug logging to callback handler...');

// Read the current callback handler
let content = readFileSync(callbackHandlerPath, 'utf8');

// Check if debug logging is already added
if (!content.includes('DEBUG: generate_stickers callback received')) {
  // Add debug logging to the generate_stickers handler
  content = content.replace(
    "bot.action('generate_stickers', async (ctx) => {",
    `bot.action('generate_stickers', async (ctx) => {
        console.log('🚨 DEBUG: generate_stickers callback received!');
        console.log('🚨 DEBUG: ctx.from:', ctx.from);
        console.log('🚨 DEBUG: ctx.callbackQuery:', ctx.callbackQuery);`
  );
  
  // Write back the modified content
  writeFileSync(callbackHandlerPath, content);
  console.log('✅ Debug logging added to callback handler');
  console.log('🔄 Please restart the bot to see debug logs when clicking Generate Stickers');
} else {
  console.log('✅ Debug logging already present');
}

console.log('\n📋 Instructions:');
console.log('1. Restart the bot: pkill -f "node dist/src/index.js" && sleep 2 && nohup node dist/src/index.js > telegram-bot.log 2>&1 &');
console.log('2. Click "Generate Stickers" in the bot');
console.log('3. Check logs: tail -10 telegram-bot.log');
console.log('4. Look for "🚨 DEBUG: generate_stickers callback received!" message'); 