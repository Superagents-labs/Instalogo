import { StorageService } from './storage.service';
import { OpenAIService } from './openai.service';
import sharp from 'sharp';

export interface LogoVariant {
  type: 'standard' | 'transparent' | 'white' | 'icon';
  prompt: string;
  description: string;
}

export interface LogoGenerationData {
  originalPrompt: string;
  selectedImageIndex: number;
  userId: number;
  sessionId?: string;
  brandName?: string;
  seed?: number; // Add seed support
  seeds?: number[]; // Support multiple seeds
}

export class LogoVariantService {
  private storageService: StorageService;
  private openaiService: OpenAIService;

  constructor(storageService: StorageService, openaiService: OpenAIService) {
    this.storageService = storageService;
    this.openaiService = openaiService;
  }

  /**
   * Generate variants for a selected logo using the same seed
   */
  public async generateVariants(
    generationData: LogoGenerationData,
    selectedVariants: LogoVariant['type'][]
  ): Promise<Record<string, string>> {
    const results: Record<string, string> = {};
    
    // Get the seed for the selected logo
    const selectedSeed = generationData.seed || 
      (generationData.seeds && generationData.seeds[generationData.selectedImageIndex]) || 
      Math.floor(Math.random() * 1000000);
    
    console.log(`[LogoVariant] Using seed ${selectedSeed} for consistent generation`);
    
    for (const variantType of selectedVariants) {
      try {
        const variant = this.getVariantConfig(variantType);
        const modifiedPrompt = this.modifyPromptForVariant(generationData.originalPrompt, variant);
        
        console.log(`[LogoVariant] Generating ${variantType} variant with prompt: ${modifiedPrompt.substring(0, 100)}...`);
        
        // Use OpenAI service for variant generation
        const openaiResult = await this.openaiService.generateLogoImages({
          prompt: modifiedPrompt,
          userId: generationData.userId,
          sessionId: generationData.sessionId
        });
        
        // Check if image data exists and is valid
        if (!openaiResult || openaiResult.length === 0) {
          console.error(`[LogoVariant] No image data returned for ${variantType} variant`);
          continue; // Skip this variant and continue with the next one
        }
        
        // Get the first image URL from OpenAI result
        const imageUrl = openaiResult[0];
        if (!imageUrl || typeof imageUrl !== 'string') {
          console.error(`[LogoVariant] Invalid image URL for ${variantType} variant:`, typeof imageUrl);
          continue; // Skip this variant
        }
        
        // Handle both base64 data URLs and direct URLs
        let imageBuffer: Buffer;
        if (imageUrl.startsWith('data:')) {
          // Base64 data URL
          imageBuffer = Buffer.from(imageUrl.split(',')[1], 'base64');
        } else {
          // Direct URL - fetch the image
          try {
            const response = await fetch(imageUrl);
            const arrayBuffer = await response.arrayBuffer();
            imageBuffer = Buffer.from(arrayBuffer);
          } catch (fetchError) {
            console.error(`[LogoVariant] Error fetching image from URL:`, fetchError);
            continue; // Skip this variant
          }
        }
        
        // Process image with Sharp for proper transparency handling
        let processedBuffer: Buffer;
        
        if (variantType === 'white') {
          // For white background variant, composite onto white background
          processedBuffer = await sharp(imageBuffer)
            .composite([{
              input: Buffer.from(`<svg width="1024" height="1024"><rect width="100%" height="100%" fill="white"/></svg>`),
              blend: 'dest-over'
            }])
            .png({ 
              quality: 100,
              compressionLevel: 0,
              adaptiveFiltering: false,
              force: true
            })
            .toBuffer();
        } else {
          // For transparent variants (standard, transparent, icon), OpenAI gpt-image-1 already generates transparent PNGs
          processedBuffer = await sharp(imageBuffer)
            .png({ 
              quality: 100,
              compressionLevel: 0,
              adaptiveFiltering: false,
              force: true // Force PNG output
            })
            .toBuffer();
        }
        
        // Upload processed image to storage
        const key = `logos/${generationData.brandName?.replace(/\s+/g, '-').toLowerCase() || 'logo'}-${variantType}-${Date.now()}.png`;
        
        const storedUrl = await this.storageService.uploadBuffer(processedBuffer, {
          key,
          contentType: 'image/png'
        });
        
        results[variantType] = storedUrl;
        console.log(`[LogoVariant] Generated ${variantType} variant: ${storedUrl}`);
        
      } catch (error) {
        console.error(`[LogoVariant] Error generating ${variantType} variant:`, error);
      }
    }
    
    return results;
  }

  /**
   * Get variant configuration
   */
  private getVariantConfig(variantType: LogoVariant['type']): LogoVariant {
    const variants = this.getAvailableVariants();
    return variants.find(v => v.type === variantType) || variants[0];
  }

  /**
   * Modify the original prompt for variant generation
   */
  private modifyPromptForVariant(originalPrompt: string, variant: LogoVariant): string {
    if (variant.type === 'standard') {
      return originalPrompt; // Use original simple prompt
    }
    
    if (variant.type === 'icon') {
      // Extract brand name from original prompt and create icon-only version
      const brandMatch = originalPrompt.match(/brand name (\w+)/);
      const brandName = brandMatch ? brandMatch[1] : 'logo';
      return `create a suitable icon for ${brandName}, ${variant.prompt}, and make the background transparent`;
    }
    
    return `${originalPrompt}${variant.prompt}`;
  }

  /**
   * Get available variant types
   */
  public getAvailableVariants(): LogoVariant[] {
    return [
      { type: 'standard', prompt: '', description: 'Standard logo with transparent background' },
      { type: 'transparent', prompt: '', description: 'Logo with transparent background' },
      { type: 'white', prompt: '', description: 'Logo with white background' },
      { type: 'icon', prompt: 'icon only, no text', description: 'Icon only (no text)' }
    ];
  }

}
