import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  isConfigured: boolean = false;

  constructor(private configService: ConfigService) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
      });
      this.isConfigured = true;
      this.logger.log('Cloudinary client initialized');
    } else {
      // Try CLOUDINARY_URL
      const cloudinaryUrl = this.configService.get<string>('CLOUDINARY_URL');
      if (cloudinaryUrl) {
        cloudinary.config({
          secure: true,
        });
        this.isConfigured = true;
        this.logger.log('Cloudinary client initialized via CLOUDINARY_URL');
      } else {
        this.logger.warn('Cloudinary not configured - KYC uploads will fail');
      }
    }
  }

  /**
   * Upload file to Cloudinary
   */
  async uploadImage(
    fileBuffer: Buffer,
    fileName: string,
    folder: string,
    mimetype: string,
  ): Promise<{ url: string; publicId: string }> {
    if (!this.isConfigured) {
      throw new BadRequestException(
        'Image upload service not configured. Please contact support.',
      );
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `vura/${folder}`,
          public_id: fileName.replace(/\.[^/.]+$/, ''),
          resource_type: 'image',
          transformation: [
            { width: 2000, height: 2000, crop: 'limit' },
            { quality: 'auto:good' },
            { fetch_format: 'auto' },
          ],
        },
        (error, result) => {
          if (error) {
            this.logger.error('Cloudinary upload error:', error);
            reject(
              new BadRequestException(`Upload failed: ${error.message}`),
            );
          } else {
            resolve({
              url: result?.secure_url || '',
              publicId: result?.public_id || '',
            });
          }
        },
      );

      uploadStream.end(fileBuffer);
    });
  }

  /**
   * Delete image from Cloudinary
   */
  async deleteImage(publicId: string): Promise<void> {
    if (!this.isConfigured) {
      return;
    }

    try {
      await cloudinary.uploader.destroy(publicId);
      this.logger.log(`Deleted image: ${publicId}`);
    } catch (error) {
      this.logger.error('Cloudinary delete error:', error);
    }
  }
}
