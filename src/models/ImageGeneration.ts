import mongoose, { Schema, Document } from 'mongoose';

export interface IImageGeneration extends Document {
  userId: number;
  type: 'logo' | 'sticker' | 'meme';
  quality?: string;
  cost: number;
  timestamp: Date;
  imageUrl: string;
  localPath?: string;
}

const ImageGenerationSchema: Schema = new Schema({
  userId: { type: Number, required: true },
  type: { type: String, enum: ['logo', 'sticker', 'meme'], required: true },
  quality: { type: String },
  cost: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
  imageUrl: { type: String, required: true },
  localPath: { type: String },
});

export const ImageGeneration = mongoose.model<IImageGeneration>('ImageGeneration', ImageGenerationSchema); 