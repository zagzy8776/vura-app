import { IsString, IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'Vura tag is required' })
  vuraTag: string;

  @IsString()
  @IsNotEmpty({ message: 'PIN is required' })
  @MinLength(4, { message: 'PIN must be at least 4 digits' })
  pin: string;

  @IsOptional()
  @IsString()
  deviceFingerprint?: string;
}
