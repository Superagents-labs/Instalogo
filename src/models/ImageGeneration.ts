import mongoose, { Schema, Document } from 'mongoose';

export interface IImageGeneration extends Document {
  userId: number;
  type: 'logo' | 'sticker' | 'meme';
  quality?: string;
  cost: number;
  timestamp: Date;
  imageUrl: string;
  localPath?: string;
  
  // Seed for consistent generation
  seed?: number;
  
  // New fields for logo variants
  originalPrompt?: string;
  selectedImageIndex?: number;
  variants?: {
    standard?: string;
    transparent?: string;
    white?: string;
    icon?: string;
  };
  generationMetadata?: {
    brandName?: string;
    sessionId?: string;
    isVariant?: boolean;
    parentGenerationId?: string;
    originalSeed?: number;
  };
}

const ImageGenerationSchema: Schema = new Schema({
  userId: { type: Number, required: true },
  type: { type: String, enum: ['logo', 'sticker', 'meme'], required: true },
  quality: { type: String },
  cost: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
  imageUrl: { type: String, required: true },
  localPath: { type: String },
  
  // Seed for consistent generation
  seed: { type: Number },
  
  // New fields for logo variants
  originalPrompt: { type: String },
  selectedImageIndex: { type: Number },
  variants: {
    type: Map,
    of: String,
  },
  generationMetadata: {
    type: Object,
    of: String,
  },
});

export const ImageGeneration = mongoose.model<IImageGeneration>('ImageGeneration', ImageGenerationSchema);
