import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  userId: number;
  starBalance: number;
  freeGenerationUsed: boolean;
  generationHistory: mongoose.Types.ObjectId[];
  language?: string;
  // New fields for rate limiting (previously in Redis)
  requestCount: number;
  generationCount: number;
  resetDate: number;
  // New field for meme parameters
  lastMemeParams?: Record<string, any>;
  // Referral system fields
  referredBy?: number; // User ID of the referrer
  referralCode?: string; // Unique referral code for this user
  referralCount: number; // Number of users this user has referred
  totalReferralRewards: number; // Total stars earned from referrals
  hasConverted?: boolean; // Whether this referred user has completed their first generation
}

const UserSchema: Schema = new Schema({
  userId: { type: Number, required: true, unique: true },
  starBalance: { type: Number, default: 0 },
  freeGenerationUsed: { type: Boolean, default: false },
  generationHistory: [{ type: Schema.Types.ObjectId, ref: 'ImageGeneration' }],
  language: { type: String, default: 'en' },
  // New fields for rate limiting
  requestCount: { type: Number, default: 0 },
  generationCount: { type: Number, default: 0 },
  resetDate: { type: Number, default: () => new Date().setHours(0, 0, 0, 0) },
  // New field for meme parameters - flexible schema
  lastMemeParams: { type: mongoose.Schema.Types.Mixed },
  // Referral system fields
  referredBy: { type: Number, default: null },
  referralCode: { type: String, unique: true, sparse: true },
  referralCount: { type: Number, default: 0 },
  totalReferralRewards: { type: Number, default: 0 },
  hasConverted: { type: Boolean, default: false }
});

export const User = mongoose.model<IUser>('User', UserSchema); 