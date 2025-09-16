import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import fetch from 'node-fetch';
import { StorageOptions, BrandingGuideDetails } from '../types';

/**
 * Service for Cloudinary storage operations
 */
export class StorageService {
  constructor() {
    // Configure Cloudinary
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  /**
   * Upload a file to Cloudinary from a URL
   */
  public async uploadFromUrl(
    url: string, 
    options: Partial<StorageOptions> = {}
  ): Promise<string> {
    try {
      const folder = (options as any).folder || 'logos';
      const result: UploadApiResponse = await cloudinary.uploader.upload(url, {
        folder,
        resource_type: 'image',
        format: 'png',
        public_id: options.key,
      });
      return result.secure_url;
    } catch (error) {
      console.error('Error uploading file to Cloudinary:', error);
      throw new Error('Failed to store logo in storage');
    }
  }

  /**
   * Upload a buffer directly to Cloudinary
   */
  public async uploadBuffer(
    buffer: Buffer, 
    options: Partial<StorageOptions> = {}
  ): Promise<string> {
    try {
      const folder = (options as any).folder || 'logos';
      const result: UploadApiResponse = await cloudinary.uploader.upload(
        `data:image/png;base64,${buffer.toString('base64')}`,
        {
          folder,
          resource_type: 'image',
          format: 'png',
          public_id: options.key,
        }
      );
      return result.secure_url;
    } catch (error) {
      console.error('Error uploading buffer to Cloudinary:', error);
      throw new Error('Failed to store logo in storage');
    }
  }

  /**
   * Generate and upload a branding guide to Cloudinary
   */
  public async generateBrandingGuide(details: BrandingGuideDetails): Promise<string> {
    try {
      const guideName = `${details.businessName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-brand-guide`;
      const result: UploadApiResponse = await cloudinary.uploader.upload(
        `data:application/json;base64,${Buffer.from(JSON.stringify(details, null, 2)).toString('base64')}`,
        {
          folder: 'guides',
          resource_type: 'raw',
          public_id: `${guideName}-${Date.now()}`,
          format: 'json',
        }
      );
      return result.secure_url;
    } catch (error) {
      console.error('Error generating branding guide:', error);
      throw new Error('Failed to generate branding guide');
    }
  }

  /**
   * Verify Cloudinary connection
   */
  public async ensureBucketExists(): Promise<void> {
    try {
      await cloudinary.api.ping();
      console.log('✅ Cloudinary connection verified and ready');
    } catch (error) {
      console.error('❌ Cloudinary connection failed:', error);
      throw new Error('Failed to connect to Cloudinary');
    }
  }
} 