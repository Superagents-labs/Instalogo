import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/telegram-bot';

export const connectDB = async () => {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is not set');
  }
  
  console.log('📊 Database URI loaded:', MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//*****:*****@')); // Hide credentials in logs
  
  await mongoose.connect(MONGODB_URI);
  
  const dbName = mongoose.connection.db?.databaseName;
  console.log(`🗄️  Connected to MongoDB database: "${dbName}"`);
  console.log('📝 Ready for data operations (users, imagegenerations, userimages, etc.)');
}; 