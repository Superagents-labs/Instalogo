# Instalogo Bot - AI-Powered Logo Generation

A Telegram bot that generates professional logos using OpenAI's gpt-image-1 model with comprehensive user input capture and intelligent prompt engineering.

## Architecture Overview

```
src/
├── commands/                  # Bot command handlers
│   └── language.ts           # Language selection command
├── db/                       # Database configuration
│   └── mongoose.ts           # MongoDB connection setup
├── handlers/                 # Event handlers
│   └── callback.handler.ts   # Callback query handlers
├── index.ts                  # Main bot entry point
├── middleware/               # Bot middleware
│   ├── i18n.middleware.ts   # Internationalization
│   ├── scene.middleware.ts  # Scene management
│   └── userLoader.ts        # User data loading
├── models/                   # Database models
│   ├── ImageGeneration.ts   # Image generation records
│   ├── User.ts              # User data model
│   ├── UserFeedback.ts      # User feedback model
│   └── UserImages.ts        # User image storage
├── scenes/                   # Conversation flow scenes (wizards)
│   ├── index.ts             # Scene registration and exports
│   ├── industry.scene.ts    # Industry selection scene
│   ├── logoWizard.scene.ts  # Logo generation wizard
│   ├── memeWizard.scene.ts  # Meme generation wizard
│   ├── name.scene.ts        # Brand name collection
│   ├── stickerWizard.scene.ts # Sticker generation wizard
│   └── style.scene.ts       # Style preference collection
├── services/                 # Core business logic services
│   ├── completeAssetGeneration.service.ts # Complete logo package generation
│   ├── logoVariant.service.ts # Logo variant generation
│   ├── mongodb.service.ts   # Database operations
│   ├── openai.service.ts    # OpenAI integration for image generation
│   └── storage.service.ts   # S3-compatible image storage
├── types/                   # TypeScript type definitions
│   └── index.ts            # Shared interfaces and types
└── utils/                  # Utility functions
    ├── escapeMarkdownV2.ts # Telegram markdown escaping
    ├── imageQueue.ts       # Background job processing
    ├── intervalManager.ts  # User interval management
    ├── retry.ts           # API retry mechanism
    ├── stickerUtils.ts     # Sticker creation utilities
    └── telegramStickerPack.ts # Telegram sticker pack management
```

## Key Components

### 1. Bot Entry Point (`index.ts`)

- Initializes the Telegraf bot instance
- Sets up middleware for i18n, user loading, and scene management
- Handles command routing and callback queries
- Manages image generation queue processing
- Integrates OpenAI gpt-image-1 for logo generation

### 2. Scene System (`scenes/`)

#### Logo Wizard (`logoWizard.scene.ts`)
- Multi-step conversation flow for logo generation
- Collects brand name, industry, style preferences, and design requirements
- Uses comprehensive prompt engineering to capture all user input
- Generates multiple logo concepts using OpenAI gpt-image-1

#### Meme Wizard (`memeWizard.scene.ts`)
- Specialized flow for crypto/pop culture meme generation
- Captures meme topic, audience, mood, and style preferences
- Handles image uploads for meme templates
- Generates viral-ready memes with proper text positioning

#### Sticker Wizard (`stickerWizard.scene.ts`)
- Creates Telegram sticker packs
- Supports various sticker styles and themes
- Generates multiple stickers in a cohesive pack
- Handles text/phrase integration

### 3. Service Layer

#### OpenAIService (`openai.service.ts`)
- Integrates with OpenAI API for image generation using gpt-image-1
- Provides retry logic and error handling for API calls
- Supports image generation with context for icon extraction
- Handles comprehensive prompt building with user input
- Includes token usage tracking and debug logging

#### CompleteAssetGenerationService (`completeAssetGeneration.service.ts`)
- Generates complete logo packages with specialized icons
- Uses Sharp for image processing and resizing
- Creates ZIP packages with organized file structure
- Integrates with OpenAI for icon extraction
- Downloads existing logos instead of regenerating them

#### LogoVariantService (`logoVariant.service.ts`)
- Generates logo variants (standard, transparent, white, icon)
- Uses OpenAI for variant generation
- Handles different logo formats and styles

#### StorageService (`storage.service.ts`)
- Manages image uploads to S3-compatible storage
- Handles Cloudinary integration for image processing
- Provides URL generation for stored images

### 4. Database Models (`models/`)

#### User Model
- Stores user preferences and generation history
- Tracks free generation usage and star balance
- Manages user feedback and ratings

#### ImageGeneration Model
- Records all image generation requests and results
- Stores generation metadata and user feedback
- Tracks generation costs and success rates

### 5. Utility Functions (`utils/`)

#### Retry Mechanism (`retry.ts`)
- Implements exponential backoff for API calls
- Provides user-friendly error handling
- Supports configurable retry attempts and delays

#### Image Queue (`imageQueue.ts`)
- Manages background image generation processing
- Handles job queuing and status updates
- Provides progress tracking for users

## Key Features

### 1. Comprehensive Prompt Engineering
- Captures ALL user input in structured format
- Builds detailed context for GPT Image generation
- Includes brand identity, design preferences, and technical requirements
- Creates distinct icon-focused prompts when icons are specified

### 2. Intelligent Image Generation
- Uses OpenAI gpt-image-1 for high-quality logo generation
- Generates multiple concepts for user selection
- Supports transparent PNG output with proper backgrounds
- Includes retry logic for robust API handling

### 3. Complete Asset Packages
- Generates specialized icons using AI with logo context
- Creates size variants optimized for different platforms
- Packages everything in organized ZIP files
- Includes favicon, app icons, social media icons, and print versions

### 4. Multi-Language Support
- Supports English, Russian, Spanish, French, and Chinese
- Uses telegraf-i18n for localization
- Provides localized error messages and UI text

### 5. Robust Error Handling
- Implements retry mechanisms with exponential backoff
- Provides user-friendly error messages
- Gracefully handles API failures and network issues
- Continues processing even if individual generations fail

## Environment Variables

```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
OPENAI_API_KEY=your_openai_api_key
MONGODB_URI=your_mongodb_connection_string
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

## Usage

1. Start the bot with `npm start`
2. Use `/start` to begin logo generation
3. Follow the wizard to provide brand information
4. Select your preferred logo from generated options
5. Download complete asset packages with specialized icons

## Technology Stack

- **Bot Framework**: Telegraf.js
- **AI Generation**: OpenAI gpt-image-1
- **Database**: MongoDB with Mongoose
- **Image Processing**: Sharp
- **Storage**: Cloudinary
- **Queue Management**: BullMQ
- **Internationalization**: telegraf-i18n
- **Language**: TypeScript