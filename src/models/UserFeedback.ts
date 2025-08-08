import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IUserFeedback extends Document {
  userId: number;
  generationType: 'logo' | 'meme' | 'sticker';
  interactionType: 'like' | 'dislike' | 'download' | 'share' | 'regenerate' | 'skip';
  prompt: string;
  imageUrl?: string;
  qualityScore?: number;
  sessionId?: string;
  timestamp: Date;
  
  // DSPy-specific metadata
  dspyResult?: {
    confidence?: number;
    visualAppeal?: number;
    textReadability?: number;
    overallScore?: number;
    clipSimilarity?: number;
    brandConsistency?: number;
  };
  
  // Additional metadata
  metadata?: {
    promptOptimized?: boolean;
    fallbackUsed?: boolean;
    generationTime?: number;
    modelVersion?: string;
  };
}

// Interface for static methods
export interface IUserFeedbackModel extends Model<IUserFeedback> {
  getAnalytics(filter?: any): Promise<any[]>;
  getUserSatisfactionScore(filter?: any): Promise<any[]>;
}

const UserFeedbackSchema: Schema = new Schema({
  userId: {
    type: Number,
    required: true,
    index: true
  },
  generationType: {
    type: String,
    enum: ['logo', 'meme', 'sticker'],
    required: true,
    index: true
  },
  interactionType: {
    type: String,
    enum: ['like', 'dislike', 'download', 'share', 'regenerate', 'skip'],
    required: true,
    index: true
  },
  prompt: {
    type: String,
    required: true,
    maxlength: 2000
  },
  imageUrl: {
    type: String,
    validate: {
      validator: function(v: string) {
        return !v || /^https?:\/\/.+/.test(v);
      },
      message: 'Invalid URL format'
    }
  },
  qualityScore: {
    type: Number,
    min: 0,
    max: 10
  },
  sessionId: {
    type: String,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // DSPy-specific metadata
  dspyResult: {
    confidence: { type: Number, min: 0, max: 1 },
    visualAppeal: { type: Number, min: 0, max: 10 },
    textReadability: { type: Number, min: 0, max: 10 },
    overallScore: { type: Number, min: 0, max: 10 },
    clipSimilarity: { type: Number, min: 0, max: 10 },
    brandConsistency: { type: Number, min: 0, max: 10 }
  },
  
  // Additional metadata
  metadata: {
    promptOptimized: { type: Boolean, default: false },
    fallbackUsed: { type: Boolean, default: false },
    generationTime: { type: Number, min: 0 },
    modelVersion: { type: String }
  }
}, {
  timestamps: true,
  collection: 'user_feedback'
});

// Compound indexes for efficient analytics queries
UserFeedbackSchema.index({ userId: 1, timestamp: -1 });
UserFeedbackSchema.index({ generationType: 1, timestamp: -1 });
UserFeedbackSchema.index({ interactionType: 1, timestamp: -1 });
UserFeedbackSchema.index({ 'dspyResult.overallScore': -1, timestamp: -1 });

// Static methods for analytics
UserFeedbackSchema.statics.getAnalytics = function(filter: any = {}) {
  return this.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$interactionType',
        count: { $sum: 1 },
        avgQualityScore: { $avg: '$dspyResult.overallScore' },
        avgConfidence: { $avg: '$dspyResult.confidence' }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

UserFeedbackSchema.statics.getUserSatisfactionScore = function(filter: any = {}) {
  return this.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        positiveInteractions: {
          $sum: {
            $cond: [
              { $in: ['$interactionType', ['like', 'download', 'share']] },
              1,
              0
            ]
          }
        },
        totalInteractions: { $sum: 1 },
        avgQualityScore: { $avg: '$dspyResult.overallScore' }
      }
    },
    {
      $project: {
        satisfactionRate: {
          $divide: ['$positiveInteractions', '$totalInteractions']
        },
        avgQualityScore: 1,
        totalInteractions: 1
      }
    }
  ]);
};

export const UserFeedback = mongoose.model<IUserFeedback, IUserFeedbackModel>('UserFeedback', UserFeedbackSchema); 