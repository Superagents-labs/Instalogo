import { S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import fetch from 'node-fetch';
import { StorageOptions, BrandingGuideDetails } from '../types';

/**
 * Service for S3-compatible storage operations using LocalStack
 */
export class StorageService {
  private s3: S3Client;
  private readonly bucketName: string;
  private readonly endpoint: string;

  /**
   * Initialize S3 client with LocalStack endpoint
   */
  constructor() {
    // LocalStack endpoint
    this.endpoint = 'http://localhost:4566';
    this.s3 = new S3Client({
      endpoint: this.endpoint,
      forcePathStyle: true,
      region: 'us-east-1',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });
    this.bucketName = process.env.S3_BUCKET_NAME || 'local-bucket';
  }

  /**
   * Upload a file to LocalStack S3 from a URL
   */
  public async uploadFromUrl(
    url: string, 
    options: Partial<StorageOptions> = {}
  ): Promise<string> {
    try {
      // Fetch the image from the URL
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch image from URL: ${response.statusText}`);
      }
      // Get the image buffer
      const buffer = await response.buffer();
      // Generate a unique key if not provided
      const key = options.key || `logos/${Date.now()}-${Math.random().toString(36).substring(2, 15)}.png`;
      // Set default content type if not provided
      const contentType = options.contentType || 'image/png';
      // Upload to LocalStack S3
      const params = {
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ACL: 'public-read' as const,
      };
      await this.s3.send(new PutObjectCommand(params));
      // Return the LocalStack S3 URL
      return `${this.endpoint}/${this.bucketName}/${key}`;
    } catch (error) {
      console.error('Error uploading file to LocalStack S3:', error);
      throw new Error('Failed to store logo in storage');
    }
  }

  /**
   * Upload a buffer directly to LocalStack S3
   */
  public async uploadBuffer(
    buffer: Buffer, 
    options: Partial<StorageOptions> = {}
  ): Promise<string> {
    try {
      // Generate a unique key if not provided
      const key = options.key || `logos/${Date.now()}-${Math.random().toString(36).substring(2, 15)}.png`;
      // Set default content type if not provided
      const contentType = options.contentType || 'image/png';
      // Upload to LocalStack S3
      const params = {
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ACL: 'public-read' as const,
      };
      await this.s3.send(new PutObjectCommand(params));
      // Return the LocalStack S3 URL
      return `${this.endpoint}/${this.bucketName}/${key}`;
    } catch (error) {
      console.error('Error uploading buffer to LocalStack S3:', error);
      throw new Error('Failed to store logo in storage');
    }
  }

  /**
   * Generate and upload a branding guide to LocalStack
   */
  public async generateBrandingGuide(details: BrandingGuideDetails): Promise<string> {
    try {
      const guideName = `${details.businessName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-brand-guide`;
      const key = `guides/${guideName}-${Date.now()}.json`;
      const params = {
        Bucket: this.bucketName,
        Key: key,
        Body: JSON.stringify(details, null, 2),
        ContentType: 'application/json',
        ACL: 'public-read' as const,
      };
      await this.s3.send(new PutObjectCommand(params));
      return `${this.endpoint}/${this.bucketName}/${key}`;
    } catch (error) {
      console.error('Error generating branding guide:', error);
      throw new Error('Failed to generate branding guide');
    }
  }

  /**
   * Check if the bucket exists, create it if it doesn't
   */
  public async ensureBucketExists(): Promise<void> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucketName }));
      console.log(`Bucket ${this.bucketName} exists in LocalStack`);
    } catch (error: any) {
      console.error('Error checking bucket in LocalStack:', error);
      if (error && error.$metadata && error.$metadata.httpStatusCode === 404) {
        console.log(`Bucket ${this.bucketName} does not exist, creating in LocalStack...`);
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucketName }));
        console.log(`Bucket ${this.bucketName} created successfully in LocalStack`);
      } else {
        throw new Error('Failed to check or create S3 bucket in LocalStack');
      }
    }
  }
} 