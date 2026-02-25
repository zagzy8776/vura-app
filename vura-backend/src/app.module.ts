import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';
import { AuthModule } from './auth/auth.module';
import { TransactionsController } from './transactions/transactions.controller';
import { TransactionsService } from './transactions/transactions.service';
import { CryptoModule } from './crypto/crypto.module';
import { LimitsModule } from './limits/limits.module';
import { HoldsModule } from './holds/holds.module';
import { EWSModule } from './ews/ews.module';
import { ReportsModule } from './reports/reports.module';
import { KYCModule } from './kyc/kyc.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { BeneficiariesModule } from './beneficiaries/beneficiaries.module';
import { BillsModule } from './bills/bills.module';




@Module({






  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
    AuthModule,
    CryptoModule,
    LimitsModule,
    HoldsModule,
    EWSModule,
    ReportsModule,
    KYCModule,
    ReceiptsModule,
    BeneficiariesModule,
    BillsModule,
  ],









  controllers: [AppController, TransactionsController],
  providers: [
    AppService,
    PrismaService,
    TransactionsService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],

})
export class AppModule {}
