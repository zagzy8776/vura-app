import {
  Injectable,
  NestMiddleware,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SecurityHeadersMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    // Security Headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    // Remove server information
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');

    // Prevent caching of sensitive data
    if (req.path.includes('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }

    this.logger.log(`Security headers applied for ${req.method} ${req.path}`);
    next();
  }
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimitMiddleware.name);
  private readonly requests = new Map<string, { count: number; resetTime: number }>();

  private readonly windowMs = parseInt(
    process.env.RATE_LIMIT_WINDOW_MS || '900000',
  ); // 15 minutes
  private readonly maxRequests = parseInt(
    process.env.RATE_LIMIT_MAX_REQUESTS || '100',
  );

  use(req: Request, res: Response, next: NextFunction) {
    const clientId = this.getClientId(req);
    const now = Date.now();

    // Clean up old entries periodically
    if (Math.random() < 0.01) {
      this.cleanup(now);
    }

    const clientData = this.requests.get(clientId);

    if (!clientData || now > clientData.resetTime) {
      // Reset counter for new window
      this.requests.set(clientId, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      this.setRateLimitHeaders(res, this.maxRequests - 1, this.windowMs);
      return next();
    }

    if (clientData.count >= this.maxRequests) {
      this.logger.warn(`Rate limit exceeded for ${clientId}`);
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil(clientData.resetTime / 1000),
      });
    }

    clientData.count++;
    this.setRateLimitHeaders(
      res,
      this.maxRequests - clientData.count,
      clientData.resetTime - now,
    );

    next();
  }

  private getClientId(req: Request): string {
    // Use IP + User-Agent for better identification
    const ip = this.getRealIP(req);
    const userAgent = req.get('User-Agent') || 'unknown';
    return `${ip}:${userAgent}`;
  }

  private getRealIP(req: Request): string {
    // Check for forwarded headers first
    return (
      req.get('X-Forwarded-For') ||
      req.get('X-Real-IP') ||
      req.get('CF-Connecting-IP') ||
      req.ip ||
      req.connection.remoteAddress ||
      'unknown'
    );
  }

  private setRateLimitHeaders(
    res: Response,
    remaining: number,
    resetTime: number,
  ) {
    res.setHeader('X-RateLimit-Limit', this.maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining));
    res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime / 1000));
    res.setHeader('X-RateLimit-Window', this.windowMs);
  }

  private cleanup(now: number) {
    for (const [clientId, data] of this.requests.entries()) {
      if (now > data.resetTime) {
        this.requests.delete(clientId);
      }
    }
  }
}

@Injectable()
export class SessionTimeoutMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SessionTimeoutMiddleware.name);
  private readonly timeoutMinutes = parseInt(
    process.env.SESSION_TIMEOUT_MINUTES || '15',
  );

  use(req: Request, res: Response, next: NextFunction) {
    // Skip for public endpoints
    if (this.isPublicEndpoint(req.path)) {
      return next();
    }

    // Check if user has valid session
    const authHeader = req.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Let auth guard handle missing tokens
    }

    // For now, just log session activity
    // In production, you'd check session store for last activity
    this.logger.debug(`Session activity: ${req.path}`);

    next();
  }

  private isPublicEndpoint(path: string): boolean {
    const publicPaths = [
      '/api/auth/login',
      '/api/auth/register',
      '/api/auth/refresh',
      '/api/auth/verify-otp',
      '/api/auth/forgot-password',
      '/api/auth/reset-password',
      '/api/health',
      '/api/docs',
    ];

    return publicPaths.some((publicPath) => path.startsWith(publicPath));
  }
}

@Injectable()
export class HTTPSRedirectMiddleware implements NestMiddleware {
  private readonly logger = new Logger(HTTPSRedirectMiddleware.name);
  private readonly enforceHTTPS = process.env.ENFORCE_HTTPS === 'true';

  use(req: Request, res: Response, next: NextFunction) {
    if (!this.enforceHTTPS) {
      return next();
    }

    // Check if request is already HTTPS
    if (req.secure) {
      return next();
    }

    // Check for forwarded protocol
    const forwardedProto = req.get('X-Forwarded-Proto');
    if (forwardedProto === 'https') {
      return next();
    }

    // Redirect to HTTPS
    const host = req.get('Host') || 'localhost';
    const httpsUrl = `https://${host}${req.originalUrl}`;

    this.logger.warn(`HTTP request redirected to HTTPS: ${req.originalUrl}`);
    res.redirect(301, httpsUrl);
  }
}

@Injectable()
export class CSRFProtectionMiddleware implements NestMiddleware {
  private readonly logger = new Logger(CSRFProtectionMiddleware.name);
  private readonly csrfTokens = new Map<string, string>();

  use(req: Request, res: Response, next: NextFunction) {
    // Skip for GET, HEAD, OPTIONS requests
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    // Skip for API endpoints (assuming they use proper authentication)
    if (req.path.startsWith('/api/')) {
      return next();
    }

    // For form submissions, check CSRF token
    const token = req.get('X-CSRF-Token') || (req.body as any)._csrf;
    const clientId = this.getClientId(req);

    if (!token || !this.validateCSRFToken(clientId, token)) {
      this.logger.warn(`CSRF token validation failed for ${clientId}`);
      throw new BadRequestException('Invalid CSRF token');
    }

    next();
  }

  private getClientId(req: Request): string {
    const ip = req.get('X-Forwarded-For') || req.ip || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';
    return `${ip}:${userAgent}`;
  }

  private validateCSRFToken(clientId: string, token: string): boolean {
    const storedToken = this.csrfTokens.get(clientId);
    return storedToken === token;
  }

  // Method to generate CSRF tokens (for frontend)
  generateCSRFToken(clientId: string): string {
    const token =
      Math.random().toString(36).substring(2) + Date.now().toString(36);
    this.csrfTokens.set(clientId, token);
    return token;
  }
}
