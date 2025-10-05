import Replicate from 'replicate';

export class FluxService {
  private replicate: Replicate;
  // Expose last call cost for DB logging (approximate)
  public lastCallCostUsd: number | null = null;
  public lastModel: string | null = null;
  public lastMetrics: any = null;

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
   * Generate stickers using Black Forest Labs FLUX via Replicate
   * Batches requests with max 4 outputs per call (Replicate constraint)
   */
  async generateStickers(params: {
    prompt: string;
    count?: number;
    userId?: number;
    sessionId?: string;
    generationType?: string;
  }): Promise<string[]> {
    const totalRequested = Math.max(1, params.count || 8);
    const MAX_PER_REQUEST = 4;
    const results: string[] = [];

    try {
      // reset per-call accumulators
      this.lastCallCostUsd = 0;
      this.lastMetrics = null;
      console.log(`[FLUX] Starting sticker generation for user: ${params.userId}`);
      console.log(`[FLUX] Prompt: ${params.prompt.substring(0, 120)}...`);
      console.log(`[FLUX] Total requested: ${totalRequested} (batching by ${MAX_PER_REQUEST})`);

      let remaining = totalRequested;
      let batchIndex = 0;
      while (remaining > 0) {
        const batchSize = Math.min(remaining, MAX_PER_REQUEST);
        batchIndex += 1;
        console.log(`[FLUX] Batch ${batchIndex}: generating ${batchSize} stickers`);

        const modelId = 'black-forest-labs/flux-schnell';
        const { output, metrics, costUsd } = await this.runWithMetrics(modelId, {
          prompt: params.prompt,
          num_inference_steps: 4,
          guidance_scale: 1,
          width: 512,
          height: 512,
          num_outputs: batchSize,
          go_fast: true,
          output_format: 'png',
          output_quality: 90
        });

        if (Array.isArray(output)) {
          results.push(...output);
        }
        // Accurate cost logging using prediction metrics
        this.lastCallCostUsd = (this.lastCallCostUsd || 0) + costUsd;
        this.lastModel = modelId;
        this.lastMetrics = metrics;
        console.log(`[FLUX] Batch ${batchIndex} metrics: predict_time=${metrics?.predict_time || 0}s, batch_cost=$${costUsd.toFixed(6)}`);
        remaining -= batchSize;
      }

      console.log(`[FLUX] Successfully generated ${results.length}/${totalRequested} stickers for user: ${params.userId}`);
      console.log(`[FLUX] Total cost for this stickers job: $${(this.lastCallCostUsd || 0).toFixed(6)}`);
      return results;

    } catch (error) {
      console.error('[FLUX] Sticker generation failed:', error);
      throw new Error(`Sticker generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate meme images using Black Forest Labs FLUX via Replicate
   * Similar batching approach as stickers, but without sticker-specific constraints
   */
  async generateMemes(params: {
    prompt: string;
    count?: number;
    userId?: number;
    sessionId?: string;
    generationType?: string;
  }): Promise<string[]> {
    const totalRequested = Math.max(1, params.count || 1);
    const MAX_PER_REQUEST = 4;
    const results: string[] = [];

    try {
      // reset per-call accumulators
      this.lastCallCostUsd = 0;
      this.lastMetrics = null;
      console.log(`[FLUX] Starting meme generation for user: ${params.userId}`);
      console.log(`[FLUX] Prompt: ${params.prompt.substring(0, 120)}...`);
      console.log(`[FLUX] Total requested: ${totalRequested} (batching by ${MAX_PER_REQUEST})`);

      let remaining = totalRequested;
      let batchIndex = 0;
      while (remaining > 0) {
        const batchSize = Math.min(remaining, MAX_PER_REQUEST);
        batchIndex += 1;
        console.log(`[FLUX] Batch ${batchIndex}: generating ${batchSize} memes`);

        const modelId = 'black-forest-labs/flux-schnell';
        const { output, metrics, costUsd } = await this.runWithMetrics(modelId, {
          prompt: params.prompt,
          num_inference_steps: 4,
          guidance_scale: 1,
          width: 1024,
          height: 1024,
          num_outputs: batchSize,
          go_fast: true,
          output_format: 'png',
          output_quality: 90
        });

        if (Array.isArray(output)) {
          results.push(...output);
        }
        // Accurate cost logging using prediction metrics
        this.lastCallCostUsd = (this.lastCallCostUsd || 0) + costUsd;
        this.lastModel = modelId;
        this.lastMetrics = metrics;
        console.log(`[FLUX] Batch ${batchIndex} metrics: predict_time=${metrics?.predict_time || 0}s, batch_cost=$${costUsd.toFixed(6)}`);
        remaining -= batchSize;
      }

      console.log(`[FLUX] Successfully generated ${results.length}/${totalRequested} memes for user: ${params.userId}`);
      console.log(`[FLUX] Total cost for this memes job: $${(this.lastCallCostUsd || 0).toFixed(6)}`);
      return results;

    } catch (error) {
      console.error('[FLUX] Meme generation failed:', error);
      throw new Error(`Meme generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Maintain the same prompt builder interface used previously
   */
  buildStickerPrompt(session: any): string {
    const style = session.stickerStyle || 'Crypto';
    const phrases = session.stickerPhrases || '';
    const hasImage = !session.stickerImageSkipped;
    const count = session.stickerCount || 8;

    const stickerContext = [
      '=== STICKER CONTEXT ===',
      `Style Theme: ${style}`,
      `Sticker Count: ${count} stickers`,
      `Has Reference Image: ${hasImage ? 'Yes - use uploaded image as reference' : 'No - create original designs'}`,
      ''
    ].join('\n');

    const contentSection = [
      '=== CONTENT REQUIREMENTS ===',
      phrases.toLowerCase() !== 'none' && phrases.trim() !== '' ? `Text/Phrases/Emojis: "${phrases}"` : 'No specific text requirements',
      ''
    ].join('\n');

    const designRequirements = [
      '=== DESIGN REQUIREMENTS ===',
      'Style: Bold, colorful, eye-catching design',
      'Background: Transparent background (PNG with alpha channel if possible)',
      'Composition: Don\'t crop any important elements',
      'Text Safety: Don\'t include text that is cut off',
      'Text Readability: Make sure any text is easily readable',
      'Format: Suitable for Telegram sticker pack',
      'Quality: High-quality, professional appearance',
      ''
    ].join('\n');

    const technicalSpecs = [
      '=== TECHNICAL SPECIFICATIONS ===',
      'Format: PNG',
      'Size: 512x512 (will be post-processed if needed)',
      'Quality: High resolution, crisp edges',
      'Compatibility: Works across all Telegram clients',
      'Performance: Optimized file size for fast loading',
      ''
    ].join('\n');

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

    return [
      stickerContext,
      contentSection,
      designRequirements,
      technicalSpecs,
      designObjectives,
      '=== FINAL INSTRUCTION ===',
      `Generate ${count} professional ${style} stickers that incorporate ALL the above context, requirements, and specifications. Each sticker should be unique, engaging, and perfectly suited for a Telegram sticker pack.`
    ].join('\n');
  }

  /**
   * Run a Replicate prediction using the model's latest version and return output + metrics
   */
  private async runWithMetrics(modelSlug: string, input: Record<string, any>): Promise<{ output: string[]; metrics: any; costUsd: number }>{
    const token = process.env.REPLICATE_API_TOKEN as string;
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    } as any;

    // 1) Resolve latest model version
    const modelRes = await fetch(`https://api.replicate.com/v1/models/${modelSlug}`, { headers });
    if (!modelRes.ok) {
      throw new Error(`Failed to fetch model info for ${modelSlug}: ${modelRes.status} ${modelRes.statusText}`);
    }
    const modelJson: any = await modelRes.json();
    const versionId: string | undefined = modelJson?.latest_version?.id;
    if (!versionId) throw new Error('Could not resolve latest_version for model');

    // 2) Create prediction
    const createRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ version: versionId, input })
    });
    if (!createRes.ok) {
      const text = await createRes.text();
      throw new Error(`Failed to create prediction: ${createRes.status} ${createRes.statusText} - ${text}`);
    }
    const created: any = await createRes.json();
    const id: string = created.id;

    // 3) Poll until completion
    let status = created.status;
    let prediction: any = created;
    const start = Date.now();
    while (status !== 'succeeded' && status !== 'failed' && status !== 'canceled') {
      await new Promise(r => setTimeout(r, 1500));
      const getRes = await fetch(`https://api.replicate.com/v1/predictions/${id}`, { headers });
      prediction = await getRes.json();
      status = prediction.status;
      if (Date.now() - start > 600000) { // 10 min timeout
        throw new Error('Replicate prediction timed out');
      }
    }
    if (status !== 'succeeded') {
      throw new Error(`Replicate prediction ${status}`);
    }

    const metrics = prediction.metrics || {};
    const outputs = Array.isArray(prediction.output) ? prediction.output.length : 0;
    const pricePerImageRaw = process.env.FLUX_PRICE_PER_IMAGE_USD;
    const pricePerImage = Number(pricePerImageRaw);
    if (!(pricePerImage > 0)) {
      console.warn('[FLUX] FLUX_PRICE_PER_IMAGE_USD is not set or invalid; recording $0 cost. Set it to e.g. 0.003 for flux-schnell.');
    }
    const costUsd = (outputs || 0) * (pricePerImage > 0 ? pricePerImage : 0);

    return { output: prediction.output as string[], metrics, costUsd };
  }
}


