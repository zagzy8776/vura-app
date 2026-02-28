import {
  Controller,
  Post,
  UseGuards,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { CloudinaryService } from '../services/cloudinary.service';

@Controller('kyc')
export class KYCUploadController {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private cloudinary: CloudinaryService,
  ) {}

  @Post('upload-id')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file'))
  async uploadIdCard(
    @UploadedFile() file: Express.Multer.File,
    @Body('idType') idType: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only JPEG, PNG and WebP are allowed.',
      );
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('File too large. Maximum size is 10MB.');
    }

    // Validate ID type
    const validIdTypes = [
      'nin',
      'drivers_license',
      'voters_card',
      'intl_passport',
    ];
    if (!validIdTypes.includes(idType)) {
      throw new BadRequestException('Invalid ID type');
    }

    // Check if Cloudinary is configured
    if (!this.cloudinary.isConfigured) {
      throw new BadRequestException(
        'Image upload service not configured. Please contact support.',
      );
    }

    // Upload to Cloudinary
    const folder = 'kyc/id-cards';
    const fileName = `${Date.now()}-${file.originalname}`;

    try {
      const result = await this.cloudinary.uploadImage(
        file.buffer,
        fileName,
        folder,
        file.mimetype,
      );

      return {
        success: true,
        url: result.url,
        fileName: result.publicId,
      };
    } catch (error) {
      throw new BadRequestException(`Upload failed: ${error.message}`);
    }
  }

  @Post('upload-selfie')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file'))
  async uploadSelfie(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only JPEG, PNG and WebP are allowed.',
      );
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('File too large. Maximum size is 10MB.');
    }

    // Check if Cloudinary is configured
    if (!this.cloudinary.isConfigured) {
      throw new BadRequestException(
        'Image upload service not configured. Please contact support.',
      );
    }

    // Upload to Cloudinary
    const folder = 'kyc/selfies';
    const fileName = `${Date.now()}-${file.originalname}`;

    try {
      const result = await this.cloudinary.uploadImage(
        file.buffer,
        fileName,
        folder,
        file.mimetype,
      );

      return {
        success: true,
        url: result.url,
        fileName: result.publicId,
      };
    } catch (error) {
      throw new BadRequestException(`Upload failed: ${error.message}`);
    }
  }

  @Post('submit-kyc')
  @UseGuards(AuthGuard('jwt'))
  async submitKYC(
    @Body() body: { idCardUrl: string; selfieUrl: string; idType: string },
  ) {
    const { idCardUrl, selfieUrl, idType } = body;

    // Validate URLs are provided
    if (!idCardUrl || !selfieUrl) {
      throw new BadRequestException(
        'Both ID card and selfie URLs are required',
      );
    }

    // Validate ID type
    const validIdTypes = [
      'nin',
      'drivers_license',
      'voters_card',
      'intl_passport',
    ];
    if (!validIdTypes.includes(idType)) {
      throw new BadRequestException('Invalid ID type');
    }

    // Update user record with KYC details
    // Note: userId would come from the JWT token in a real implementation
    // For now, this is a placeholder

    return {
      success: true,
      message: 'KYC documents submitted for review',
      status: 'PENDING',
    };
  }
}
