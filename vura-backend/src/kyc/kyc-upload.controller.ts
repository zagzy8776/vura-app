import { Controller, Post, UseGuards, Body, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { SupabaseService } from '../services/supabase.service';

@Controller('kyc')
export class KYCUploadController {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private supabase: SupabaseService,
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
      throw new BadRequestException('Invalid file type. Only JPEG, PNG and WebP are allowed.');
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('File too large. Maximum size is 10MB.');
    }

    // Validate ID type
    const validIdTypes = ['nin', 'drivers_license', 'voters_card', 'intl_passport'];
    if (!validIdTypes.includes(idType)) {
      throw new BadRequestException('Invalid ID type');
    }

    // Check if Supabase is configured
    if (!this.supabase.isConfigured || !this.supabase.client) {
      throw new BadRequestException('Storage service not configured. Please contact support.');
    }

    // Upload to Supabase Storage
    const bucket = 'kyc-images';
    const folder = 'id-cards';
    const fileName = `${folder}/${Date.now()}-${file.originalname}`;

    const { data, error } = await this.supabase.client.storage
      .from(bucket)
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw new BadRequestException(`Upload failed: ${error.message}`);
    }

    // Get public URL
    const { data: urlData } = this.supabase.client.storage
      .from(bucket)
      .getPublicUrl(fileName);

    return {
      success: true,
      url: urlData.publicUrl,
      fileName,
    };
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
      throw new BadRequestException('Invalid file type. Only JPEG, PNG and WebP are allowed.');
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('File too large. Maximum size is 10MB.');
    }

    // Check if Supabase is configured
    if (!this.supabase.isConfigured || !this.supabase.client) {
      throw new BadRequestException('Storage service not configured. Please contact support.');
    }

    // Upload to Supabase Storage
    const bucket = 'kyc-images';
    const folder = 'selfies';
    const fileName = `${folder}/${Date.now()}-${file.originalname}`;

    const { data, error } = await this.supabase.client.storage
      .from(bucket)
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw new BadRequestException(`Upload failed: ${error.message}`);
    }

    // Get public URL
    const { data: urlData } = this.supabase.client.storage
      .from(bucket)
      .getPublicUrl(fileName);

    return {
      success: true,
      url: urlData.publicUrl,
      fileName,
    };
  }

  @Post('submit-kyc')
  @UseGuards(AuthGuard('jwt'))
  async submitKYC(
    @Body() body: { idCardUrl: string; selfieUrl: string; idType: string },
  ) {
    const { idCardUrl, selfieUrl, idType } = body;

    // Validate URLs are provided
    if (!idCardUrl || !selfieUrl) {
      throw new BadRequestException('Both ID card and selfie URLs are required');
    }

    // Validate ID type
    const validIdTypes = ['nin', 'drivers_license', 'voters_card', 'intl_passport'];
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
