import Replicate from 'replicate';

export class LeonardoService {
  private replicate: Replicate;

  constructor() {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      throw new Error('REPLICATE_API_TOKEN environment variable is required');
    }

    this.replicate = new Replicate({
      auth: token,
    });
  }

  /**
   * Generate stickers using Leonardo AI via Replicate
   * Can generate up to 8 transparent background stickers at once
   */
  async generateStickers(params: {
    prompt: string;
    count?: number;
    userId?: number;
    sessionId?: string;
    generationType?: string;
  }): Promise<string[]> {
    const totalRequested = Math.max(1, params.count || 8);
    const MAX_PER_REQUEST = 4; // Replicate validation: num_outputs <= 4
    const results: string[] = [];

    try {
      console.log(`[Leonardo AI] Starting sticker generation for user: ${params.userId}`);
      console.log(`[Leonardo AI] Prompt: ${params.prompt.substring(0, 120)}...`);
      console.log(`[Leonardo AI] Total requested: ${totalRequested} (batching by ${MAX_PER_REQUEST})`);

      let remaining = totalRequested;
      let batchIndex = 0;
      while (remaining > 0) {
        const batchSize = Math.min(remaining, MAX_PER_REQUEST);
        batchIndex += 1;
        console.log(`[Leonardo AI] Batch ${batchIndex}: generating ${batchSize} stickers`);

        const output = await this.replicate.run(
          "leonardo-ai/leonardo-ai-sdxl:8beff3369e81422112d93b89ca01426147de542cd4684c244b673b105188fe5f",
          {
            input: {
              prompt: params.prompt,
              num_inference_steps: 20,
              guidance_scale: 7.5,
              width: 512,
              height: 512,
              num_outputs: batchSize, // cap at 4
              scheduler: "K_EULER",
              output_format: "png",
              output_quality: 90,
              // Hint for transparent-looking results
              negative_prompt: "solid background, white background, black background, colored background, watermark, logo, text overlay"
            }
          }
        ) as string[];

        if (Array.isArray(output)) {
          results.push(...output);
        }
        remaining -= batchSize;
      }

      console.log(`[Leonardo AI] Successfully generated ${results.length}/${totalRequested} stickers for user: ${params.userId}`);
      return results;

    } catch (error) {
      console.error('[Leonardo AI] Sticker generation failed:', error);
      throw new Error(`Sticker generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build comprehensive sticker prompt from session data
   */
  buildStickerPrompt(session: any): string {
    const style = session.stickerStyle || 'Crypto';
    const phrases = session.stickerPhrases || '';
    const hasImage = !session.stickerImageSkipped;
    const count = session.stickerCount || 8;

    // Build comprehensive sticker context section
    const stickerContext = [
      '=== STICKER CONTEXT ===',
      `Style Theme: ${style}`,
      `Sticker Count: ${count} stickers`,
      `Has Reference Image: ${hasImage ? 'Yes - use uploaded image as reference' : 'No - create original designs'}`,
      ''
    ].join('\n');

    // Build comprehensive content section
    const contentSection = [
      '=== CONTENT REQUIREMENTS ===',
      phrases.toLowerCase() !== 'none' && phrases.trim() !== '' ? `Text/Phrases/Emojis: "${phrases}"` : 'No specific text requirements',
      ''
    ].join('\n');

    // Build design requirements section
    const designRequirements = [
      '=== DESIGN REQUIREMENTS ===',
      'Style: Bold, colorful, eye-catching design',
      'Background: Transparent background (PNG with alpha channel)',
      'Composition: Don\'t crop any important elements',
      'Text Safety: Don\'t include text that is cut off',
      'Text Readability: Make sure any text is easily readable',
      'Format: Suitable for Telegram sticker pack',
      'Quality: High-quality, professional appearance',
      ''
    ].join('\n');

    // Build technical specifications section
    const technicalSpecs = [
      '=== TECHNICAL SPECIFICATIONS ===',
      'Format: PNG with transparent background',
      'Size: Optimized for Telegram sticker dimensions',
      'Quality: High resolution, crisp edges',
      'Compatibility: Works across all Telegram clients',
      'Performance: Optimized file size for fast loading',
      ''
    ].join('\n');

    // Build design objectives section
    const designObjectives = [
      '=== DESIGN OBJECTIVES ===',
      '1. Create engaging, expressive stickers that convey emotions and actions',
      '2. Ensure each sticker is unique and adds value to the sticker pack',
      '3. Make stickers that are versatile and useful in various conversations',
      '4. Design with clear visual hierarchy and strong visual impact',
      '5. Ensure stickers work well at small sizes (Telegram display)',
      '6. Create cohesive visual style across all stickers in the pack',
      '7. Make stickers that are culturally appropriate and universally understood',
      ''
    ].join('\n');

    // Combine all sections into comprehensive prompt
    const comprehensivePrompt = [
      stickerContext,
      contentSection,
      designRequirements,
      technicalSpecs,
      designObjectives,
      '=== FINAL INSTRUCTION ===',
      `Generate ${count} professional ${style} stickers that incorporate ALL the above context, requirements, and specifications. Each sticker should be unique, engaging, and perfectly suited for a Telegram sticker pack.`
    ].join('\n');

    return comprehensivePrompt;
  }
}
