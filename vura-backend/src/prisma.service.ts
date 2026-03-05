import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly maxRetries = 5;
  private readonly retryDelay = 3000;

  constructor() {
    const isProduction = process.env.NODE_ENV === 'production';
    const logLevels: Prisma.LogLevel[] = isProduction
      ? ['error']
      : ['error', 'warn'];

    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      log: logLevels,
    });
  }

  async onModuleInit() {
    await this.connectWithRetry();
  }

  private async connectWithRetry(): Promise<void> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.log(
          `Database connection attempt ${attempt}/${this.maxRetries}...`,
        );
        await this.$connect();
        this.logger.log('Database connected successfully');
        return;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          `Database connection attempt ${attempt} failed: ${errorMessage}`,
        );
        if (attempt < this.maxRetries) {
          this.logger.log(
            `Retrying in ${this.retryDelay / 1000} seconds...`,
          );
          await new Promise((resolve) => setTimeout(resolve, this.retryDelay));
        }
      }
    }
    this.logger.error('Database connection failed after all retries');
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
      this.logger.log('Database disconnected successfully');
    } catch {
      this.logger.warn('Error during database disconnect');
    }
  }

  // Helper method to check connection health
  async checkHealth(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

