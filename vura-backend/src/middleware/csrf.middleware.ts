// vura-backend/src/middleware/csrf.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

const csrf = require('csurf');

@Injectable()
export class CSRFMiddleware implements NestMiddleware {
  private csrfProtection = csrf({
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  });

  use(req: Request, res: Response, next: NextFunction) {
    this.csrfProtection(req, res, (err: any) => {
      if (err) {
        console.error('CSRF token validation failed:', err);
        return res.status(403).json({
          error: 'Invalid CSRF token',
          message: 'Please refresh the page and try again',
        });
      }
      next();
    });
  }
}

// CSRF token generator for frontend
export const generateCSRFToken = (req: Request): string => {
  return (req as any).csrfToken();
};

// CSRF token validation middleware
export const validateCSRFToken = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token =
    req.headers['x-csrf-token'] || req.body._csrf || (req.query as any)._csrf;

  if (!token) {
    return res.status(403).json({
      error: 'CSRF token missing',
      message: 'Please include a valid CSRF token',
    });
  }

  // The csrf middleware will handle token validation
  next();
};
