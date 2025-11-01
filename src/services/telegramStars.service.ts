/**
 * Telegram Stars Service
 * Handles synchronization of Telegram Stars balance with bot database
 * Auto-syncs balance from Telegram API to ensure accuracy
 */

import { Telegraf } from 'telegraf';
import { User } from '../models/User';

export class TelegramStarsService {
  private bot: Telegraf;

  constructor(bot: Telegraf) {
    this.bot = bot;
  }

  /**
   * Get user's Telegram Stars balance from Telegram API
   * Automatically syncs with database cache
   * Falls back to cached database balance if API fails
   */
  async getUserStarsBalance(userId: number): Promise<number> {
    try {
      // Try to get balance from Telegram Stars API
      // Using Telegram Bot API v6.7+ getUserStars method
      if (typeof (this.bot.telegram as any).getUserStars === 'function') {
        try {
          const result = await (this.bot.telegram as any).getUserStars(userId);
          const balance = result?.star_count || 0;
          
          // Update cache in database
          await this.syncBalanceToDatabase(userId, balance);
          
          console.log(`[TelegramStars] Synced balance for user ${userId}: ${balance} stars`);
          return balance;
        } catch (apiError: any) {
          console.warn(`[TelegramStars] API call failed for user ${userId}, using cache:`, apiError.message);
          // Fallback to database cache
          return await this.getCachedBalance(userId);
        }
      } else {
        // API method not available - use database cache
        console.warn('[TelegramStars] getUserStars API not available, using database cache');
        return await this.getCachedBalance(userId);
      }
    } catch (error: any) {
      console.error(`[TelegramStars] Error getting balance for user ${userId}:`, error);
      // Fallback to cached balance
      return await this.getCachedBalance(userId);
    }
  }

  /**
   * Sync Telegram Stars balance to database cache
   */
  async syncBalanceToDatabase(userId: number, balance: number): Promise<void> {
    try {
      await User.findOneAndUpdate(
        { userId },
        { starBalance: balance },
        { upsert: true, new: true }
      );
      console.log(`[TelegramStars] Synced balance to database for user ${userId}: ${balance}`);
    } catch (error) {
      console.error(`[TelegramStars] Error syncing balance to database for user ${userId}:`, error);
    }
  }

  /**
   * Get cached balance from database (fallback)
   */
  async getCachedBalance(userId: number): Promise<number> {
    try {
      const user = await User.findOne({ userId });
      return user?.starBalance || 0;
    } catch (error) {
      console.error(`[TelegramStars] Error getting cached balance for user ${userId}:`, error);
      return 0;
    }
  }

  /**
   * Force refresh balance from Telegram API
   */
  async refreshBalance(userId: number): Promise<number> {
    return await this.getUserStarsBalance(userId);
  }

  /**
   * Consume stars via Telegram API (if available) and update database
   * Falls back to database-only deduction if API unavailable
   */
  async consumeUserStars(userId: number, amount: number): Promise<{ success: boolean; balance: number; error?: string }> {
    try {
      // First, sync balance to ensure we have latest
      const currentBalance = await this.getUserStarsBalance(userId);
      
      if (currentBalance < amount) {
        return { success: false, balance: currentBalance, error: 'Insufficient balance' };
      }

      // Try to consume stars via Telegram API
      if (typeof (this.bot.telegram as any).consumeUserStars === 'function') {
        try {
          const result = await (this.bot.telegram as any).consumeUserStars(userId, amount);
          
          if (result?.success === false) {
            return { success: false, balance: currentBalance, error: result.error || 'Failed to consume stars' };
          }

          // Update cache in database
          const newBalance = currentBalance - amount;
          await this.syncBalanceToDatabase(userId, newBalance);
          
          console.log(`[TelegramStars] Consumed ${amount} stars from user ${userId}. New balance: ${newBalance}`);
          return { success: true, balance: newBalance };
        } catch (apiError: any) {
          console.warn(`[TelegramStars] API consume failed, using database fallback:`, apiError.message);
          
          // Fallback to database-only deduction
          const user = await User.findOne({ userId });
          if (user && user.starBalance >= amount) {
            user.starBalance -= amount;
            await user.save();
            return { success: true, balance: user.starBalance };
          }
          
          return { success: false, balance: currentBalance, error: 'Failed to process payment' };
        }
      } else {
        // API method not available - use database-only approach
        const user = await User.findOne({ userId });
        if (!user) {
          return { success: false, balance: 0, error: 'User not found' };
        }
        
        if (user.starBalance < amount) {
          return { success: false, balance: user.starBalance, error: 'Insufficient balance' };
        }
        
        user.starBalance -= amount;
        await user.save();
        return { success: true, balance: user.starBalance };
      }
    } catch (error: any) {
      console.error(`[TelegramStars] Error in consumeUserStars for user ${userId}:`, error);
      return { success: false, balance: 0, error: error.message || 'Unknown error' };
    }
  }
}

