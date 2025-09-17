import Replicate from 'replicate';

export class FluxService {
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

  async generateLogo(prompt: string, fid: number): Promise<string[]> {
    try {
      console.log(`[Flux AI] Starting logo generation for FID: ${fid}`);
      console.log(`[Flux AI] Prompt: ${prompt.substring(0, 100)}...`);
      
      const output = await this.replicate.run(
        "black-forest-labs/flux-schnell",
        {
          input: {
            prompt: prompt,
            num_inference_steps: 4,
            guidance_scale: 0,
            width: 1024,
            height: 1024,
            go_fast: true,
            num_outputs: 2,
            output_format: "png",
            output_quality: 90
          }
        }
      ) as string[];

      console.log(`[Flux AI] Successfully generated ${output.length} images for FID: ${fid}`);
      return output;
      
    } catch (error) {
      console.error('[Flux AI] Generation failed:', error);
      throw new Error(`Logo generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  generatePrompt(sessionData: {
    businessName: string;
    industry?: string;
    style?: string[];
    colors?: string[];
    typography?: string;
    iconIdea?: string[];
    finalNotes?: string;
  }): string {
    const { businessName, industry, style, colors, typography, iconIdea, finalNotes } = sessionData;
    
    let prompt = `Create a professional, modern logo for "${businessName}".`;
    
    if (industry) {
      prompt += ` Industry: ${industry}.`;
    }
    
    if (style && style.length > 0) {
      prompt += ` Style: ${style.join(', ')}.`;
    }
    
    if (colors && colors.length > 0) {
      prompt += ` Colors: ${colors.join(', ')}.`;
    }
    
    if (typography) {
      prompt += ` Typography: ${typography}.`;
    }
    
    if (iconIdea && iconIdea.length > 0) {
      prompt += ` Icon elements: ${iconIdea.join(', ')}.`;
    }
    
    if (finalNotes) {
      prompt += ` Additional requirements: ${finalNotes}.`;
    }
    
    prompt += ' Vector-style design, transparent background, professional and scalable, suitable for business use.';
    
    return prompt;
  }
}

export const fluxService = new FluxService();
