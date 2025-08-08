import { SessionData } from '../types';

/**
 * Flux AI Service for Enhanced Logo Generation via Replicate
 * Provides direct image generation using Flux AI models
 */
export class FluxService {
  private replicateApiToken: string;
  private apiUrl = 'https://api.replicate.com/v1';

  constructor() {
    this.replicateApiToken = process.env.REPLICATE_API_TOKEN || '';
    if (!this.replicateApiToken) {
      throw new Error('REPLICATE_API_TOKEN is required for Flux AI service');
    }
    console.log('✅ Flux AI Service initialized for enhanced image generation via Replicate');
  }

  /**
   * Generate images using Flux AI models
   */
  public async generateImages(params: {
    prompt: string;
    userId?: string;
    sessionId?: string;
    numImages?: number;
  }): Promise<string[]> {
    try {
      console.log('[FLUX AI] Starting image generation with prompt:', params.prompt.substring(0, 100) + '...');

      // Use Flux.1 [schnell] model for fast generation
      const response = await fetch(`${this.apiUrl}/predictions`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.replicateApiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          version: 'black-forest-labs/flux-schnell',
          input: {
            prompt: params.prompt,
            num_outputs: params.numImages || 4,
            aspect_ratio: '1:1',
            output_format: 'png',
            output_quality: 90,
            num_inference_steps: 4, // Fast generation
            guidance_scale: 3.5,
            seed: Math.floor(Math.random() * 1000000)
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Replicate API error: ${response.status} ${response.statusText}`);
      }

      const prediction = await response.json() as { id: string };
      
      // Poll for completion
      const imageUrls = await this.pollForCompletion(prediction.id);
      
      console.log(`[FLUX AI] Successfully generated ${imageUrls.length} images for user ${params.userId}`);
      return imageUrls;

    } catch (error) {
      console.error('[FLUX AI] Error generating images:', error);
      throw new Error('Failed to generate images with Flux AI. Please try again later.');
    }
  }

  /**
   * Poll Replicate API for prediction completion
   */
  private async pollForCompletion(predictionId: string, maxAttempts: number = 30): Promise<string[]> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(`${this.apiUrl}/predictions/${predictionId}`, {
          headers: {
            'Authorization': `Token ${this.replicateApiToken}`,
            'Content-Type': 'application/json',
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to check prediction status: ${response.status}`);
        }

        const prediction = await response.json() as { 
          status: string; 
          output?: string | string[]; 
          error?: string; 
        };
        
        if (prediction.status === 'succeeded') {
          return Array.isArray(prediction.output) ? prediction.output : [prediction.output || ''];
        } else if (prediction.status === 'failed') {
          throw new Error(`Flux AI generation failed: ${prediction.error || 'Unknown error'}`);
        }

        // Wait 2 seconds before next attempt
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log(`[FLUX AI] Polling attempt ${attempt + 1}/${maxAttempts}, status: ${prediction.status}`);
        
      } catch (error) {
        console.error(`[FLUX AI] Polling error on attempt ${attempt + 1}:`, error);
        if (attempt === maxAttempts - 1) throw error;
      }
    }

    throw new Error('Flux AI generation timed out');
  }

  /**
   * Build an enhanced prompt for Flux AI logo generation
   */
  public buildPrompt(session: SessionData): string {
    // Enhanced prompt structure optimized for Flux AI models
    const brandInfo = this.buildBrandIdentity(session);
    const styleGuide = this.buildStyleRequirements(session);
    const technicalSpecs = this.buildTechnicalRequirements();
    
    const enhancedPrompt = [
      // Brand Identity Section
      brandInfo,
      '',
      // Style Requirements
      styleGuide,
      '',
      // Technical Specifications
      technicalSpecs,
      '',
      // Quality Directives
      'Create a professional, scalable logo with perfect contrast, clean lines, and industry-standard design principles. Ensure the logo works on both light and dark backgrounds and maintains clarity at any size.'
    ].filter(Boolean).join('\n');

    console.log('[FLUX AI] Generated enhanced prompt for:', session.name);
    return enhancedPrompt;
  }

  private buildBrandIdentity(session: SessionData): string {
    const parts = [
      `Professional logo design for "${session.name || 'Brand'}"`,
      session.tagline ? `Tagline: "${session.tagline}"` : '',
      session.mission ? `Industry: ${session.mission}` : '',
      session.audience ? `Target audience: ${Array.isArray(session.audience) ? session.audience.join(', ') : session.audience}` : '',
      session.vibe ? `Brand personality: ${Array.isArray(session.vibe) ? session.vibe.join(', ') : session.vibe}` : ''
    ].filter(Boolean);
    
    return parts.join(', ');
  }

  private buildStyleRequirements(session: SessionData): string {
    const styleElements = [];
    
    if (session.style && Array.isArray(session.style)) {
      styleElements.push(`Style: ${session.style.join(', ')}`);
    }
    
    if (session.colors && Array.isArray(session.colors)) {
      styleElements.push(`Colors: ${session.colors.join(', ')}`);
    }
    
    if (session.typography && Array.isArray(session.typography)) {
      styleElements.push(`Typography: ${session.typography.join(', ')}`);
    }
    
    return styleElements.join(', ') || 'Modern, clean, professional design';
  }

  private buildTechnicalRequirements(): string {
    return [
      'Vector-style illustration',
      'High contrast for visibility', 
      'Scalable design elements',
      'Professional color palette',
      'Clean typography integration',
      'Suitable for both digital and print media'
    ].join(', ');
  }
} 