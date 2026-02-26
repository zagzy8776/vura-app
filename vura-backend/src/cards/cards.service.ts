import { Injectable, NotFoundException, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EncryptionService } from '../services/encryption.service';
import { v4 as uuidv4 } from 'uuid';

export interface Card {
  id: string;
  type: 'Virtual' | 'Physical';
  last4: string;
  expiry: string;
  balance: number;
  status: 'active' | 'frozen';
  cardNumber: string;
  cvv: string;
  pin: string;
  createdAt: Date;
}

@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(private prisma: PrismaService) {}

  async createCard(userId: string, type: 'Virtual' | 'Physical', currency: string = 'NGN'): Promise<Card> {
    // Check if user is KYC verified (tier 2+ required for cards)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { kycTier: true, vuraTag: true }
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.kycTier < 2) {
      throw new BadRequestException('KYC verification required. Complete identity verification to create cards.');
    }

    // Check if user already has a card of this type
    const existingCard = await this.prisma.card.findFirst({
      where: {
        userId,
        type,
        status: { not: 'deleted' }
      }
    });

    if (existingCard) {
      throw new BadRequestException(`You already have a ${type.toLowerCase()} card. Delete it first to create a new one.`);
    }

    // Generate card details with Luhn-valid card numbers
    const cardNumber = this.generateLuhnValidCardNumber();
    const last4 = cardNumber.slice(-4);
    const expiry = this.generateExpiry();
    const cvv = this.generateCVV();
    const pin = this.generatePIN();
    
    // Encrypt PIN before storing
    const encryptedPin = EncryptionService.encrypt(pin);

    // Create card in database
    const card = await this.prisma.card.create({
      data: {
        id: uuidv4(),
        userId,
        type,
        last4,
        expiry,
        balance: 0,
        status: 'active',
        cardNumber: cardNumber, // Store full card number (in production, this would come from Yellow Card API)
        cvv,
        pin: encryptedPin, // Store encrypted PIN
        currency,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    this.logger.log(`Created ${type} card for user ${userId} with last4: ${last4}`);

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        action: 'CREATE_CARD',
        userId,
        actorType: 'user',
        metadata: { 
          cardId: card.id, 
          type, 
          last4, 
          currency 
        }
      }
    });

    // Return card with masked card number for security
    return {
      id: card.id,
      type: card.type as 'Virtual' | 'Physical',
      last4: card.last4,
      expiry: card.expiry,
      balance: Number(card.balance),
      status: card.status as 'active' | 'frozen',
      cardNumber: this.maskCardNumber(card.cardNumber),
      cvv: card.cvv,
      pin: pin, // Return unencrypted PIN only at creation time
      createdAt: card.createdAt
    };
  }

  async getCards(userId: string): Promise<Card[]> {
    const cards = await this.prisma.card.findMany({
      where: {
        userId,
        status: { not: 'deleted' }
      },
      orderBy: { createdAt: 'desc' }
    });

    return cards.map(card => ({
      id: card.id,
      type: card.type as 'Virtual' | 'Physical',
      last4: card.last4,
      expiry: card.expiry,
      balance: Number(card.balance),
      status: card.status as 'active' | 'frozen',
      cardNumber: this.maskCardNumber(card.cardNumber),
      cvv: card.cvv,
      pin: '****', // Never return PIN in list
      createdAt: card.createdAt
    }));
  }

  async updateCardStatus(userId: string, cardId: string, status: 'active' | 'frozen'): Promise<Card> {
    const card = await this.prisma.card.findFirst({
      where: {
        id: cardId,
        userId,
        status: { not: 'deleted' }
      }
    });

    if (!card) {
      throw new NotFoundException('Card not found');
    }

    const updatedCard = await this.prisma.card.update({
      where: { id: cardId },
      data: {
        status,
        updatedAt: new Date()
      }
    });

    this.logger.log(`Card ${cardId} status changed to ${status} by user ${userId}`);

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        action: status === 'frozen' ? 'FREEZE_CARD' : 'UNFREEZE_CARD',
        userId,
        actorType: 'user',
        metadata: { 
          cardId, 
          status,
          previousStatus: card.status 
        }
      }
    });

    return {
      id: updatedCard.id,
      type: updatedCard.type as 'Virtual' | 'Physical',
      last4: updatedCard.last4,
      expiry: updatedCard.expiry,
      balance: Number(updatedCard.balance),
      status: updatedCard.status as 'active' | 'frozen',
      cardNumber: this.maskCardNumber(updatedCard.cardNumber),
      cvv: updatedCard.cvv,
      pin: '****',
      createdAt: updatedCard.createdAt
    };
  }

  async deleteCard(userId: string, cardId: string): Promise<{ success: boolean }> {
    const card = await this.prisma.card.findFirst({
      where: {
        id: cardId,
        userId,
        status: { not: 'deleted' }
      }
    });

    if (!card) {
      throw new NotFoundException('Card not found');
    }

    // Soft delete by setting status to 'deleted'
    await this.prisma.card.update({
      where: { id: cardId },
      data: {
        status: 'deleted',
        updatedAt: new Date()
      }
    });

    this.logger.log(`Card ${cardId} deleted by user ${userId}`);

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        action: 'DELETE_CARD',
        userId,
        actorType: 'user',
        metadata: { 
          cardId, 
          type: card.type,
          last4: card.last4 
        }
      }
    });

    return { success: true };
  }

  async getCardPin(userId: string, cardId: string): Promise<{ pin: string }> {
    const card = await this.prisma.card.findFirst({
      where: {
        id: cardId,
        userId,
        status: { not: 'deleted' }
      },
      select: { pin: true, last4: true }
    });

    if (!card) {
      throw new NotFoundException('Card not found');
    }

    // Decrypt PIN
    let decryptedPin: string;
    try {
      decryptedPin = EncryptionService.decrypt(card.pin);
    } catch (error) {
      this.logger.error(`Failed to decrypt PIN for card ${cardId}`, error);
      throw new BadRequestException('Unable to retrieve card PIN. Please contact support.');
    }

    // Create audit log for PIN access
    await this.prisma.auditLog.create({
      data: {
        action: 'ACCESS_CARD_PIN',
        userId,
        actorType: 'user',
        metadata: { cardId, last4: card.last4 }
      }
    });

    return { pin: decryptedPin };
  }

  /**
   * Generate a Luhn-valid 16-digit card number
   * Format: 4xxx xxxx xxxx xxxx (starts with 4 for Visa)
   */
  private generateLuhnValidCardNumber(): string {
    // Generate first 15 digits (Visa cards start with 4)
    let cardNumber = '4';
    for (let i = 0; i < 14; i++) {
      cardNumber += Math.floor(Math.random() * 10).toString();
    }
    
    // Calculate check digit using Luhn algorithm
    const checkDigit = this.calculateLuhnCheckDigit(cardNumber);
    cardNumber += checkDigit;
    
    return cardNumber;
  }

  /**
   * Calculate Luhn check digit for a card number
   */
  private calculateLuhnCheckDigit(partialNumber: string): string {
    let sum = 0;
    let isEven = false;

    // Process from right to left
    for (let i = partialNumber.length - 1; i >= 0; i--) {
      let digit = parseInt(partialNumber[i], 10);

      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit.toString();
  }

  /**
   * Validate a card number using Luhn algorithm
   */
  private isValidLuhn(cardNumber: string): boolean {
    const digits = cardNumber.replace(/\D/g, '');
    let sum = 0;
    let isEven = false;

    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits[i], 10);

      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  }

  /**
   * Mask card number for display (show only last 4 digits)
   */
  private maskCardNumber(cardNumber: string): string {
    // Remove any spaces or special characters
    const cleanNumber = cardNumber.replace(/\D/g, '');
    
    // If it's already masked (contains •), return as is
    if (cardNumber.includes('•')) {
      return cardNumber;
    }
    
    // Show only last 4 digits
    const last4 = cleanNumber.slice(-4);
    return `•••• •••• •••• ${last4}`;
  }

  private generateLast4(): string {
    // Generate 4 random digits
    const digits = [];
    for (let i = 0; i < 4; i++) {
      digits.push(Math.floor(Math.random() * 10).toString());
    }
    return digits.join('');
  }

  private generateExpiry(): string {
    const month = Math.floor(1 + Math.random() * 12).toString().padStart(2, '0');
    const year = (new Date().getFullYear() + Math.floor(2 + Math.random() * 3)).toString().slice(-2);
    return `${month}/${year}`;
  }

  private generateCVV(): string {
    return Math.floor(100 + Math.random() * 900).toString();
  }

  private generatePIN(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }
}
