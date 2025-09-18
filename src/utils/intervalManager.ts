// Global interval tracking for "still working" messages
const activeIntervals = new Map<number, NodeJS.Timeout[]>();

/**
 * Clear all intervals for a specific user
 * Call this when image generation completes
 */
export function clearUserIntervals(userId: number): void {
  const userIntervals = activeIntervals.get(userId);
  if (userIntervals && userIntervals.length > 0) {
    console.log(`[IntervalManager] 🧹 Clearing ${userIntervals.length} "still working" intervals for user ${userId}`);
    userIntervals.forEach(interval => {
      clearInterval(interval);
    });
    activeIntervals.delete(userId);
  } else {
    console.log(`[IntervalManager] No intervals to clear for user ${userId}`);
  }
}

/**
 * Add interval to user's tracking list
 * Call this when creating a "still working" interval
 */
export function addUserInterval(userId: number, intervalId: NodeJS.Timeout): void {
  if (!activeIntervals.has(userId)) {
    activeIntervals.set(userId, []);
  }
  
  const userIntervals = activeIntervals.get(userId)!;
  userIntervals.push(intervalId);
  
  console.log(`[IntervalManager] ➕ Added interval for user ${userId}. Total: ${userIntervals.length}`);
}

/**
 * Get count of active intervals for debugging
 */
export function getActiveIntervalCount(): { total: number; byUser: Record<number, number> } {
  let total = 0;
  const byUser: Record<number, number> = {};
  
  for (const [userId, intervals] of activeIntervals.entries()) {
    byUser[userId] = intervals.length;
    total += intervals.length;
  }
  
  return { total, byUser };
}

/**
 * Auto-cleanup old intervals to prevent memory leaks
 */
export function cleanupOldIntervals(): void {
  const MAX_INTERVALS_PER_USER = 10;
  let cleaned = 0;
  
  for (const [userId, intervals] of activeIntervals.entries()) {
    if (intervals.length > MAX_INTERVALS_PER_USER) {
      const excessCount = intervals.length - MAX_INTERVALS_PER_USER;
      const excessIntervals = intervals.splice(0, excessCount);
      excessIntervals.forEach(interval => {
        clearInterval(interval);
        cleaned++;
      });
      console.log(`[IntervalManager] 🧹 Cleaned ${excessCount} old intervals for user ${userId}`);
    }
  }
  
  if (cleaned > 0) {
    console.log(`[IntervalManager] 🧹 Total intervals cleaned: ${cleaned}`);
  }
}

// Auto-cleanup every 10 minutes
setInterval(() => {
  const stats = getActiveIntervalCount();
  if (stats.total > 0) {
    console.log(`[IntervalManager] 📊 Active intervals: ${stats.total} across ${Object.keys(stats.byUser).length} users`);
    cleanupOldIntervals();
  }
}, 10 * 60 * 1000);

