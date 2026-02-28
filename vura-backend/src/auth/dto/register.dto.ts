import {
  IsString,
  IsNotEmpty,
  MinLength,
  Matches,
  IsEmail,
  IsOptional,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^(\+234|0)[789]\d{9}$/, {
    message:
      'Phone number must be a valid Nigerian number (e.g., +2348012345678 or 08012345678)',
  })
  phone: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  pin: string;

  @IsString()
  @IsNotEmpty()
  vuraTag: string;
}
