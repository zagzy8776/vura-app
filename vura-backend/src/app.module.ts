import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
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
import { CardsModule } from './cards/cards.module';
import { BankAccountsModule } from './bank-accounts/bank-accounts.module';
import { QrCodesModule } from './qr-codes/qr-codes.module';
import { PaymentRequestsModule } from './payment-requests/payment-requests.module';
import { BankCodesModule } from './bank-codes/bank-codes.module';
import { PaystackService } from './services/paystack.service';
import { MonnifyService } from './services/monnify.service';
import { BankCodesService } from './services/bank-codes.service';


@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
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
    CardsModule,
    BankAccountsModule,
    QrCodesModule,
    PaymentRequestsModule,
    BankCodesModule,
  ],

  controllers: [AppController, TransactionsController],
  providers: [
    AppService,
    PrismaService,
    TransactionsService,
    PaystackService,
    MonnifyService,
    BankCodesService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
