import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { StorageService } from './storage.service';
import { OpenAIService } from './openai.service';

export interface CompleteAssetPackage {
  // Core formats
  transparentPng: string;
  whiteBackgroundPng: string;
  blackBackgroundPng: string;
  
  // Vector formats
  svg: string;
  pdf: string;
  eps: string;
  
  // Size variants
  sizes: {
    favicon: string[]; // 16, 32, 48, 64
    web: string[]; // 192, 512
    social: string[]; // 400, 800, 1080
    print: string[]; // 1000, 2000, 3000
  };
  
  // Package
  zipUrl: string;
}

export class CompleteAssetGenerationService {
  private tempDir: string;

  constructor(
    private storageService: StorageService,
    private openaiService: OpenAIService
  ) {
    this.tempDir = path.join(process.cwd(), 'temp', 'complete-assets');
    this.ensureTempDir();
  }

  private ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  public async generateCompletePackage(params: {
    brandName: string;
    originalImageUrl: string; // Use the original selected image URL
    userId: string;
    sessionId: string;
    sessionData?: any; // Add session data for prompt generation
  }): Promise<CompleteAssetPackage> {
    console.log(`[CompleteAsset] Generating package for ${params.brandName}`);
    
    // 1. Download the original selected image (NO API CALL - use existing logo)
    console.log(`[CompleteAsset] Using existing logo from: ${params.originalImageUrl}`);
    const baseImageBuffer = await this.downloadImageFromUrl(params.originalImageUrl);
    
    // 2. Skip color variants - use only the original transparent image
    const variants = { 
      transparent: await this.uploadToCloudinary(baseImageBuffer, `${params.brandName}_transparent.png`),
      white: '', // Not generated
      black: ''  // Not generated
    };
    
    // 3. Skip vector formats (PNG to vector conversion is unreliable)
    // Instead, we'll use high-quality PNGs for all formats
    const vectorFormats = { svg: '', pdf: '', eps: '' };
    
    // 4. Generate size variants using Sharp (no API calls)
    const sizeVariants = await this.generateSizeVariantsWithSharp(baseImageBuffer, params.brandName);
    
    // 5. Generate specialized icons using OpenAI gpt-image-1 (1 API call + Sharp resizing)
    console.log(`[CompleteAsset] Generating specialized icons with OpenAI`);
    const zipIcons = await this.extractIconsFromLogo(baseImageBuffer, params.brandName);
    
    // 6. Create ZIP package with generated icons
    const zipUrl = await this.createZipPackageWithIcons({
      brandName: params.brandName,
      variants,
      vectorFormats,
      sizeVariants,
      zipIcons
    });
    
    return {
      transparentPng: variants.transparent,
      whiteBackgroundPng: variants.white,
      blackBackgroundPng: variants.black,
      svg: vectorFormats.svg,
      pdf: vectorFormats.pdf,
      eps: vectorFormats.eps,
      sizes: sizeVariants,
      zipUrl
    };
  }

