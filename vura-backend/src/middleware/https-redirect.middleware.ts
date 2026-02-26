// vura-backend/src/middleware/https-redirect.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class HTTPSRedirectMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Skip redirect for development or when already HTTPS
    if (
      process.env.NODE_ENV !== 'production' ||
      req.secure ||
      req.headers['x-forwarded-proto'] === 'https'
    ) {
      return next();
    }

    // Redirect to HTTPS
    const host = req.get('Host');
    const httpsUrl = `https://${host}${req.originalUrl}`;

    console.log(`Redirecting HTTP to HTTPS: ${req.originalUrl} -> ${httpsUrl}`);

    return res.redirect(301, httpsUrl);
  }
}
