# 🚀 Render Webhook Deployment Guide

## 1. Modify src/index.ts for Webhook Support

### Add Express Server Setup

```typescript
import express from 'express';

// Add after bot initialization
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    bot: 'Instalogo Bot', 
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Webhook endpoint
app.post(`/webhook/${process.env.BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body, res);
});

// Modify startBot function
const startBot = async () => {
  try {
    // ... existing initialization code ...

    // Set webhook instead of launching with polling
    const WEBHOOK_URL = process.env.WEBHOOK_URL || `https://your-app.onrender.com/webhook/${process.env.BOT_TOKEN}`;
    
    if (process.env.NODE_ENV === 'production') {
      // Production: Use webhooks
      await bot.telegram.setWebhook(WEBHOOK_URL);
      console.log(`✅ Webhook set to: ${WEBHOOK_URL}`);
      
      // Start Express server
      app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
      });
    } else {
      // Development: Use polling
      await bot.launch();
      console.log('🔄 Bot launched with polling (development mode)');
    }

    // ... rest of existing code ...
  } catch (error) {
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
};
```

## 2. Update package.json

```json
{
  "dependencies": {
    "express": "^5.1.0",
    // ... existing dependencies
  },
  "scripts": {
    "start": "node dist/src/index.js",
    "build": "tsc",
    "dev": "ts-node-dev --respawn src/index.ts"
  }
}
```

## 3. Environment Variables for Render

Add these to your Render environment variables:

```bash
NODE_ENV=production
WEBHOOK_URL=https://your-app-name.onrender.com/webhook/YOUR_BOT_TOKEN
PORT=3000
BOT_TOKEN=your_bot_token
MONGODB_URI=your_mongodb_atlas_uri
# ... other existing env vars
```

## 4. Render Deployment Configuration

### Build Command:
```bash
npm install && npm run build
```

### Start Command:
```bash
npm start
```

### Auto-Deploy:
- ✅ Enable auto-deploy from GitHub
- ✅ Branch: `clean-main`

## 5. Benefits on Render

### Cost Efficiency:
- **Webhook**: Only runs when messages arrive
- **Polling**: Always running (24/7 compute usage)
- **Savings**: ~70% reduction in compute usage

### Performance:
- **Webhook**: Instant response (0-50ms)
- **Polling**: 1-3 second delay
- **Reliability**: Better error handling

### Scalability:
- **Webhook**: Automatic scaling based on traffic
- **Polling**: Fixed resource consumption
- **Limits**: Can handle much higher message volume

## 6. Development vs Production

```typescript
// Hybrid approach for best of both worlds
if (process.env.NODE_ENV === 'production') {
  // Render production: Use webhooks
  await setupWebhook();
} else {
  // Local development: Use polling
  await bot.launch();
}
```

## 7. Monitoring & Health Checks

```typescript
// Health check endpoint for Render
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await mongoose.connection.db.admin().ping();
    
    // Check bot API connection  
    const botInfo = await bot.telegram.getMe();
    
    res.json({
      status: 'healthy',
      database: 'connected',
      bot: botInfo.username,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});
```

## 8. Deployment Steps

1. **Push webhook code** to your repository
2. **Create Render Web Service** (not Background Worker)
3. **Set environment variables** including WEBHOOK_URL
4. **Deploy** - Render will automatically set the webhook
5. **Test** with /start command in Telegram
6. **Monitor** logs and health endpoint

## 9. Troubleshooting

### Common Issues:
- **Webhook not set**: Check WEBHOOK_URL format
- **SSL errors**: Ensure HTTPS (Render provides this)
- **Timeout errors**: Increase request timeout
- **Double messages**: Ensure old webhook is removed

### Debug Commands:
```typescript
// Get current webhook info
await bot.telegram.getWebhookInfo()

// Remove webhook (for rollback)
await bot.telegram.deleteWebhook()
```
