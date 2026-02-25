import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { OTPService } from '../otp/otp.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, OTPService, AuthGuard, PrismaService],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
