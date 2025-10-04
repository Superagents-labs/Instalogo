import OpenAI from 'openai';
import { toFile } from 'openai';
import { SessionData } from '../types';
import { retryOpenAICall, handleImageGenerationError } from '../utils/retry';

/**
 * Token cost tracking interface
 */
interface TokenCosts {
  textInputTokens: number;
  imageInputTokens: number;
  imageOutputTokens: number;
  totalCost: number;
}

/**
 * Enhanced OpenAI Service with gpt-image-1 Integration
 * Now powered by OpenAI gpt-image-1 for superior logo generation
 */
export class OpenAIService {
  private client: OpenAI;
  
  // OpenAI pricing per token (as of current pricing)
  private readonly PRICING = {
    TEXT_INPUT: 0.000005,    // $5.00 per 1M tokens = $0.000005 per token
    IMAGE_INPUT: 0.00001,    // $10.00 per 1M tokens = $0.00001 per token  
    IMAGE_OUTPUT: 0.00004    // $40.00 per 1M tokens = $0.00004 per token
  };

  /**
   * Initialize AI services with OpenAI gpt-image-1 as primary image generator
   */
  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for OpenAI service');
    }
    
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    console.log('✅ OpenAI Service initialized for image generation with gpt-image-1');
  }

  /**
   * Calculate token costs based on usage data
   */
  private calculateTokenCosts(usage: any): TokenCosts {
    // Handle different response formats
    const inputTokens = usage?.input_tokens || usage?.prompt_tokens || 0;
    const outputTokens = usage?.output_tokens || usage?.completion_tokens || 0;
    
    // For image generation, we need to determine token types
    // Based on the actual response structure, we'll treat:
    // - input_tokens as text input (prompt)
    // - output_tokens as image output tokens (generated images)
    const textInputTokens = inputTokens;
    const imageInputTokens = 0; // No image input for text-to-image generation
    const imageOutputTokens = outputTokens;
    
    const textInputCost = textInputTokens * this.PRICING.TEXT_INPUT;
    const imageInputCost = imageInputTokens * this.PRICING.IMAGE_INPUT;
    const imageOutputCost = imageOutputTokens * this.PRICING.IMAGE_OUTPUT;
    
    const totalCost = textInputCost + imageInputCost + imageOutputCost;
    
    return {
      textInputTokens,
      imageInputTokens,
      imageOutputTokens,
      totalCost
    };
  }

  /**
   * Log token usage and costs
   */
  private logTokenUsage(usage: any, operation: string): void {
    try {
      if (!usage) {
        console.log(`[OpenAI Cost] ${operation}: No usage data available`);
        return;
      }

      const costs = this.calculateTokenCosts(usage);
      
      console.log(`💰 [OpenAI Cost] ${operation}:`);
      console.log(`   Text Input: ${costs.textInputTokens} tokens = $${(costs.textInputTokens * this.PRICING.TEXT_INPUT).toFixed(6)}`);
      console.log(`   Image Input: ${costs.imageInputTokens} tokens = $${(costs.imageInputTokens * this.PRICING.IMAGE_INPUT).toFixed(6)}`);
      console.log(`   Image Output: ${costs.imageOutputTokens} tokens = $${(costs.imageOutputTokens * this.PRICING.IMAGE_OUTPUT).toFixed(6)}`);
      console.log(`   💵 Total Cost: $${costs.totalCost.toFixed(6)}`);
    } catch (error) {
      console.error(`[OpenAI Cost] ${operation} - Error calculating costs:`, error);
    }
  }

  /**
   * Build comprehensive prompt with all user input for GPT Image
   */
  public buildPrompt(session: SessionData): string {
    console.log('[ENHANCED] Building comprehensive prompt with OpenAI gpt-image-1 - capturing ALL user input');
    
    const iconPrompt = this.buildIconSpecificPrompt(session);
    
    const brandContext = [
      '=== BRAND IDENTITY CONTEXT ===',
      session.name ? `Brand Name: "${session.name}"` : '',
      session.tagline && session.tagline !== 'skip' ? `Tagline/Slogan: "${session.tagline}"` : '',
      session.mission ? `Business Mission/Industry: ${session.mission}` : '',
      session.audience ? `Target Audience: ${session.audience}` : '',
      session.vibe ? `Brand Personality/Vibe: ${session.vibe}` : '',
      ''
    ].filter(Boolean).join('\n');

    const designPreferences = [
      '=== DESIGN PREFERENCES ===',
      session.stylePreferences?.length ? `Visual Style: ${session.stylePreferences.join(', ')}` : '',
      session.colorPreferences ? `Color Palette: ${session.colorPreferences}` : '',
      session.typography ? `Typography Style: ${session.typography}` : '',
      iconPrompt,
      ''
    ].filter(Boolean).join('\n');

    const inspirationRequirements = [
      '=== INSPIRATION & REQUIREMENTS ===',
      session.inspiration ? `Design Inspiration: ${session.inspiration}` : '',
      session.finalNotes ? `Special Requirements: ${session.finalNotes}` : '',
      ''
    ].filter(Boolean).join('\n');

    const technicalRequirements = [
      '=== TECHNICAL REQUIREMENTS ===',
      'Format: High-quality PNG with transparent background',
      'Scalability: Vector-style design that works at all sizes',
      'Compatibility: Works on both light and dark backgrounds',
      'Usage: Suitable for digital and print applications',
      'Quality: Professional industry standards',
      ''
    ].join('\n');

    const designObjectives = [
      '=== DESIGN OBJECTIVES ===',
      '1. Create a memorable and unique visual identity that stands out from competitors',
      '2. Ensure the logo reflects the brand identity, values, and personality described above',
      '3. Design with clear visual hierarchy and proper spacing for optimal readability',
      '4. Use colors and typography that convey the right emotions and industry standards',
      '5. Ensure the logo is instantly recognizable and works well at different sizes',
      '6. Follow professional design principles with appropriate contrast and legibility',
      '7. Create a timeless design that will remain relevant and effective over time',
      ''
    ].join('\n');

    const comprehensivePrompt = [
      brandContext,
      designPreferences,
      inspirationRequirements,
      technicalRequirements,
      designObjectives,
      '=== FINAL INSTRUCTION ===',
      'Generate a professional, industry-standard logo that incorporates ALL the above context, preferences, and requirements. The logo should be a cohesive visual representation of the brand that works perfectly for all intended uses.'
    ].join('\n');

    return comprehensivePrompt;
  }

  /**
   * Build icon-specific prompt to make icons more distinct
   */
  private buildIconSpecificPrompt(session: SessionData): string {
    if (!session.iconIdeas || session.iconIdeas.toLowerCase() === 'skip') {
      return 'Icon Focus: No specific icon requirements - create a balanced logo design';
    }

    const iconArray = session.iconIdeas.toLowerCase().split(', ');
    const brandName = session.name || 'the brand';
    const style = session.stylePreferences?.[0] || 'modern';

    // Enhanced icon-specific prompts based on icon categories
    const iconPrompts = {
      tech: [
        `Create a distinctive tech-focused icon featuring ${iconArray.join(' and ')} elements. Make the icon prominent and recognizable, incorporating modern tech aesthetics like geometric shapes, circuit patterns, or digital elements.`,
        `Design a tech-forward icon that prominently showcases ${iconArray.join(' and ')} with clean lines, digital-inspired forms, and contemporary tech styling.`
      ],
      nature: [
        `Create a nature-inspired icon featuring ${iconArray.join(' and ')} elements. Make the icon organic and distinctive, incorporating natural forms, flowing lines, and earthy aesthetics.`,
        `Design a nature-focused icon that prominently displays ${iconArray.join(' and ')} with organic shapes, natural textures, and environmental styling.`
      ],
      business: [
        `Create a professional business icon featuring ${iconArray.join(' and ')} elements. Make the icon authoritative and distinctive, incorporating corporate aesthetics, clean geometry, and professional styling.`,
        `Design a business-forward icon that prominently showcases ${iconArray.join(' and ')} with professional forms, corporate styling, and authoritative presence.`
      ],
      abstract: [
        `Create an abstract icon featuring ${iconArray.join(' and ')} elements. Make the icon distinctive and memorable, incorporating creative forms, artistic styling, and unique visual elements.`,
        `Design an abstract-focused icon that prominently displays ${iconArray.join(' and ')} with creative forms, artistic elements, and distinctive styling.`
      ]
    };

    // Determine category based on style preferences
    let category = 'abstract';
    if (style.includes('tech') || style.includes('modern') || style.includes('minimal')) {
      category = 'tech';
    } else if (style.includes('nature') || style.includes('organic') || style.includes('natural')) {
      category = 'nature';
    } else if (style.includes('professional') || style.includes('corporate') || style.includes('business')) {
      category = 'business';
    }

    const prompts = iconPrompts[category as keyof typeof iconPrompts];
    const selectedPrompt = prompts[Math.floor(Math.random() * prompts.length)];

    return `Icon Focus: ${selectedPrompt}`;
  }

  /**
   * Generate logo images using OpenAI gpt-image-1 with retry logic
   */
  public async generateLogoImages(params: { prompt: string; userId?: number; userBalance?: number; freeGeneration?: boolean; sessionId?: string }): Promise<string[]> {
    const startTime = Date.now();
    console.log('🎨 Generating logo images with OpenAI...');

    // Use retry mechanism for the API call
    const retryResult = await retryOpenAICall(
      async () => {
        
        const response = await this.client.responses.create({
          model: 'gpt-4.1-mini',
          input: params.prompt,
          tools: [{ type: 'image_generation' }]
        });

        // Check for usage information in the response and log costs
        if (response.usage) {
          this.logTokenUsage(response.usage, 'Logo Generation');
        }
        
        const imageData = response.output
          .filter((output: any) => output.type === 'image_generation_call')
          .map((output: any) => output.result);
        
        if (imageData.length === 0) {
          throw new Error('No image generation calls returned from OpenAI API');
        }
        
        const imageUrls = imageData.map((base64Data: string) => `data:image/png;base64,${base64Data}`);
        
        return imageUrls;
      },
      `Logo generation for user ${params.userId || 'unknown'}`
    );

    if (!retryResult.success) {
      const errorMessage = handleImageGenerationError(retryResult.error, 'Logo generation');
      console.error(`[OpenAI] Logo generation failed after ${retryResult.attempts} attempts:`, retryResult.error);
      throw new Error(errorMessage);
    }

    const imageUrls = retryResult.data!;
    const totalTime = Date.now() - startTime;
    
    console.log(`✅ Generated ${imageUrls.length} logo images successfully in ${totalTime}ms`);
    
    return imageUrls;
  }

  /**
   * Generate image using OpenAI with image context (for icon extraction) with retry logic
   */
  public async generateImageWithContext(options: {
    prompt: string;
    imageDataUrl: string;
    userId?: number;
    sessionId?: string;
    generationType?: string;
  }): Promise<any> {
    console.log('🖼️ Generating image with context using OpenAI...');

    // Use retry mechanism for the API call
    const retryResult = await retryOpenAICall(
      async () => {

        // Use Responses API with image input as per documentation
        const response = await this.client.responses.create({
          model: 'gpt-4.1-mini',
          input: [{
            role: 'user',
            content: [
              { type: 'input_text', text: options.prompt },
              {
                type: 'input_image',
                image_url: options.imageDataUrl,
                detail: 'high'
              },
            ],
          }],
          tools: [{ type: 'image_generation' }]
        });

        // Check for usage information in the response and log costs
        if (response.usage) {
          this.logTokenUsage(response.usage, 'Image Generation with Context');
        }

        // Extract image data from Responses API format (as per documentation)
        const imageData = response.output
          .filter((output: any) => output.type === 'image_generation_call')
          .map((output: any) => output.result);
        
        if (imageData.length === 0) {
          throw new Error('No image generation calls returned from OpenAI API');
        }
        
        // Return base64 data as data URL
        const result = `data:image/png;base64,${imageData[0]}`;
        
        return result;
      },
      `Image generation with context for user ${options.userId || 'unknown'}`
    );

    if (!retryResult.success) {
      const errorMessage = handleImageGenerationError(retryResult.error, 'Image generation with context');
      console.error(`[OpenAI] Image generation with context failed after ${retryResult.attempts} attempts:`, retryResult.error);
      throw new Error(errorMessage);
    }

    const result = retryResult.data!;
    console.log(`✅ Image generated successfully with context`);
    
    return result;
  }

  /**
   * Generate image using OpenAI with enhanced options
   */
  public async generateImage(options: {
    prompt: string;
    image?: Buffer;
    model?: string;
    size?: 'auto' | '1024x1024' | '1536x1024' | '1024x1536' | '256x256' | '512x512' | '1792x1024' | '1024x1792';
    response_format?: 'url' | 'b64_json';
    quality?: 'standard' | 'hd' | 'low' | 'medium' | 'high' | 'auto';
    style?: 'vivid' | 'natural';
    user?: string;
    userId?: number;
    userBalance?: number;
    sessionId?: string;
    generationType?: string;
  }): Promise<any> {
    try {
      console.log('Generating image with OpenAI...');

        const response = await this.client.images.generate({
          model: options.model || 'dall-e-3',
          prompt: options.prompt,
        size: options.size || '1024x1024',
        quality: options.quality || 'standard',
        style: options.style || 'vivid',
        response_format: options.response_format || 'url',
        user: options.user
      });

      // Log token usage and costs if available
      if (response.usage) {
        this.logTokenUsage(response.usage, 'Image Generation');
      }

      if (options.response_format === 'b64_json') {
        // Return base64 data as data URL
        const base64Data = response.data[0].b64_json;
        return `data:image/png;base64,${base64Data}`;
      } else {
        // Return URL
        return response.data[0].url || '';
      }
    } catch (error) {
      console.error('Error generating image:', error);
      throw error;
    }
  }

  /**
   * Edit an uploaded image using OpenAI's GPT-Image-1 image editing capabilities
   */
  public async editImage(params: {
    imageBuffer: Buffer;
    prompt: string;
    size?: '256x256' | '512x512' | '1024x1024';
    model?: string;
    userId?: number;
  }): Promise<string[]> {
    try {
      console.log('[OpenAI] Starting image editing with GPT-Image-1...');
      
      // Create a clean Buffer copy for toFile compatibility
      const imageData = params.imageBuffer instanceof Buffer ? params.imageBuffer : Buffer.from(params.imageBuffer);
      const cleanBuffer = Buffer.from(imageData);
      
      // Use OpenAI's native image editing endpoint
      const response = await this.client.images.edit({
        model: params.model || 'gpt-image-1',
        image: await toFile(cleanBuffer, 'image.png', { type: 'image/png' }),
        prompt: params.prompt,
        size: params.size || '1024x1024',
        quality: 'high'
      });
      
      // Log token usage and costs if available
      if (response.usage) {
        this.logTokenUsage(response.usage, 'GPT-Image-1 Edit');
      } else {
        // For GPT-Image-1, calculate estimated costs based on request parameters
        const estimatedTokens = this.estimateImageEditTokens(params.prompt, params.size || '1024x1024');
        const estimatedCost = (estimatedTokens.textInputTokens * this.PRICING.TEXT_INPUT) + 
                             (estimatedTokens.imageInputTokens * this.PRICING.IMAGE_INPUT) + 
                             (estimatedTokens.imageOutputTokens * this.PRICING.IMAGE_OUTPUT);
        
        console.log(`💰 [OpenAI Cost] GPT-Image-1 Edit (estimated):`);
        console.log(`   Text Input: ${estimatedTokens.textInputTokens} tokens = $${(estimatedTokens.textInputTokens * this.PRICING.TEXT_INPUT).toFixed(6)}`);
        console.log(`   Image Input: ${estimatedTokens.imageInputTokens} tokens = $${(estimatedTokens.imageInputTokens * this.PRICING.IMAGE_INPUT).toFixed(6)}`);
        console.log(`   Image Output: ${estimatedTokens.imageOutputTokens} tokens = $${(estimatedTokens.imageOutputTokens * this.PRICING.IMAGE_OUTPUT).toFixed(6)}`);
        console.log(`   💵 Total Estimated Cost: $${estimatedCost.toFixed(6)}`);
      }
      
      if (response.data && response.data[0]) {
        if (response.data[0].url) {
          console.log('[OpenAI] Successfully edited image (URL format)');
          return [response.data[0].url];
        } else if (response.data[0].b64_json) {
          // Convert base64 to data URL for consistency
          const dataUrl = `data:image/png;base64,${response.data[0].b64_json}`;
          console.log('[OpenAI] Successfully edited image (Base64 format)');
          return [dataUrl];
        } else {
          throw new Error('No image data returned from editing');
        }
      } else {
        throw new Error('No image data returned from editing');
      }
      
    } catch (error) {
      console.error('[OpenAI] Error in editImage:', error);
      throw error;
    }
  }

  /**
   * Estimate token costs for GPT-Image-1 editing based on prompt and size
   */
  private estimateImageEditTokens(prompt: string, size: string): TokenCosts {
    // Estimate text input tokens (approximately 1 token per 4 characters for prompt)
    const textInputTokens = Math.ceil(prompt.length / 4);
    
    // GPT-Image-1 editing involves:
    // - Input image tokens (depends on image size)
    // - Output image tokens (depends on generated image size)
    const sizeMultipliers: Record<string, { input: number, output: number }> = {
      '256x256': { input: 250, output: 272 },
      '512x512': { input: 500, output: 544 }, 
      '1024x1024': { input: 1000, output: 1056 }
    };
    
    const multipliers = sizeMultipliers[size] || sizeMultipliers['1024x1024'];
    
    return {
      textInputTokens,
      imageInputTokens: multipliers.input,
      imageOutputTokens: multipliers.output,
      totalCost: (textInputTokens * this.PRICING.TEXT_INPUT) + 
                 (multipliers.input * this.PRICING.IMAGE_INPUT) + 
                 (multipliers.output * this.PRICING.IMAGE_OUTPUT)
    };
  }

} 