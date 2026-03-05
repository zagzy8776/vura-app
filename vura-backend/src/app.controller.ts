import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

// NOTE: Global prefix 'api' is already set in main.ts
// Do NOT add @Controller('api') here to avoid duplicate /api/api/ prefix
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('test')
  getHello(): string {
    return this.appService.getHello();
  }
}
