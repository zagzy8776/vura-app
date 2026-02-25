import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from './auth.guard';
import { OTPService } from '../otp/otp.service';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private otpService: OTPService,
  ) {}


  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 attempts per 15 minutes
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }


  @UseGuards(AuthGuard)
  @Get('profile')
  getProfile(@Request() req: any) {
    return this.authService.getProfile(req.user.userId);
  }

  // Forgot PIN - Request OTP
  @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 attempts per hour
  @Post('forgot-pin')
  async forgotPin(@Body() body: { vuraTag: string }) {
    const user = await this.authService.findByVuraTag(body.vuraTag);
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    const otp = await this.otpService.createOTP(user.id, 'pin_reset');
    
    // TODO: Send OTP via SMS
    // For development, return OTP in response
    return {
      success: true,
      message: 'OTP sent to your registered phone',
      // Remove in production
      devOtp: otp,
    };
  }

  // Verify OTP and reset PIN
  @Post('reset-pin')
  async resetPin(
    @Body() body: { vuraTag: string; otp: string; newPin: string },
  ) {
    const user = await this.authService.findByVuraTag(body.vuraTag);
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    const isValid = await this.otpService.verifyOTP(
      user.id,
      body.otp,
      'pin_reset',
    );
    if (!isValid) {
      return { success: false, message: 'Invalid or expired OTP' };
    }

    // Reset PIN
    await this.authService.resetPin(user.id, body.newPin);

    // Invalidate all sessions
    await this.authService.revokeAllUserSessions(user.id);

    return {
      success: true,
      message: 'PIN reset successfully. Please login again.',
    };
  }
}
