import mongoose, { Schema, Document } from 'mongoose';

export interface ILogoGeneration extends Document {
  fid: number;
  type: 'logo' | 'meme' | 'sticker';
  cost: number;
  ethCost: number;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  imageUrls: string[];
  prompt: string;
  sessionData: any;
  castHash?: string;
  createdAt: Date;
  completedAt?: Date;
}

const LogoGenerationSchema: Schema = new Schema({
  fid: { 
    type: Number, 
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['logo', 'meme', 'sticker'],
    required: true,
    default: 'logo'
  },
  cost: {
    type: Number,
    required: true,
    min: 0
  },
  ethCost: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'generating', 'completed', 'failed'],
    default: 'pending',
    index: true
  },
  imageUrls: [{
    type: String
  }],
  prompt: {
    type: String,
    required: true,
    maxlength: 2000
  },
  sessionData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  castHash: {
    type: String,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  completedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Compound indexes
LogoGenerationSchema.index({ fid: 1, createdAt: -1 });
LogoGenerationSchema.index({ status: 1, createdAt: -1 });

export const LogoGenerationModel = mongoose.model<ILogoGeneration>('LogoGeneration', LogoGenerationSchema);
