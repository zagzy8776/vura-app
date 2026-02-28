import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly maxRetries = 5;
  private readonly retryDelay = 3000;

  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      // Neon requires connection pooling settings
      log: ['error', 'warn'],
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
        this.logger.warn(
          `Database connection attempt ${attempt} failed: ${error.message}`,
        );
        if (attempt < this.maxRetries) {
          this.logger.log(`Retrying in ${this.retryDelay / 1000} seconds...`);
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
    } catch (error) {
      this.logger.warn('Error during database disconnect');
    }
  }
}
