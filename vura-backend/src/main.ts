import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // Required for webhook signature verification
  });

  const isProduction = process.env.NODE_ENV === 'production';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  // Trust proxy for Render.com (required for rate limiting to work correctly)
  if (isProduction) {
    app.set('trust proxy', 1);
  }

  // Security: HTTP headers protection
  app.use(
    helmet({
      contentSecurityPolicy: isProduction ? undefined : false,
      crossOriginEmbedderPolicy: isProduction ? undefined : false,
    }),
  );

  // Enable CORS for frontend communication
  // ✅ Updated with Vercel frontend and Render backend support
  app.enableCors({
    origin: isProduction
      ? [
          frontendUrl,
          'https://vura-app.vercel.app',
          'https://www.vura-app.vercel.app',
          // Render backend URL (if needed for webhooks)
          'https://vura-app.onrender.com',
          'https://*.onrender.com',
          // Custom domain
          'https://www.vura-bank.com.ng',
          'https://vura-bank.com.ng',
        ]
      : [
          'http://localhost:8080',
          'http://localhost:8081',
          'http://localhost:5173',
          'http://localhost:8087',
          'https://vura-app.vercel.app', // Allow Vercel in dev too
        ],

    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Device-Fingerprint',
      // Paystack webhook headers
      'x-paystack-signature',
    ],
  });

  // Security: Global input validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false, // Set to false to allow extra fields (debug mode)
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Security: Disable server banner
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`🚀 Vura API running on port ${port}`);
  console.log(`📦 Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
}

bootstrap();
