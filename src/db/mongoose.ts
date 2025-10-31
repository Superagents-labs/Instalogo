import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/telegram-bot';

export const connectDB = async () => {
  await mongoose.connect(MONGO_URI);
  console.log('MongoDB connected');
}; 