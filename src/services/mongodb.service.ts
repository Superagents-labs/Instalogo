import dotenv from 'dotenv';
import { User } from '../models/User';
import { UserImages } from '../models/UserImages';
import { RateLimitInfo } from '../types';

// Load environment variables
dotenv.config();

/**
 * Service for MongoDB operations replacing Redis functionality
 * This service handles caching, rate limiting, and session data that was previously in Redis
 */
export class MongoDBService {
  private readonly maxRequestsPerDay: number;
  private readonly maxGenerationsPerUser: number;
  
  /**
   * Initialize service with rate limits from environment variables
   */
  constructor() {
    // Get rate limits from environment variables or use defaults
    this.maxRequestsPerDay = parseInt(process.env.MAX_REQUESTS_PER_DAY || '50', 10);
    this.maxGenerationsPerUser = parseInt(process.env.MAX_GENERATIONS_PER_USER || '10', 10);
  }
  
  /**
   * Store generated image URLs for a user
   * Replaces Redis storeGeneratedImages
   */
  public async storeGeneratedImages(userId: number, imageUrls: string[]): Promise<void> {
    try {
      await UserImages.findOneAndUpdate(
        { userId },
        { 
          userId,
          generatedImages: imageUrls,
          updatedAt: new Date() // Update TTL
        },
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error('Error storing generated images:', error);
      throw new Error('Failed to store generated images');
    }
  }
  
  /**
   * Retrieve generated image URLs for a user
   * Replaces Redis getGeneratedImages
   */
  public async getGeneratedImages(userId: number): Promise<string[]> {
    try {
      const userImages = await UserImages.findOne({ userId });
      
      if (!userImages || !userImages.generatedImages) {
        return [];
      }
      
      return userImages.generatedImages;
    } catch (error) {
      console.error('Error retrieving generated images:', error);
      return [];
    }
  }
  
  /**
   * Check if a user has reached their rate limit
   * Replaces Redis checkRateLimit
   */
  public async checkRateLimit(userId: number): Promise<{ limited: boolean; info: RateLimitInfo }> {
    try {
      // Get or create user
      let user = await User.findOne({ userId });
      
      // Default rate limit info for new users
      const now = Date.now();
      const todayReset = new Date().setHours(0, 0, 0, 0);
      
      if (!user) {
        // Create new user if doesn't exist
        user = await User.create({
          userId,
          requestCount: 0,
          generationCount: 0,
          resetDate: todayReset
        });
      }
      
      // Reset counts if a new day has started
      if (now > user.resetDate) {
        user.requestCount = 0;
        user.generationCount = 0;
        user.resetDate = todayReset;
      }
      
      // Increment request count
      user.requestCount += 1;
      
      // Save updated user
      await user.save();
      
      // Check if user has reached the rate limit
      const limited = user.generationCount >= this.maxGenerationsPerUser;
      
      // Convert to RateLimitInfo type for compatibility with existing code
      const info: RateLimitInfo = {
        userId,
        requestCount: user.requestCount,
        generationCount: user.generationCount,
        resetDate: user.resetDate
      };
      
      return { limited, info };
    } catch (error) {
      console.error('Error checking rate limit:', error);
      // Default to not limited in case of error
      return { 
        limited: false, 
        info: {
          userId,
          requestCount: 1,
          generationCount: 0,
          resetDate: new Date().setHours(0, 0, 0, 0)
        }
      };
    }
  }
  
  /**
   * Increment generation count for rate limiting
   * Replaces Redis incrementGenerationCount
   */
  public async incrementGenerationCount(userId: number): Promise<void> {
    try {
      await User.findOneAndUpdate(
        { userId },
        { $inc: { generationCount: 1 } }
      );
    } catch (error) {
      console.error('Error incrementing generation count:', error);
    }
  }

  /**
   * Store generated logo sets for a user
   * Replaces Redis setUserLogos
   */
  public async setUserLogos(userId: number, logoSets: Record<string, string>[]): Promise<void> {
    try {
      await UserImages.findOneAndUpdate(
        { userId },
        { 
          userId,
          generatedLogos: logoSets,
          updatedAt: new Date() // Update TTL
        },
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error('Error storing generated logos:', error);
      throw new Error('Failed to store generated logos');
    }
  }

  /**
   * Retrieve generated logo sets for a user
   * Replaces Redis getUserLogos
   */
  public async getUserLogos(userId: number): Promise<Record<string, string>[]> {
    try {
      const userImages = await UserImages.findOne({ userId });
      
      if (!userImages || !userImages.generatedLogos) {
        return [];
      }
      
      return userImages.generatedLogos;
    } catch (error) {
      console.error('Error retrieving generated logos:', error);
      return [];
    }
  }

  /**
   * Store last meme parameters for a user
   * Replaces Redis setLastMemeParams
   */
  async setLastMemeParams(userId: number, params: any): Promise<void> {
    try {
      await User.findOneAndUpdate(
        { userId },
        { 
          lastMemeParams: params
        },
        { upsert: true }
      );
    } catch (error) {
      console.error('Error storing meme params:', error);
    }
  }

  /**
   * Retrieve last meme parameters for a user
   * Replaces Redis getLastMemeParams
   */
  async getLastMemeParams(userId: number): Promise<any | null> {
    try {
      const user = await User.findOne({ userId });
      
      if (!user || !user.lastMemeParams) {
        return null;
      }
      
      return user.lastMemeParams;
    } catch (error) {
      console.error('Error retrieving meme params:', error);
      return null;
    }
  }

  /**
   * Generate a unique referral code for a user
   */
  async generateReferralCode(userId: number): Promise<string | null> {
    try {
      // Generate a unique code based on user ID and timestamp
      const code = `REF${userId}${Date.now().toString().slice(-6)}`;
      
      // Update user with referral code
      await User.findOneAndUpdate(
        { userId },
        { referralCode: code },
        { upsert: true }
      );
      
      return code;
    } catch (error) {
      console.error('Error generating referral code:', error);
      return null;
    }
  }

  /**
   * Process a referral when a new user joins via referral link
   */
  async processReferral(newUserId: number, referrerCode: string): Promise<{ success: boolean; referrerReward: number }> {
    try {
      // Find the referrer by their referral code
      const referrer = await User.findOne({ referralCode: referrerCode });
      
      if (!referrer) {
        console.log(`Referral code ${referrerCode} not found`);
        return { success: false, referrerReward: 0 };
      }

      // Check if the new user already exists (prevent duplicate referrals)
      const existingUser = await User.findOne({ userId: newUserId });
      if (existingUser && existingUser.referredBy) {
        console.log(`User ${newUserId} already has a referrer`);
        return { success: false, referrerReward: 0 };
      }

      // Just mark the referral relationship - NO immediate rewards
      await User.findOneAndUpdate(
        { userId: newUserId },
        { 
          referredBy: referrer.userId
          // No starBalance bonus for new users
        },
        { upsert: true }
      );

      console.log(`Referral relationship established: ${newUserId} referred by ${referrer.userId} (no immediate reward)`);
      return { success: true, referrerReward: 0 }; // No immediate reward
    } catch (error) {
      console.error('Error processing referral:', error);
      return { success: false, referrerReward: 0 };
    }
  }

  /**
   * Process referral conversion when a referred user actually uses the bot
   * Call this when a user completes their first generation
   */
  async processReferralConversion(userId: number): Promise<{ success: boolean; referrerReward: number; referrerId?: number }> {
    try {
      const user = await User.findOne({ userId });
      
      if (!user || !user.referredBy) {
        // User wasn't referred or doesn't exist
        return { success: false, referrerReward: 0 };
      }

      // Check if this conversion was already processed
      if (user.hasConverted) {
        console.log(`User ${userId} conversion already processed`);
        return { success: false, referrerReward: 0 };
      }

      const REFERRER_REWARD = 20; // 20 stars for successful conversion

      // Mark user as converted
      await User.findOneAndUpdate(
        { userId },
        { hasConverted: true }
      );

      // Reward the referrer
      await User.findOneAndUpdate(
        { userId: user.referredBy },
        { 
          $inc: { 
            referralCount: 1,
            starBalance: REFERRER_REWARD,
            totalReferralRewards: REFERRER_REWARD
          }
        }
      );

      console.log(`Referral conversion processed: ${userId} converted, referrer ${user.referredBy} rewarded with ${REFERRER_REWARD} stars`);
      return { success: true, referrerReward: REFERRER_REWARD, referrerId: user.referredBy };
    } catch (error) {
      console.error('Error processing referral conversion:', error);
      return { success: false, referrerReward: 0 };
    }
  }

  /**
   * Get referral statistics for a user
   */
  async getReferralStats(userId: number): Promise<{
    referralCode: string | null;
    referralCount: number;
    totalRewards: number;
    referredUsers: number[];
  }> {
    try {
      const user = await User.findOne({ userId });
      
      if (!user) {
        return {
          referralCode: null,
          referralCount: 0,
          totalRewards: 0,
          referredUsers: []
        };
      }

      // Get list of users referred by this user
      const referredUsers = await User.find({ referredBy: userId }).select('userId');
      
      return {
        referralCode: user.referralCode || null,
        referralCount: user.referralCount || 0,
        totalRewards: user.totalReferralRewards || 0,
        referredUsers: referredUsers.map(u => u.userId)
      };
    } catch (error) {
      console.error('Error getting referral stats:', error);
      return {
        referralCode: null,
        referralCount: 0,
        totalRewards: 0,
        referredUsers: []
      };
    }
  }
} 