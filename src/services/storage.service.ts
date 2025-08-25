import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import fetch from 'node-fetch';
import { StorageOptions, BrandingGuideDetails } from '../types';

/**
 * Service for cloud storage operations using Cloudinary
 * Maintains same interface as S3StorageService for seamless migration
 */
export class StorageService {
  /**
   * Initialize Cloudinary with environment variables
   */
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    // Validate configuration
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.warn('⚠️ Cloudinary configuration missing. Check environment variables.');
    } else {
      console.log('✅ Cloudinary Storage Service initialized');
    }
  }

  /**
   * Upload a file to Cloudinary from a URL
   * @param url - Source image URL
   * @param options - Upload options (key becomes public_id in Cloudinary)
   * @returns Cloudinary secure URL
   */
  public async uploadFromUrl(
    url: string, 
    options: Partial<StorageOptions> = {}
  ): Promise<string> {
    try {
      // Generate public_id from key or create unique one
      const publicId = this.generatePublicId(options.key);
      
      // Upload to Cloudinary with transformations
      const result: UploadApiResponse = await cloudinary.uploader.upload(url, {
        public_id: publicId,
        folder: this.getFolderFromKey(options.key),
        resource_type: 'image',
        format: 'png', // Consistent format
        transformation: [
          { quality: 'auto:good' }, // Auto optimization
          { fetch_format: 'auto' }   // Auto format delivery
        ]
      });

      console.log(`[Cloudinary] ✅ Uploaded from URL: ${result.secure_url}`);
      return result.secure_url;
    } catch (error) {
      console.error('❌ Error uploading file to Cloudinary:', error);
      throw new Error('Failed to store image in Cloudinary');
    }
  }

  /**
   * Upload a buffer directly to Cloudinary
   * @param buffer - Image buffer
   * @param options - Upload options
   * @returns Cloudinary secure URL
   */
  public async uploadBuffer(
    buffer: Buffer, 
    options: Partial<StorageOptions> = {}
  ): Promise<string> {
    try {
      const publicId = this.generatePublicId(options.key);
      
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            public_id: publicId,
            folder: this.getFolderFromKey(options.key),
            resource_type: 'image',
            format: 'png',
            transformation: [
              { quality: 'auto:good' },
              { fetch_format: 'auto' }
            ]
          },
          (error, result) => {
            if (error) {
              console.error('❌ Error uploading buffer to Cloudinary:', error);
              reject(new Error('Failed to store image in Cloudinary'));
            } else if (result) {
              console.log(`[Cloudinary] ✅ Uploaded buffer: ${result.secure_url}`);
              resolve(result.secure_url);
            } else {
              reject(new Error('No result from Cloudinary upload'));
            }
          }
        );
        
        uploadStream.end(buffer);
      });
    } catch (error) {
      console.error('❌ Error uploading buffer to Cloudinary:', error);
      throw new Error('Failed to store image in Cloudinary');
    }
  }

  /**
   * Generate and upload a branding guide to Cloudinary
   * @param details - Branding guide details
   * @returns Cloudinary secure URL for the JSON file
   */
  public async generateBrandingGuide(details: BrandingGuideDetails): Promise<string> {
    try {
      const guideName = `${details.businessName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-brand-guide`;
      const publicId = `guides/${guideName}-${Date.now()}`;
      
      // Upload JSON as raw resource
      const result: UploadApiResponse = await cloudinary.uploader.upload(
        `data:application/json;base64,${Buffer.from(JSON.stringify(details, null, 2)).toString('base64')}`,
        {
          public_id: publicId,
          resource_type: 'raw' // For non-image files
        }
      );

      console.log(`[Cloudinary] ✅ Uploaded branding guide: ${result.secure_url}`);
      return result.secure_url;
    } catch (error) {
      console.error('❌ Error generating branding guide in Cloudinary:', error);
      throw new Error('Failed to generate branding guide');
    }
  }

  /**
   * Check if Cloudinary is configured properly (replaces ensureBucketExists)
   * @returns Promise<void>
   */
  public async ensureBucketExists(): Promise<void> {
    try {
      // Test Cloudinary connection by fetching account details
      await cloudinary.api.ping();
      console.log('✅ Cloudinary connection verified and ready');
    } catch (error) {
      console.error('❌ Cloudinary connection failed:', error);
      throw new Error('Failed to connect to Cloudinary. Check your credentials.');
    }
  }

  /**
   * Generate a unique public_id from key or create one
   * @param key - Original key (can be undefined)
   * @returns Clean public_id for Cloudinary
   */
  private generatePublicId(key?: string): string {
    if (key) {
      // Remove file extension and clean the key
      return key.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9\-_\/]/g, '-');
    }
    
    // Generate unique ID if no key provided
    return `image-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Extract folder from key for Cloudinary organization
   * @param key - File key (e.g., "logos/company-logo.png")
   * @returns Folder name for Cloudinary
   */
  private getFolderFromKey(key?: string): string {
    if (!key) return 'misc';
    
    const parts = key.split('/');
    return parts.length > 1 ? parts[0] : 'misc';
  }

  /**
   * Get optimized URL with transformations
   * @param publicId - Cloudinary public ID
   * @param transformations - Additional transformations
   * @returns Optimized Cloudinary URL
   */
  public getOptimizedUrl(publicId: string, transformations?: any[]): string {
    return cloudinary.url(publicId, {
      transformation: [
        { quality: 'auto:good' },
        { fetch_format: 'auto' },
        ...(transformations || [])
      ]
    });
  }
}