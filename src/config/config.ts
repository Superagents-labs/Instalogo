import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Server configuration
export const config = {
  server: {
    port: process.env.PORT || 3000,
    environment: process.env.NODE_ENV || 'development',
    nodeEnv: process.env.NODE_ENV || 'development'
  },
  
  // Telegram Bot Configuration
  telegram: {
    botToken: process.env.BOT_TOKEN || '',
    botUsername: process.env.BOT_USERNAME || '',
    providerToken: process.env.PROVIDER_TOKEN || '',
    webhookUrl: process.env.WEBHOOK_URL || ''
  },

  // Database Configuration
  database: {
    mongoUri: process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/logoai',
    maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 20),
    minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 5),
    serverSelectionTimeoutMs: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000),
    socketTimeoutMs: Number(process.env.MONGO_SOCKET_TIMEOUT_MS || 45000)
  },

  // AI/ML API Configuration
  ai: {
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    replicateApiToken: process.env.REPLICATE_API_TOKEN || '',
    fluxPricePerImageUsd: parseFloat(process.env.FLUX_PRICE_PER_IMAGE_USD || '0.003'),
    openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
    falKey: process.env.FAL_KEY || ''
  },

  // Storage Configuration (AWS S3)
  storage: {
    s3BucketName: process.env.S3_BUCKET_NAME || 'logoai-bucket',
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    awsEndpoint: process.env.AWS_ENDPOINT || 'https://s3.amazonaws.com'
  },

  // Rate Limiting & Usage Controls
  rateLimiting: {
    maxRequestsPerDay: Number(process.env.MAX_REQUESTS_PER_DAY || 50),
    maxGenerationsPerUser: Number(process.env.MAX_GENERATIONS_PER_USER || 10)
  },

  // Logging Configuration
  logging: {
    logLevel: process.env.LOG_LEVEL || 'info',
    enableDebug: process.env.DEBUG === 'true'
  },

  // Security Settings
  security: {
    jwtSecret: process.env.JWT_SECRET || '',
    encryptionKey: process.env.ENCRYPTION_KEY || ''
  },

  // Testing Mode
  testing: {
    enabled: process.env.TESTING === 'true',
    freeMode: process.env.TESTING === 'true' // All features free during testing
  }
};

