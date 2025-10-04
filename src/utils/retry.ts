/**
 * Retry utility with exponential backoff for API calls
 */

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryCondition?: (error: any) => boolean;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: any;
  attempts: number;
  totalTime: number;
}

/**
 * Default retry options
 */
const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  retryCondition: (error: any) => {
    // Retry on network errors, timeouts, and rate limits
    if (error?.code === 'ENOTFOUND' || 
        error?.code === 'ECONNRESET' || 
        error?.code === 'ETIMEDOUT' ||
        error?.type === 'system' ||
        error?.status === 429 || // Rate limit
        error?.status === 500 || // Server error
        error?.status === 502 || // Bad gateway
        error?.status === 503 || // Service unavailable
        error?.status === 504) { // Gateway timeout
      return true;
    }
    return false;
  }
};

/**
 * Sleep utility for delays
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  let lastError: any;
  
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      console.log(`[Retry] Attempt ${attempt + 1}/${opts.maxRetries + 1}`);
      
      const result = await fn();
      
      const totalTime = Date.now() - startTime;
      console.log(`[Retry] Success on attempt ${attempt + 1} after ${totalTime}ms`);
      
      return {
        success: true,
        data: result,
        attempts: attempt + 1,
        totalTime
      };
    } catch (error) {
      lastError = error;
      console.error(`[Retry] Attempt ${attempt + 1} failed:`, error?.message || error);
      
      // Don't retry if we've reached max attempts
      if (attempt >= opts.maxRetries) {
        break;
      }
      
      // Check if we should retry this error
      if (!opts.retryCondition(error)) {
        console.log(`[Retry] Error is not retryable:`, error?.message || error);
        break;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.baseDelay * Math.pow(opts.backoffMultiplier, attempt),
        opts.maxDelay
      );
      
      console.log(`[Retry] Waiting ${delay}ms before retry...`);
      await sleep(delay);
    }
  }
  
  const totalTime = Date.now() - startTime;
  console.error(`[Retry] All attempts failed after ${totalTime}ms`);
  
  return {
    success: false,
    error: lastError,
    attempts: opts.maxRetries + 1,
    totalTime
  };
}

/**
 * Retry OpenAI API calls specifically
 */
export async function retryOpenAICall<T>(
  fn: () => Promise<T>,
  context: string = 'OpenAI API call'
): Promise<RetryResult<T>> {
  return retryWithBackoff(fn, {
    maxRetries: 3,
    baseDelay: 2000, // Start with 2 seconds for OpenAI
    maxDelay: 15000, // Max 15 seconds
    backoffMultiplier: 2,
    retryCondition: (error: any) => {
      // OpenAI-specific retry conditions
      if (error?.code === 'ENOTFOUND' || 
          error?.code === 'ECONNRESET' || 
          error?.code === 'ETIMEDOUT' ||
          error?.type === 'system' ||
          error?.status === 429 || // Rate limit
          error?.status === 500 || // Server error
          error?.status === 502 || // Bad gateway
          error?.status === 503 || // Service unavailable
          error?.status === 504 || // Gateway timeout
          error?.message?.includes('Connection error') ||
          error?.message?.includes('timeout') ||
          error?.message?.includes('network')) {
        console.log(`[Retry] ${context} - Retryable error:`, error?.message || error);
        return true;
      }
      
      console.log(`[Retry] ${context} - Non-retryable error:`, error?.message || error);
      return false;
    }
  });
}

/**
 * Graceful error handler for image generation
 */
export function handleImageGenerationError(error: any, context: string): string {
  console.error(`[ErrorHandler] ${context}:`, error);
  
  // Network/connection errors
  if (error?.code === 'ENOTFOUND' || 
      error?.code === 'ECONNRESET' || 
      error?.code === 'ETIMEDOUT' ||
      error?.type === 'system') {
    return 'Network connection issue. Please check your internet connection and try again.';
  }
  
  // Rate limiting
  if (error?.status === 429) {
    return 'Rate limit exceeded. Please wait a moment and try again.';
  }
  
  // Server errors
  if (error?.status >= 500) {
    return 'Service temporarily unavailable. Please try again in a few minutes.';
  }
  
  // API key issues
  if (error?.status === 401 || error?.status === 403) {
    return 'Authentication error. Please contact support.';
  }
  
  // Generic error
  return 'An unexpected error occurred. Please try again later.';
}




