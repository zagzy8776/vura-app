import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';
import { AuthModule } from './auth/auth.module';
import { OTPModule } from './otp/otp.module';
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
import { BankCodesService } from './services/bank-codes.service';
import { FlutterwaveService } from './services/flutterwave.service';
import { CloudinaryService } from './services/cloudinary.service';
import { EmailService } from './services/email.service';
import { AccountLockoutService } from './services/account-lockout.service';
import { FlutterwaveWebhookController } from './webhooks/flutterwave.webhook.controller';
import { AdminController } from './admin/admin.controller';
import { KYCUploadController } from './kyc/kyc-upload.controller';
import { RateLimitingMiddleware } from './middleware/rate-limiting.middleware';
import { SecurityMiddleware } from './middleware/security.middleware';

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
    OTPModule,
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
    BankCodesService,
    FlutterwaveService,
    CloudinaryService,
    EmailService,
    AccountLockoutService,
    FlutterwaveWebhookController,
    AdminController,
    KYCUploadController,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RateLimitingMiddleware, SecurityMiddleware).forRoutes('*');
  }
}
