import OpenAI from 'openai';
import { SessionData } from '../types';
import { Readable } from 'stream';
import { FluxService } from './flux.service';


/**
 * Enhanced OpenAI Service with Flux AI Integration
 * Now powered by FLUX AI for superior logo generation
 */
export class OpenAIService {
  private client: OpenAI;
  private fluxService: FluxService;
  private useFlux: boolean = true;  // Always use FLUX for image generation

  /**
   * Initialize AI services with FLUX as primary image generator
   */
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    this.fluxService = new FluxService();
    
    console.log('[ENHANCED] OpenAI Service now powered by FLUX AI for superior logo generation!');
  }

  /**
   * Build a prompt for logo generation - Enhanced with FLUX industry standards
   */
  public buildPrompt(session: SessionData): string {
    if (this.useFlux) {
      console.log('[ENHANCED] Building industry-standard prompt with FLUX AI');
      return this.fluxService.buildPrompt(session);
    }
    
    // Fallback to original prompt structure
    const parts = [
      session.name ? `Brand Name: ${session.name}` : '',
      session.tagline ? `Tagline: ${session.tagline}` : '',
      session.mission ? `Mission/Industry: ${session.mission}` : '',
      session.audience ? `Target Audience: ${session.audience}` : '',
      session.vibe ? `Brand Vibe: ${session.vibe}` : '',
      session.stylePreferences?.length ? `Style Preferences: ${session.stylePreferences.join(', ')}` : '',
      session.colorPreferences ? `Color Preferences: ${session.colorPreferences}` : '',
      session.typography ? `Typography: ${session.typography}` : '',
      session.iconIdea ? `Icon Ideas: ${session.iconIdea}` : '',
      session.inspiration ? `Inspiration: ${session.inspiration}` : '',
      session.finalNotes ? `Additional Notes: ${session.finalNotes}` : '',
      '',
      'Please generate a professional, industry-standard logo that:',
      '1. Reflects the brand identity and values described above',
      '2. Is memorable, unique, and stands out from competitors',
      '3. Works well at different sizes (scalable vector-style design)',
      '4. Uses appropriate colors that convey the right emotions and industry standards',
      '5. Incorporates typography that matches the brand personality',
      '6. Be scalable, work on both light and dark backgrounds, and be suitable for both digital and print use',
      '7. Follow professional industry standards for logo design with appropriate contrast, legibility, and recognition',
      '8. Demonstrate clear visual hierarchy and proper spacing'
    ].filter(Boolean).join('\n');

    return parts;
  }

  /**
   * Generate logo images using OpenAI DALL-E 3
   */
  public async generateLogoImages(params: { prompt: string; userId?: number; userBalance?: number; freeGeneration?: boolean; sessionId?: string }): Promise<string[]> {
    const startTime = Date.now();
    let imageUrls: string[] = [];
    let error: string | undefined;

    try {
      console.log('Generating logo images with OpenAI...');

      const response = await this.client.images.generate({
        model: 'dall-e-3',
        prompt: params.prompt,
        n: 1, // DALL-E 3 only supports n=1
        size: '1024x1024',
        response_format: 'url'
      });

      imageUrls = response.data?.map(img => img.url!) || [];
      console.log(`Generated ${imageUrls.length} logo images successfully`);
      
      return imageUrls;
    } catch (err: any) {
      error = err.message || 'Unknown error';
      console.error('Error generating logo images:', err);
      throw new Error('Failed to generate logo images. Please try again later.');
    } finally {
      // Log the API call
      if (params.userId) {
        console.log(`[OpenAI] Logo generation completed for user ${params.userId}`);
      }
    }
  }

  /**
   * Generate high-resolution logo
   */
  public async generateHighResolutionLogo(prompt: string, userId?: number, userBalance?: number, sessionId?: string): Promise<string> {
    let imageUrl: string | undefined;
    let error: string | undefined;

    try {
      console.log('Generating high-resolution logo...');

      const response = await this.client.images.generate({
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: '1024x1024',
        response_format: 'url'
      });

      imageUrl = response.data?.[0]?.url;
      if (!imageUrl) {
        throw new Error('No image URL returned from OpenAI');
      }

      console.log('High-resolution logo generated successfully');
      return imageUrl;
    } catch (err: any) {
      error = err.message || 'Unknown error';
      console.error('Error generating high-resolution logo:', err);
      throw new Error('Failed to generate high-resolution logo. Please try again later.');
    } finally {
      // Log the API call
      if (userId) {
        console.log(`[OpenAI] High-res logo generation completed for user ${userId}`);
      }
    }
  }

  /**
   * Generate meme text suggestions using GPT-4
   */
  public async generateMemeText(prompt: string, userId?: number, userBalance?: number, sessionId?: string): Promise<string[]> {
    let textResponse: string[] = [];
    let error: string | undefined;
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      console.log('Generating meme text suggestions...');

      const response = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a creative meme text generator. Generate catchy, funny, and viral-worthy text for memes. Be creative and engaging.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 100,
        temperature: 0.9
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        textResponse = content.split('\n').filter(line => line.trim());
      }

      inputTokens = response.usage?.prompt_tokens || 0;
      outputTokens = response.usage?.completion_tokens || 0;

      console.log(`Generated ${textResponse.length} meme text suggestions`);
      return textResponse;
    } catch (err: any) {
      error = err.message || 'Unknown error';
      console.error('Error generating meme text:', err);
      return ['HODL!'];
    } finally {
      // Log the text generation call
      if (userId) {
        console.log(`[OpenAI] Text generation completed for user ${userId}`);
      }
    }
  }

  /**
   * Generate image using OpenAI with enhanced options
   */
  public async generateImage(options: {
    prompt: string;
    image?: Buffer;
    model?: string;
    size?: string;
    response_format?: 'url' | 'b64_json';
    userId?: number;
    userBalance?: number;
    sessionId?: string;
    generationType?: string;
  }): Promise<any> {
    let result: any;
    let error: string | undefined;

    try {
      console.log('Generating image with enhanced options...');

      if (options.image) {
        // Image editing/variation not supported in this simplified version
        throw new Error('Image editing not supported in this version');
      } else {
        // Generate new image
        const response = await this.client.images.generate({
          model: options.model || 'dall-e-3',
          prompt: options.prompt,
          n: 1,
          size: options.size as any || '1024x1024',
          response_format: options.response_format || 'url'
        });

        result = response;
      }

      console.log('Image generated successfully');
      return result;
    } catch (err: any) {
      error = err.message || 'Unknown error';
      console.error('Error generating image:', err);
      throw new Error('Failed to generate image. Please try again later.');
    } finally {
      // Log the API call
      if (options.userId) {
        console.log(`[OpenAI] Image generation completed for user ${options.userId}`);
      }
    }
  }

  /**
   * Generate images with OpenAI DALL-E
   */
  public async generateImageWithOpenAI(params: {
    prompt: string;
    n?: number;
    size?: string;
    model?: string;
    userId?: number;
    userBalance?: number;
    sessionId?: string;
    generationType?: string;
    freeGeneration?: boolean;
  }): Promise<string[]> {
    let imageB64s: string[] = [];
    let error: string | undefined;

    try {
      console.log('Generating images with Flux AI...');

      // Generate images using Flux AI
      const imageUrls = await this.fluxService.generateImages({
        prompt: params.prompt,
        userId: params.userId?.toString(),
        sessionId: params.sessionId,
        numImages: params.n || 4
      });

      // Convert URLs to base64
      imageB64s = await Promise.all(
        imageUrls.map(async (url) => {
          try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            return buffer.toString('base64');
          } catch (fetchError) {
            console.error('Error converting image to base64:', fetchError);
            return ''; // Return empty string for failed conversions
          }
        })
      );

      // Filter out empty strings
      imageB64s = imageB64s.filter(b64 => b64.length > 0);
      
      console.log(`Generated ${imageB64s.length} images successfully with Flux AI`);
      
      return imageB64s;
    } catch (err: any) {
      error = err.message || 'Unknown error';
      console.error('Error generating images:', err);
      throw new Error('Failed to generate images. Please try again later.');
    } finally {
      // Log the API call
      if (params.userId) {
        console.log(`[Flux AI] Image generation completed for user ${params.userId}`);
      }
    }
  }

  /**
   * Edit image for sticker creation
   */
  public async editImageForSticker(options: {
    image: Buffer;
    prompt: string;
    userId?: number;
    userBalance?: number;
    sessionId?: string;
  }): Promise<string> {
    let result: string;
    let error: string | undefined;

    try {
      console.log('Editing image for sticker...');

      // Convert buffer to file-like object for OpenAI
      const imageFile = new Blob([options.image], { type: 'image/png' });

      const response = await this.client.images.edit({
        image: imageFile as any,
        prompt: options.prompt,
        n: 1,
        size: '512x512',
        response_format: 'b64_json'
      });

      result = response.data?.[0]?.b64_json!;
      if (!result) {
        throw new Error('No image data returned from OpenAI');
      }

      console.log('Image edited successfully for sticker');
      return result;
    } catch (err: any) {
      error = err.message || 'Unknown error';
      console.error('Error editing image for sticker:', err);
      throw new Error('Failed to edit image for sticker. Please try again later.');
    } finally {
      // Log the API call
      if (options.userId) {
        console.log(`[OpenAI] Image editing completed for user ${options.userId}`);
      }
    }
  }
} 