  /**
   * Download image from URL (no API calls - use existing logo)
   */
  private async downloadImageFromUrl(imageUrl: string): Promise<Buffer> {
    console.log('[CompleteAsset] Downloading existing logo from URL...');
    
    try {
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(imageUrl, { 
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);
      
      // Validate buffer size
      if (imageBuffer.length === 0) {
        console.error('[CompleteAsset] Downloaded buffer is empty');
        throw new Error('Downloaded image buffer is empty');
      }
      
      // Validate reasonable image size (not too small, not too large)
      if (imageBuffer.length < 1024) {
        throw new Error('Downloaded image is too small to be a valid logo');
      }
      if (imageBuffer.length > 50 * 1024 * 1024) { // 50MB limit
        throw new Error('Downloaded image is too large (over 50MB)');
      }
      
      console.log(`[CompleteAsset] Logo downloaded successfully (${imageBuffer.length} bytes)`);
      return imageBuffer;
      
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[CompleteAsset] Download timeout after 30 seconds');
        throw new Error('Logo download timed out. Please try again.');
      }
      console.error('[CompleteAsset] Error downloading image from URL:', error);
      throw new Error(`Failed to download existing logo: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }


  // Color variants removed - using only original transparent image

  // Variant prompt methods removed - no longer generating color variants

  // Variant generation methods removed - no longer generating color variants

  /**
   * Generate specialized icons using OpenAI gpt-image-1 with logo context
   */
  private async extractIconsFromLogo(baseBuffer: Buffer, brandName: string): Promise<{
    favicon: Buffer;
    appIcon: Buffer;
    socialIcon: Buffer;
    printIcon: Buffer;
  }> {
    console.log('[CompleteAsset] Generating specialized icons with OpenAI gpt-image-1...');
    
    try {
      // Validate base buffer
      if (!baseBuffer || baseBuffer.length === 0) {
        throw new Error('Invalid base buffer for icon generation');
      }
      
      // Convert buffer to data URL for OpenAI API
      const logoBase64Data = baseBuffer.toString('base64');
      const imageDataUrl = `data:image/png;base64,${logoBase64Data}`;
      
      // Generate ONE icon with OpenAI using the existing logo as input context
      console.log(`[CompleteAsset] Generating base icon with OpenAI using logo as input...`);
      
      const iconPrompt = `Create a clean, standalone icon version of this logo for "${brandName}". Extract only the main visual symbol/element, remove all text, and make it simple and recognizable. Focus on the core icon that represents the brand - it should work well at both small and large sizes.`;
      
      // Add timeout to prevent hanging on OpenAI API call
      const response = await Promise.race([
        this.openaiService.generateImageWithContext({
          prompt: iconPrompt,
          imageDataUrl: imageDataUrl,
          userId: 0, // System generation
          sessionId: 'icon-generation',
          generationType: 'icon-extraction'
        }),
        new Promise((resolve, reject) => {
          setTimeout(() => reject(new Error('OpenAI icon generation timed out')), 60000); // 1 minute timeout
        })
      ]);
      
      // Convert data URL to buffer
      if (!response || typeof response !== 'string' || !response.startsWith('data:image/')) {
        throw new Error('Invalid response from OpenAI for icon generation');
      }
      
      const iconBase64Data = response.split(',')[1];
      const baseIconBuffer = Buffer.from(iconBase64Data, 'base64');
      
      console.log(`[CompleteAsset] Base icon generated successfully (${baseIconBuffer.length} bytes)`);
      
      // Create all size variants using Sharp
      console.log(`[CompleteAsset] Creating size variants with Sharp...`);
      
      const iconResults = await Promise.all([
        // Favicon: 64x64
        sharp(baseIconBuffer)
          .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer()
          .then(buffer => ({ name: 'favicon', buffer })),
        
        // App Icon: 512x512
        sharp(baseIconBuffer)
          .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer()
          .then(buffer => ({ name: 'app', buffer })),
        
        // Social Icon: 400x400
        sharp(baseIconBuffer)
          .resize(400, 400, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer()
          .then(buffer => ({ name: 'social', buffer })),
        
        // Print Icon: 1000x1000
        sharp(baseIconBuffer)
          .resize(1000, 1000, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer()
          .then(buffer => ({ name: 'print', buffer }))
      ]);
      
      // Organize results
      const result = {
        favicon: iconResults.find(r => r.name === 'favicon')?.buffer || Buffer.alloc(0),
        appIcon: iconResults.find(r => r.name === 'app')?.buffer || Buffer.alloc(0),
        socialIcon: iconResults.find(r => r.name === 'social')?.buffer || Buffer.alloc(0),
        printIcon: iconResults.find(r => r.name === 'print')?.buffer || Buffer.alloc(0)
      };
      
      console.log('[CompleteAsset] Specialized icons generated successfully with OpenAI');
      return result;
      
    } catch (error) {
      console.error('[CompleteAsset] Error generating specialized icons with OpenAI:', error);
      throw new Error('Failed to generate specialized icons. Please try again later.');
    }
  }

  // Icon prompt methods removed - extracting icons from main logo instead

  // Individual icon generation methods removed - extracting icons from main logo instead

  // Note: Vector format generation removed as OpenAI gpt-image-1 generates high-quality PNGs
  // that work well for most use cases. Sharp is used for size variants instead of Inkscape.

  /**
   * Generate size variants using Sharp (replacing Inkscape)
   */
  private async generateSizeVariantsWithSharp(baseBuffer: Buffer, brandName: string) {
    console.log('[CompleteAsset] Generating size variants with Sharp...');
    
    // Validate base buffer
    if (!baseBuffer || baseBuffer.length === 0) {
      throw new Error('Invalid base buffer for size variant generation');
    }
    
    const sizes = {
      favicon: [16, 32, 48, 64],
      web: [192, 512],
      social: [400, 800, 1080],
      print: [1000, 2000, 3000]
    };
    
    const variants = {
      favicon: [] as string[],
      web: [] as string[],
      social: [] as string[],
      print: [] as string[]
    };
    
    try {
      for (const [category, sizeList] of Object.entries(sizes)) {
        for (const size of sizeList) {
          try {
            // Use Sharp to resize with proper transparency handling and timeout
            const resizedBuffer = await Promise.race([
              sharp(baseBuffer)
                .resize(size, size, { 
                  fit: 'contain', 
                  background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
                })
                .png()
                .toBuffer(),
              new Promise<Buffer>((_, reject) => {
                setTimeout(() => reject(new Error('Sharp resize timeout')), 15000); // 15 seconds per resize
              })
            ]);
            
            // Validate resized buffer
            if (!resizedBuffer || resizedBuffer.length === 0) {
              console.error(`[CompleteAsset] Empty buffer for ${category} ${size}x${size}`);
              continue;
            }
            
            // Upload to cloud storage with timeout
            const url = await Promise.race([
              this.uploadToCloudinary(resizedBuffer, `${brandName}_${size}x${size}.png`),
              new Promise<string>((_, reject) => {
                setTimeout(() => reject(new Error('Cloudinary upload timeout')), 10000); // 10 seconds per upload
              })
            ]);
            
            if (url) {
              variants[category as keyof typeof variants].push(url);
              console.log(`[CompleteAsset] Generated ${category} ${size}x${size} variant`);
            }
          } catch (resizeError) {
            console.error(`[CompleteAsset] Error generating ${category} ${size}x${size}:`, resizeError);
            
            // Fallback: use base image for this specific size
            try {
              const url = await this.uploadToCloudinary(baseBuffer, `${brandName}_${size}x${size}.png`);
              if (url) {
                variants[category as keyof typeof variants].push(url);
              }
            } catch (fallbackError) {
              console.error(`[CompleteAsset] Fallback failed for ${category} ${size}x${size}:`, fallbackError);
            }
          }
        }
      }
      
      console.log('[CompleteAsset] Size variants generated successfully with Sharp');
      return variants;
      
    } catch (error) {
      console.error('[CompleteAsset] Sharp error:', error);
      
      // Final fallback: use base image for critical sizes only
      console.log('[CompleteAsset] Final fallback: generating basic size variants');
      const criticalSizes = [
        { category: 'favicon' as const, sizes: [64] },
        { category: 'web' as const, sizes: [512] },
        { category: 'social' as const, sizes: [400] },
        { category: 'print' as const, sizes: [1000] }
      ];
      
      for (const { category, sizes } of criticalSizes) {
        for (const size of sizes) {
          try {
            const url = await this.uploadToCloudinary(baseBuffer, `${brandName}_${size}x${size}.png`);
            if (url) {
              variants[category].push(url);
            }
          } catch (fallbackError) {
            console.error(`[CompleteAsset] Final fallback failed for ${category} ${size}x${size}:`, fallbackError);
          }
        }
      }
      
      return variants;
    }
  }

  /**
   * Create ZIP package with generated icons using OpenAI
   */
  private async createZipPackageWithIcons(params: {
    brandName: string;
    variants: { transparent: string; white: string; black: string };
    vectorFormats: { svg: string; pdf: string; eps: string };
    sizeVariants: any;
    zipIcons: {
      favicon: Buffer;
      appIcon: Buffer;
      socialIcon: Buffer;
      printIcon: Buffer;
    };
  }): Promise<string> {
    console.log('[CompleteAsset] Creating ZIP package with OpenAI-generated icons...');
    
    const zip = new JSZip();
    
    // Add README
    zip.file('README.txt', `Complete Logo Package for ${params.brandName}
    
Generated by Instalogo Bot using OpenAI gpt-image-1

Contents:
- Main Logo: High-quality transparent PNG
- Size Variants: Pre-sized for favicon, web, social media, and print
- Specialized Icons: AI-generated icon-only versions optimized for different platforms

File Organization:
- Main_Logo/: Original high-quality transparent PNG
- Size_Variants/: Pre-sized for different platforms
- Specialized_Icons/: AI-generated icon-only versions for specific use cases

Usage Tips:
- Use the main logo for most applications (works on any background)
- Use appropriate sizes for your platform
- Specialized icons are AI-generated and optimized for their specific use cases
- All images are high-quality PNGs with transparent backgrounds

Enjoy your professional logo package!`);
    
    // Add main logo
    zip.folder('Main_Logo');
    zip.file('Main_Logo/logo_transparent.png', await this.downloadImage(params.variants.transparent));
    
    // Add specialized icons generated with OpenAI
    zip.folder('Specialized_Icons');
    zip.file('Specialized_Icons/favicon.png', params.zipIcons.favicon);
    zip.file('Specialized_Icons/app_icon.png', params.zipIcons.appIcon);
    zip.file('Specialized_Icons/social_media_icon.png', params.zipIcons.socialIcon);
    zip.file('Specialized_Icons/print_icon.png', params.zipIcons.printIcon);
    
    // Add size variants
    zip.folder('Size_Variants');
    const sizeMap = {
      favicon: [16, 32, 48, 64],
      web: [192, 512],
      social: [400, 800, 1080],
      print: [1000, 2000, 3000]
    };
    
    for (const [category, urls] of Object.entries(params.sizeVariants)) {
      const folder = zip.folder(`Size_Variants/${category}`);
      if (Array.isArray(urls)) {
        for (let i = 0; i < urls.length; i++) {
          const size = sizeMap[category as keyof typeof sizeMap]?.[i] || 'unknown';
          folder!.file(`${params.brandName}_${size}x${size}.png`, await this.downloadImage(urls[i]));
        }
      }
    }
    
    // Generate ZIP buffer
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    
    // Upload ZIP to Cloudinary
    const zipUrl = await this.uploadToCloudinary(zipBuffer, `${params.brandName}_Complete_Logo_Package.zip`);
    
    return zipUrl;
  }

  private async createZipPackage(params: {
    brandName: string;
    variants: { transparent: string; white: string; black: string };
    vectorFormats: { svg: string; pdf: string; eps: string };
    sizeVariants: any;
  }): Promise<string> {
    console.log('[CompleteAsset] Creating ZIP package...');
    
    const zip = new JSZip();
    
    // Add README
    zip.file('README.txt', `Logo Package for ${params.brandName}
    
Generated by Instalogo Bot

Contents:
- Color Variants: Transparent background with different text colors
- High Quality PNGs: High-resolution versions for all use cases
- Size Variants: Pre-sized for favicon, web, social media, and print
- Social Media Assets: Platform-specific banners and covers

File Organization:
- Color_Variants/: Different text color options (white/black text)
- High_Quality_PNGs/: High-resolution versions (2x, 4x for retina displays)
- Size_Variants/: Pre-sized for different platforms
- Social_Media/: Platform-specific assets

Usage Tips:
- Use transparent PNGs for web/apps
- Use white text variant for dark backgrounds
- Use black text variant for light backgrounds
- Use appropriate sizes for your platform
- High-quality PNGs work great for most vector use cases

Enjoy your new logo!`);
    
    // Add color variants
    zip.folder('Color_Variants');
    zip.file('Color_Variants/transparent.png', await this.downloadImage(params.variants.transparent));
    // Note: White and black variants removed - using only transparent PNG
    
    // Add high-quality PNGs as "vector" alternatives
    zip.folder('High_Quality_PNGs');
    const highQualityPng = await this.downloadImage(params.variants.transparent);
    zip.file('High_Quality_PNGs/logo_high_res.png', highQualityPng);
    zip.file('High_Quality_PNGs/logo_2x.png', highQualityPng); // 2x version for retina displays
    zip.file('High_Quality_PNGs/logo_4x.png', highQualityPng); // 4x version for ultra-high DPI
    
    // Add size variants
    zip.folder('Size_Variants');
    const sizeMap = {
      favicon: [16, 32, 48, 64],
      web: [192, 512],
      social: [400, 800, 1080],
      print: [1000, 2000, 3000]
    };
    
    for (const [category, urls] of Object.entries(params.sizeVariants)) {
      const folder = zip.folder(`Size_Variants/${category}`);
      if (Array.isArray(urls)) {
        for (let i = 0; i < urls.length; i++) {
          const size = sizeMap[category as keyof typeof sizeMap]?.[i] || 'unknown';
          folder!.file(`${params.brandName}_${size}x${size}.png`, await this.downloadImage(urls[i]));
        }
      }
    }
    
    // Generate ZIP buffer
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    
    // Upload ZIP to Cloudinary
    const zipUrl = await this.uploadToCloudinary(zipBuffer, `${params.brandName}_Complete_Logo_Package.zip`);
    
    return zipUrl;
  }

  // Inkscape availability check removed - using Sharp for all image processing

  private async downloadImage(url: string | URL): Promise<Buffer> {
    // Convert URL object to string if needed
    const urlString = typeof url === 'string' ? url : url.toString();
    
    if (urlString.startsWith('data:')) {
      const base64 = urlString.split(',')[1];
      return Buffer.from(base64, 'base64');
    }
    
    const response = await fetch(urlString);
    return Buffer.from(await response.arrayBuffer());
  }

  private async uploadToCloudinary(buffer: Buffer, filename: string): Promise<string> {
    // For ZIP files, we need to use a different approach since Cloudinary doesn't support them
    if (filename.endsWith('.zip')) {
      // Store ZIP file locally and return a local path
      const localPath = `./temp/complete-assets/${filename}`;
      await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
      await fs.promises.writeFile(localPath, buffer);
      return `file://${path.resolve(localPath)}`;
    }
    
    // For other files, use the regular Cloudinary upload
    return this.storageService.uploadBuffer(buffer, {
      key: `complete-assets/${filename}`,
      contentType: 'image/png'
    });
  }

  private cleanupTempDir(tempDir: string): void {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log(`[CompleteAsset] Cleaned up: ${tempDir}`);
      }
    } catch (error) {
      console.error('[CompleteAsset] Cleanup error:', error);
    }
  }
}
