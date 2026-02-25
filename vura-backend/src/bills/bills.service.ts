import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TransactionsService } from '../transactions/transactions.service';

@Injectable()
export class BillsService {
  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
  ) {}

  /**
   * Buy airtime
   */
  async buyAirtime(
    userId: string,
    data: {
      phoneNumber: string;
      amount: number;
      network: 'mtn' | 'glo' | 'airtel' | '9mobile';
    },
  ) {
    // Validate amount
    if (data.amount < 50 || data.amount > 50000) {
      throw new BadRequestException('Airtime amount must be between ₦50 and ₦50,000');
    }

    // TODO: Integrate with airtime API (e.g., VTU, ClubKonnect)
    // For now, mock the purchase
    const mockReference = `AIR-${Date.now()}`;

    // Deduct from user balance
    await this.transactionsService.sendMoney(
      userId,
      'SYSTEM_AIRTIME',
      data.amount,
      `Airtime purchase for ${data.phoneNumber}`,
      '0000', // System transaction, no PIN needed
    );


    // Log the purchase
    await this.prisma.auditLog.create({
      data: {
        action: 'AIRTIME_PURCHASE',
        userId,
        metadata: {
          phoneNumber: data.phoneNumber,
          amount: data.amount,
          network: data.network,
          reference: mockReference,
        },
      },
    });

    return {
      success: true,
      reference: mockReference,
      message: `₦${data.amount} airtime purchased for ${data.phoneNumber}`,
    };
  }

  /**
   * Buy data bundle
   */
  async buyData(
    userId: string,
    data: {
      phoneNumber: string;
      planCode: string;
      network: 'mtn' | 'glo' | 'airtel' | '9mobile';
    },
  ) {
    // TODO: Get plan details from provider
    const planAmount = 1000; // Mock amount

    const mockReference = `DATA-${Date.now()}`;

    // Deduct from user balance
    await this.transactionsService.sendMoney(
      userId,
      'SYSTEM_DATA',
      planAmount,
      `Data bundle for ${data.phoneNumber}`,
      '0000',
    );


    return {
      success: true,
      reference: mockReference,
      message: `Data bundle purchased for ${data.phoneNumber}`,
    };
  }

  /**
   * Pay electricity bill
   */
  async payElectricity(
    userId: string,
    data: {
      meterNumber: string;
      disco: 'ikeja' | 'eko' | 'ibadan' | 'abuja' | 'kano' | 'ph';
      amount: number;
    },
  ) {
    // Validate amount
    if (data.amount < 1000) {
      throw new BadRequestException('Minimum electricity payment is ₦1,000');
    }

    const mockReference = `ELEC-${Date.now()}`;

    // Deduct from user balance
    await this.transactionsService.sendMoney(
      userId,
      'SYSTEM_ELECTRICITY',
      data.amount,
      `Electricity payment for meter ${data.meterNumber}`,
      '0000',
    );


    return {
      success: true,
      reference: mockReference,
      token: '1234-5678-9012-3456', // Mock token
      message: `₦${data.amount} paid for meter ${data.meterNumber}`,
    };
  }

  /**
   * Pay cable TV
   */
  async payCable(
    userId: string,
    data: {
      smartCardNumber: string;
      provider: 'dstv' | 'gotv' | 'startimes';
      package: string;
    },
  ) {
    // TODO: Get package amount from provider
    const packageAmount = 5000; // Mock amount

    const mockReference = `CABLE-${Date.now()}`;

    // Deduct from user balance
    await this.transactionsService.sendMoney(
      userId,
      'SYSTEM_CABLE',
      packageAmount,
      `${data.provider.toUpperCase()} subscription`,
      '0000',
    );


    return {
      success: true,
      reference: mockReference,
      message: `${data.provider.toUpperCase()} subscription renewed`,
    };
  }

  /**
   * Get available data plans
   */
  async getDataPlans(network: string) {
    // TODO: Fetch from provider API
    return [
      { code: 'MTN_1GB', name: '1GB - 30 Days', price: 1000, network: 'mtn' },
      { code: 'MTN_2GB', name: '2GB - 30 Days', price: 2000, network: 'mtn' },
      { code: 'GLO_1GB', name: '1GB - 30 Days', price: 900, network: 'glo' },
    ];
  }

  /**
   * Get electricity discos
   */
  async getDiscos() {
    return [
      { code: 'ikeja', name: 'Ikeja Electric', states: ['Lagos'] },
      { code: 'eko', name: 'Eko Electricity', states: ['Lagos'] },
      { code: 'ibadan', name: 'Ibadan Disco', states: ['Oyo', 'Ogun'] },
      { code: 'abuja', name: 'Abuja Disco', states: ['FCT', 'Nasarawa'] },
      { code: 'kano', name: 'Kano Disco', states: ['Kano', 'Jigawa'] },
      { code: 'ph', name: 'Port Harcourt Disco', states: ['Rivers', 'Bayelsa'] },
    ];
  }

  /**
   * Get cable packages
   */
  async getCablePackages(provider: string) {
    // TODO: Fetch from provider API
    const packages: Record<string, any[]> = {
      dstv: [
        { code: 'padi', name: 'Padi', price: 2500 },
        { code: 'yanga', name: 'Yanga', price: 3500 },
        { code: 'confam', name: 'Confam', price: 6200 },
        { code: 'compact', name: 'Compact', price: 10500 },
      ],
      gotv: [
        { code: 'smallie', name: 'Smallie', price: 900 },
        { code: 'jinja', name: 'Jinja', price: 1900 },
        { code: 'jolli', name: 'Jolli', price: 2800 },
        { code: 'max', name: 'Max', price: 4200 },
      ],
      startimes: [
        { code: 'nova', name: 'Nova', price: 1200 },
        { code: 'basic', name: 'Basic', price: 2100 },
        { code: 'classic', name: 'Classic', price: 3100 },
      ],
    };

    return packages[provider] || [];
  }
}
