import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  vuraTag: string;

  @IsString()
  @IsNotEmpty()
  pin: string;

  @IsOptional()
  @IsString()
  deviceFingerprint?: string;
}
