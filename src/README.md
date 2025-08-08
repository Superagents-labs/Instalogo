# Instalogo Bot - Source Code Documentation

This directory contains the TypeScript source code for the Instalogo Telegram bot that generates logos, memes, and stickers using Flux AI through the Replicate API.

## Architecture Overview

The bot follows a modular, service-oriented architecture with clear separation of concerns:

```
src/
├── index.ts                    # Main bot entry point and configuration
├── commands/                   # Bot command handlers
│   └── language.ts            # Language selection command
├── db/                        # Database configuration
│   └── mongoose.ts            # MongoDB connection setup
├── handlers/                  # Event and callback handlers
│   └── callback.handler.ts   # Inline keyboard callback handling
├── middleware/                # Custom middleware
│   ├── i18n.middleware.ts     # Internationalization middleware
│   ├── scene.middleware.ts    # Scene management middleware
│   └── userLoader.ts          # User data loading middleware
├── models/                    # MongoDB data models
│   ├── ImageGeneration.ts     # Generated image metadata
│   ├── User.ts               # User profiles and balances
│   ├── UserFeedback.ts       # User interaction tracking
│   └── UserImages.ts         # Image storage references
├── scenes/                    # Conversation flow scenes (wizards)
│   ├── index.ts              # Scene registration and exports
│   ├── enhanced-logoWizard.scene.ts  # Enhanced logo generation flow
│   ├── industry.scene.ts     # Industry selection scene
│   ├── logoWizard.scene.ts   # Basic logo generation wizard
│   ├── memeWizard.scene.ts   # Meme generation flow
│   ├── name.scene.ts         # Brand name collection
│   ├── stickerWizard.scene.ts # Sticker pack creation
│   └── style.scene.ts        # Style preference collection
├── services/                  # Core business logic services
│   ├── flux.service.ts       # Flux AI integration via Replicate
│   ├── mongodb.service.ts    # Database operations
│   ├── openai.service.ts     # OpenAI text generation (optional)
│   └── storage.service.ts    # S3-compatible image storage
├── types/                    # TypeScript type definitions
│   └── index.ts             # Shared interfaces and types
└── utils/                   # Utility functions
    ├── escapeMarkdownV2.ts  # Telegram markdown escaping
    ├── imageQueue.ts        # Background job processing
    ├── stickerUtils.ts      # Sticker creation utilities
    └── telegramStickerPack.ts # Telegram sticker pack management
```

## Key Components

### 1. Bot Entry Point (`index.ts`)

- Initializes the Telegraf bot instance
- Sets up middleware pipeline
- Registers scenes and command handlers
- Configures database connections
- Handles graceful shutdown

### 2. Scene-Based Conversation Flow

The bot uses Telegraf scenes to manage multi-step conversations:

- **Logo Wizard**: Collects brand name, industry, style preferences
- **Meme Wizard**: Handles meme generation with quality options
- **Sticker Wizard**: Manages bulk sticker creation (1-100 stickers)

### 3. Service Layer

#### FluxService (`flux.service.ts`)
- Integrates with Replicate API for Flux AI image generation
- Builds enhanced prompts based on user inputs
- Handles asynchronous generation and polling
- Converts Replicate URLs to base64 for storage

#### MongoDBService (`mongodb.service.ts`)
- Manages database connections and operations
- Handles user profile management
- Tracks generation history and feedback

#### StorageService (`storage.service.ts`)
- Manages S3-compatible image storage
- Handles image uploads and URL generation
- Supports both LocalStack (development) and AWS S3 (production)

### 4. Data Models

#### User Model
```typescript
interface IUser {
  userId: number;          // Telegram user ID
  starBalance: number;     // Available star tokens
  freeGeneration: boolean; // Free generation credit status
  language: string;        // Preferred language
  createdAt: Date;
  lastActive: Date;
}
```

#### ImageGeneration Model
```typescript
interface IImageGeneration {
  userId: number;
  type: 'logo' | 'meme' | 'sticker';
  prompt: string;
  imageUrl: string;
  cost: number;           // Stars deducted
  quality?: string;       // For memes: 'high', 'medium', 'good'
  metadata: object;       // Additional generation data
  createdAt: Date;
}
```

## Conversation Flow

### Logo Generation
1. User initiates with `/start` → `Generate Logo`
2. **Name Scene**: Collect business name
3. **Industry Scene**: Select industry category
4. **Style Scene**: Choose visual preferences
5. **Generation**: Create 4 logo variants using Flux AI
6. **Selection**: User picks preferred option
7. **High-res**: Generate final high-resolution version

### Meme Generation
1. User selects `Generate Meme`
2. **Topic Input**: Enter meme topic/concept
3. **Quality Selection**: Choose quality level (affects cost)
4. **Generation**: Create meme using Flux AI
5. **Delivery**: Send completed meme to user

### Sticker Generation
1. User selects `Generate Stickers`
2. **Theme Input**: Enter sticker pack theme
3. **Quantity**: Choose number of stickers (1-100)
4. **Generation**: Create sticker pack using Flux AI
5. **Pack Creation**: Format as Telegram sticker pack

## Star Token Economy

### Pricing Structure
- **Logos**: 50 stars per image
- **Stickers**: 50 stars per image
- **Memes**:
  - Good quality: 50 stars
  - Medium quality: 70 stars
  - High quality: 90 stars

### Free Generation
- Every user gets 1 free generation upon registration
- After free credit is used, star tokens are required
- Free status tracked in user profile

### Balance Management
```typescript
// Example balance check and deduction
const user = await User.findOne({ userId });
const cost = calculateGenerationCost(type, quality, quantity);

if (!user.freeGeneration && user.starBalance < cost) {
  throw new Error('Insufficient star balance');
}

if (user.freeGeneration) {
  user.freeGeneration = false;
} else {
  user.starBalance -= cost;
}

await user.save();
```

## Internationalization

The bot supports multiple languages through the i18n middleware:

- English (en) - Default
- Spanish (es)
- French (fr)
- Russian (ru)
- Chinese (zh)

Language files located in `/locales/` directory.

## Error Handling

### Service-Level Errors
- API timeouts and failures
- Database connection issues
- Storage service problems

### User-Level Errors
- Insufficient star balance
- Invalid input validation
- Generation failures

### Recovery Strategies
- Graceful fallbacks for API failures
- User-friendly error messages
- Automatic retry mechanisms for transient failures

## Development Workflow

### Adding New Features
1. Define types in `/types/index.ts`
2. Create service layer in `/services/`
3. Build conversation flow in `/scenes/`
4. Add database models in `/models/`
5. Update main bot in `index.ts`

### Testing
- Unit tests for services and utilities
- Integration tests for scene flows
- Mock external API dependencies
- Database transaction testing

### Deployment
1. Build TypeScript: `npm run build`
2. Run migrations: Database schema updates
3. Deploy services: Bot, MongoDB, S3
4. Monitor logs: Check for errors and performance

## Performance Considerations

### Image Generation
- Async processing with job queues
- Progress indicators for long-running operations
- Rate limiting to prevent API abuse

### Database Optimization
- Indexed queries on userId and timestamps
- Connection pooling for concurrent requests
- Cleanup of old generation data

### Memory Management
- Streaming for large image processing
- Garbage collection of temporary files
- Connection cleanup on shutdown

## Security

### API Keys
- Environment variable storage
- No hardcoded credentials
- Rotation procedures documented

### User Data
- Minimal data collection
- Secure storage of generation history
- GDPR compliance considerations

### Input Validation
- Sanitize all user inputs
- Validate file uploads
- Rate limiting protection