# Instalogo - Telegram Bot for Logo Generation

A powerful Telegram bot that generates high-quality logos, memes, and stickers using Flux AI through the Replicate API. Built with TypeScript, MongoDB, and Docker for production deployment.

## Features

- 🎨 **Logo Generation**: Create professional logos with enhanced prompts
- 😄 **Meme Generation**: Generate engaging memes for social media
- 🎯 **Sticker Generation**: Bulk create sticker packs (1-100 stickers)
- 🌍 **Multi-language Support**: English, Spanish, French, Russian, Chinese
- 💰 **Telegram Stars Payment**: Direct in-app purchases with volume discounts
- 💾 **Persistent Storage**: MongoDB for user data, Cloudinary for images
- 🔄 **Queue System**: BullMQ for handling generation jobs
- ⚡ **Flux AI**: High-quality image generation via Replicate API

## 💰 Pricing (Telegram Stars)

| Credits | Telegram Stars | Discount | Best For |
|---------|----------------|----------|----------|
| 100 | 100 ⭐ | None | Trial users |
| 500 | 500 ⭐ | None | Regular users |
| 1000 | 950 ⭐ | **5% OFF** | Power users |
| 2500 | 2250 ⭐ | **10% OFF** | Businesses |

- **Logo Generation**: 50 credits (2 concepts, multiple sizes)
- **First Generation**: FREE for new users
- **Payment**: Direct Telegram Stars (no external processors)
- **Revenue**: Goes directly to bot owner's Telegram account

📋 [Full Pricing Documentation](PRICING.md) | 🔍 [Quick Reference](PRICING-QUICK-REF.md)

## Prerequisites

- Node.js 18+ 
- MongoDB 5.0+
- Docker (for LocalStack S3)
- Telegram Bot Token from [@BotFather](https://t.me/BotFather)
- Replicate API Token for Flux AI

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/Superagents-labs/Instalogo.git
cd Instalogo
npm install
```

### 2. Environment Setup

Copy the example environment file and configure it:

```bash
cp env.example development.env
```

Edit `development.env` with your credentials:

```bash
# Telegram Bot Configuration
BOT_TOKEN=your_telegram_bot_token_here
BOT_USERNAME=your_bot_username

# API Keys
REPLICATE_API_TOKEN=your_replicate_api_token_here
OPENAI_API_KEY=your_openai_api_key_here  # Optional: for text generation

# Database
MONGODB_URI=mongodb://localhost:27017/instalogo

# Storage (LocalStack for development)
S3_BUCKET_NAME=instalogo-bucket
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_REGION=us-east-1
AWS_ENDPOINT=http://localhost:4566

# Rate Limiting
MAX_REQUESTS_PER_DAY=50
MAX_GENERATIONS_PER_USER=10
```

### 3. Build the Project

```bash
npm run build
```

### 4. Start All Services

Use the provided script to start MongoDB, LocalStack, and the bot:

```bash
chmod +x start-all-services.sh
./start-all-services.sh
```

This will:
- Start MongoDB on port 27017
- Start LocalStack (S3) on port 4566
- Build the TypeScript code
- Launch the Telegram bot

### 5. Test the Bot

Send `/start` to your bot on Telegram to begin generating logos!

## Development

### Project Structure

```
src/
├── commands/           # Bot commands
├── db/                # Database configuration
├── handlers/          # Callback handlers
├── middleware/        # Custom middleware
├── models/           # MongoDB models
├── scenes/           # Telegram scenes (wizards)
├── services/         # Core services
├── types/            # TypeScript type definitions
├── utils/            # Utility functions
└── index.ts          # Main bot entry point
```

### Key Services

- **FluxService**: Handles Flux AI image generation via Replicate
- **OpenAIService**: Text generation and enhanced prompts
- **MongoDBService**: Database operations
- **StorageService**: S3 image storage

### Available Scripts

```bash
npm run build          # Build TypeScript
npm run dev           # Development mode with hot reload
npm run start         # Production start
npm run clean         # Clean build directory
```

### Database Models

- **User**: User profiles and star balances
- **ImageGeneration**: Generation history and metadata
- **UserFeedback**: User interaction tracking
- **UserImages**: Generated image records

### Scene Flow

1. **Logo Wizard**: Multi-step logo creation process
2. **Meme Wizard**: Meme generation with templates
3. **Sticker Wizard**: Bulk sticker pack creation

## Production Deployment

### Environment Variables

For production, update these in your environment:

```bash
NODE_ENV=production
WEBHOOK_URL=https://your-domain.com/webhook
AWS_ENDPOINT=https://s3.amazonaws.com  # Use real S3
MONGODB_URI=mongodb://your-production-mongodb/instalogo
```

### Docker Deployment

Build and run with Docker:

```bash
# Build the application
npm run build

# Use Docker Compose for production
docker-compose up -d
```

### Monitoring

Monitor the application logs:

```bash
tail -f telegram-bot.log
```

## API Integration

### Flux AI (Replicate)

The bot uses Flux Schnell model for fast, high-quality generation:
- Model: `black-forest-labs/flux-schnell`
- Generation time: ~10-30 seconds
- Output: PNG images, 1024x1024

### Storage

Images are stored in S3-compatible storage:
- Development: LocalStack on port 4566
- Production: AWS S3 or compatible service

## Configuration

### Rate Limiting

Configure in `development.env`:
- `MAX_REQUESTS_PER_DAY`: Daily request limit per user
- `MAX_GENERATIONS_PER_USER`: Daily generation limit

### Languages

Supported languages in `locales/`:
- English (`en.json`)
- Spanish (`es.json`) 
- French (`fr.json`)
- Russian (`ru.json`)
- Chinese (`zh.json`)

## Troubleshooting

### Common Issues

1. **Bot not responding**
   - Check if BOT_TOKEN is correct
   - Verify MongoDB is running
   - Check logs: `tail -f telegram-bot.log`

2. **Image generation fails**
   - Verify REPLICATE_API_TOKEN is valid
   - Check Replicate API limits
   - Monitor network connectivity

3. **Database connection issues**
   - Ensure MongoDB is running on port 27017
   - Check MONGODB_URI configuration
   - Verify database permissions

### Service Management

Stop all services:
```bash
./stop-all-services.sh
```

Restart individual services:
```bash
# Restart MongoDB
sudo systemctl restart mongod

# Restart bot only
npm run build && node dist/src/index.js
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and test thoroughly
4. Commit with clear messages: `git commit -m "feat: add new feature"`
5. Push and create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and questions:
- Create an issue on GitHub
- Check the troubleshooting section
- Review the logs for error details 