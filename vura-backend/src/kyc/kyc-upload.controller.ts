import {
  Controller,
  Post,
  UseGuards,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Request,
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
    @Request() req: { user?: { userId?: string } },
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

      const userId = req.user?.userId;
      if (!userId) {
        throw new BadRequestException('Unauthorized');
      }

      // Attach to authenticated user and mark as pending review (Tier 3 flow)
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          idCardUrl: result.url,
          idType,
          // keep selfieUrl as-is if already uploaded
          kycStatus: 'PENDING',
        },
      });

      return {
        success: true,
        url: result.url,
        fileName: result.publicId,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      throw new BadRequestException(`Upload failed: ${message}`);
    }
  }

  @Post('upload-selfie')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file'))
  async uploadSelfie(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user?: { userId?: string } },
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

      const userId = req.user?.userId;
      if (!userId) {
        throw new BadRequestException('Unauthorized');
      }

      // Attach to authenticated user and mark as pending review (Tier 3 flow)
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          selfieUrl: result.url,
          // keep idCardUrl/idType as-is if already uploaded
          kycStatus: 'PENDING',
        },
      });

      return {
        success: true,
        url: result.url,
        fileName: result.publicId,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      throw new BadRequestException(`Upload failed: ${message}`);
    }
  }

  @Post('submit-kyc')
  @UseGuards(AuthGuard('jwt'))
  async submitKYC(
    @Body() body: { idCardUrl: string; selfieUrl: string; idType: string },
    @Request() req: { user?: { userId?: string } },
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

    const userId = req.user?.userId;
    if (!userId) {
      throw new BadRequestException('Unauthorized');
    }

    // Persist submitted KYC payload to authenticated user
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        idCardUrl,
        selfieUrl,
        idType,
        kycStatus: 'PENDING',
      },
    });

    return {
      success: true,
      message: 'KYC documents submitted for review',
      status: 'PENDING',
    };
  }
}
