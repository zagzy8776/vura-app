import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CryptoController } from './crypto.controller';
import { CoinGeckoService } from './coingecko.service';
import { BlockchainMonitorService } from './blockchain-monitor.service';
import { DepositMonitorCron } from './deposit-monitor.cron';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [ConfigModule, ScheduleModule.forRoot()],
  controllers: [CryptoController],
  providers: [
    CoinGeckoService,
    BlockchainMonitorService,
    DepositMonitorCron,
    PrismaService,
  ],
  exports: [CoinGeckoService, BlockchainMonitorService],
})
export class CryptoModule {}
