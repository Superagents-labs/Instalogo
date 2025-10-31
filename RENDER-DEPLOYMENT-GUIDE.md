# 🚀 Render Deployment Guide for Instalogo Bot

## 📋 Environment Variables Required

Copy and paste these environment variables in Render Dashboard:

### 🔑 **Bot Configuration**
```
BOT_TOKEN=your_telegram_bot_token_here
NODE_ENV=production
PORT=3000
WEBHOOK_URL=https://instalogo-bot.onrender.com/webhook/YOUR_BOT_TOKEN_HERE
```

### 🗄️ **Database Configuration**
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/instalogo?retryWrites=true&w=majority
```

### ☁️ **Cloudinary Configuration**
```
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

### 🤖 **AI Services Configuration**
```
OPENAI_API_KEY=your_openai_api_key
REPLICATE_API_TOKEN=your_replicate_api_token
```

### 📊 **Optional Services**
```
REDIS_URL=redis://localhost:6379
FAL_KEY=your_fal_ai_key (if using FAL AI)
```

---

## 🔧 Step-by-Step Render Setup

### **Step 1: Create New Web Service**
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub account if not already connected

### **Step 2: Repository Configuration**
- **Repository**: `Superagents-labs/Instalogo`
- **Branch**: `render-deploy` ⚠️ **IMPORTANT: Use this branch!**
- **Root Directory**: Leave empty (uses root)

### **Step 3: Basic Settings**
- **Name**: `instalogo-bot`
- **Runtime**: `Node`
- **Region**: `Oregon` (or `Singapore` for global users)
- **Branch**: `render-deploy`

### **Step 4: Build & Deploy Settings**
- **Build Command**: `npm ci && npm run build`
- **Start Command**: `npm start`
- **Node Version**: `18.19.0` (auto-detected from .nvmrc)

### **Step 5: Advanced Settings**
- **Health Check Path**: `/health`
- **Auto-Deploy**: ✅ Enabled
- **Plan**: `Starter` (can upgrade to `Standard` for production)

### **Step 6: Environment Variables**
Click **"Advanced"** → **"Environment Variables"** and add all variables from the list above.

⚠️ **CRITICAL**: Replace `YOUR_BOT_TOKEN_HERE` in `WEBHOOK_URL` with your actual bot token!

---

## 🔍 Environment Variables Explained

| Variable | Purpose | Example |
|----------|---------|---------|
| `BOT_TOKEN` | Telegram Bot API token from @BotFather | `1234567890:ABCDEFghijklmnopqrstuvwxyz` |
| `NODE_ENV` | Enables production mode (webhook) | `production` |
| `PORT` | Server port (Render provides this) | `3000` |
| `WEBHOOK_URL` | Telegram webhook endpoint | `https://your-app.onrender.com/webhook/BOT_TOKEN` |
| `MONGODB_URI` | MongoDB Atlas connection string | `mongodb+srv://user:pass@cluster.net/db` |
| `CLOUDINARY_*` | Image storage credentials | From Cloudinary dashboard |
| `OPENAI_API_KEY` | OpenAI API access | From OpenAI platform |
| `REPLICATE_API_TOKEN` | Flux AI model access | From Replicate platform |

---

## ✅ Deployment Checklist

### **Before Deployment:**
- [ ] All environment variables added to Render
- [ ] `WEBHOOK_URL` contains your actual bot token
- [ ] MongoDB Atlas allows connections from anywhere (0.0.0.0/0)
- [ ] Cloudinary account is active
- [ ] OpenAI account has credits
- [ ] Replicate account has credits

### **After Deployment:**
- [ ] Service builds successfully
- [ ] Health check at `/health` returns `200 OK`
- [ ] Bot responds to `/start` in Telegram
- [ ] Logo generation works
- [ ] Payment system works
- [ ] No error logs in Render dashboard

---

## 🔧 How to Get Environment Variables

### **1. Telegram Bot Token**
1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot` or use existing bot with `/token`
3. Copy the token (format: `1234567890:ABC...`)

### **2. MongoDB URI**
1. Go to [MongoDB Atlas](https://cloud.mongodb.com/)
2. Navigate to **Database** → **Connect** → **Connect your application**
3. Copy the connection string
4. Replace `<password>` with your actual password
5. Replace `<database>` with `instalogo`

### **3. Cloudinary Credentials**
1. Go to [Cloudinary Console](https://console.cloudinary.com/)
2. Find **Account Details** section
3. Copy **Cloud Name**, **API Key**, and **API Secret**

### **4. OpenAI API Key**
1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Click **"Create new secret key"**
3. Copy the key (starts with `sk-`)

### **5. Replicate API Token**
1. Go to [Replicate Account](https://replicate.com/account/api-tokens)
2. Copy your default token or create a new one

---

## 🚨 Common Issues & Solutions

### **Issue: Build Fails**
- **Solution**: Check that `render-deploy` branch is selected
- **Solution**: Verify Node.js version is 18.19.0

### **Issue: Health Check Fails**
- **Solution**: Ensure `NODE_ENV=production` is set
- **Solution**: Check that `WEBHOOK_URL` is correct

### **Issue: Bot Doesn't Respond**
- **Solution**: Verify `BOT_TOKEN` is correct
- **Solution**: Check webhook URL format: `https://your-app.onrender.com/webhook/BOT_TOKEN`

### **Issue: Database Connection Error**
- **Solution**: Check `MONGODB_URI` format and credentials
- **Solution**: Whitelist `0.0.0.0/0` in MongoDB Atlas Network Access

### **Issue: Image Generation Fails**
- **Solution**: Verify Cloudinary credentials
- **Solution**: Check OpenAI/Replicate API credits

---

## 📊 Monitoring & Maintenance

### **Health Monitoring**
- Health endpoint: `https://your-app.onrender.com/health`
- Should return JSON with bot info and status

### **Log Monitoring**
- Check Render logs for errors
- Monitor MongoDB Atlas for connection issues
- Watch Cloudinary usage limits

### **Cost Optimization**
- **Starter Plan**: $7/month - Good for testing
- **Standard Plan**: $25/month - Recommended for production
- **Auto-scaling**: Enabled to handle traffic spikes

---

## 🎯 Success Verification

After deployment, test these features:

1. **Bot Start**: Send `/start` to your bot
2. **Logo Generation**: Generate a test logo
3. **Payment**: Try buying stars (test with small amount)
4. **Health Check**: Visit `https://your-app.onrender.com/health`

---

## 🔄 Updating the Bot

1. Push changes to `render-deploy` branch
2. Render auto-deploys (if enabled)
3. Monitor deployment in Render dashboard
4. Test functionality after deployment

---

**🎉 You're ready to deploy! The bot will automatically switch to webhook mode in production and handle all Telegram updates efficiently.**
