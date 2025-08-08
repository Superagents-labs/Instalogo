import mongoose, { Schema, Document } from 'mongoose';

/**
 * Interface for UserImages document
 * This replaces Redis storage for user-generated images and logos
 */
export interface IUserImages extends Document {
  userId: number;
  // For regular image generations
  generatedImages: string[];
  // For logo generations with multiple sizes
  generatedLogos: Record<string, string>[];
  updatedAt: Date;
}

const UserImagesSchema: Schema = new Schema({
  userId: { type: Number, required: true, unique: true },
  generatedImages: [{ type: String }],
  generatedLogos: [{ type: mongoose.Schema.Types.Mixed }],
  updatedAt: { type: Date, default: Date.now }
});

// Add automatic expiration after 7 days (similar to Redis TTL)
UserImagesSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

export const UserImages = mongoose.model<IUserImages>('UserImages', UserImagesSchema); 