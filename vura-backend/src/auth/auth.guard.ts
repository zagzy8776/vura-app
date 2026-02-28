import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AuthGuard implements CanActivate {
  private getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error(
        'JWT_SECRET environment variable must be at least 32 characters',
      );
    }
    return secret;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('No token provided');
    }

    const token = authHeader.split(' ')[1];

    try {
      const secret = this.getJwtSecret();
      const decoded = jwt.verify(token, secret);
      request.user = decoded;
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
