import mongoose from 'mongoose';
import logger from './logger';
import { config } from '../config/config';

// Track connection status
let isConnected = false;

/**
 * Connect to MongoDB database with connection pooling
 */
export const connectDB = async (): Promise<void> => {
  if (isConnected) {
    logger.info('MongoDB is already connected');
    return;
  }

  try {
    const { database } = config;
    
    // Log which environment variable is being used
    const envVar = process.env.MONGO_URI ? 'MONGO_URI' :
                   process.env.MONGODB_URI ? 'MONGODB_URI' : 'default';

    logger.info(`🔍 Using environment variable: ${envVar}`);
    logger.info(`🔌 Attempting to connect to MongoDB...`);
    logger.info(`📍 Connection string: ${database.mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`); // Hide credentials

    const connection = await mongoose.connect(database.mongoUri, {
      maxPoolSize: database.maxPoolSize,
      minPoolSize: database.minPoolSize,
      serverSelectionTimeoutMS: database.serverSelectionTimeoutMs,
      socketTimeoutMS: database.socketTimeoutMs,
      retryWrites: true
    });

    isConnected = !!connection.connection.readyState;

    logger.info(`✅ MongoDB connected successfully to: ${connection.connection.host}`);
    logger.info(`📊 Database: ${connection.connection.name}`);
    logger.info(`🔌 Connection state: ${connection.connection.readyState}`);
    logger.info(`🔢 Connection Pool - Max: ${database.maxPoolSize}, Min: ${database.minPoolSize}`);

    // Handle connection events
    mongoose.connection.on('disconnected', () => {
      logger.warn('❌ MongoDB disconnected');
      isConnected = false;
    });

    mongoose.connection.on('error', (err) => {
      logger.error('❌ MongoDB connection error:', err);
      isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('🔄 MongoDB reconnected');
      isConnected = true;
    });

    mongoose.connection.on('connected', () => {
      logger.info('✅ MongoDB connection established');
      isConnected = true;
    });

  } catch (error) {
    logger.error('❌ Failed to connect to MongoDB:', error);
    process.exit(1);
  }
};

/**
 * Disconnect from MongoDB database
 */
export const disconnectDB = async (): Promise<void> => {
  if (!isConnected) {
    return;
  }

  try {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('✅ MongoDB disconnected successfully');
  } catch (error) {
    logger.error('❌ Error disconnecting from MongoDB:', error);
  }
};

/**
 * Get database connection status
 */
export const getDBStatus = (): {
  connected: boolean;
  readyState: number;
  host?: string;
  name?: string;
  port?: number;
} => {
  const connection = mongoose.connection;
  return {
    connected: isConnected && connection.readyState === 1,
    readyState: connection.readyState,
    host: connection.host,
    name: connection.name,
    port: connection.port,
  };
};

/**
 * Check database health
 */
export const checkDBHealth = async (): Promise<{
  healthy: boolean;
  status: string;
  details: any;
}> => {
  try {
    const status = getDBStatus();
    const isHealthy = status.connected && status.readyState === 1;

    if (isHealthy) {
      // Try a simple operation to verify connection
      await mongoose.connection.db.admin().ping();

      return {
        healthy: true,
        status: 'Database is healthy and responsive',
        details: status
      };
    } else {
      return {
        healthy: false,
        status: 'Database connection is not healthy',
        details: status
      };
    }
  } catch (error) {
    return {
      healthy: false,
      status: `Database health check failed: ${error}`,
      details: { error: error instanceof Error ? error.message : String(error) }
    };
  }
};

