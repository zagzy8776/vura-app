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
  cardNumber: string; // Masked
  cvv: string; // Should NEVER be returned
  pin: string; // Should NEVER be returned
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

    // Generate last4 and expiry only - cardToken should come from payment provider in production
    const last4 = this.generateLast4();
    const expiry = this.generateExpiry();
    
    // Generate a hash of the card for display purposes (NOT the actual card number)
    // In production: This would be a token from Paystack/Monnify
    const cardHash = EncryptionService.encrypt(`VURA-${last4}-${Date.now()}`);
    const cardToken = `vrt_${uuidv4().replace(/-/g, '').substring(0, 16)}`;

    // Create card in database - NO raw card number, CVV, or PIN stored
    const card = await this.prisma.card.create({
      data: {
        id: uuidv4(),
        userId,
        type,
        last4,
        expiry,
        balance: 0,
        status: 'active',
        cardToken: cardToken, // Token from provider
        cardHash: cardHash,    // Encrypted hash for display
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

    // Return card details - NEVER return CVV or PIN
    // PIN would need to be set via the card provider's PIN management
    return {
      id: card.id,
      type: card.type as 'Virtual' | 'Physical',
      last4: card.last4,
      expiry: card.expiry,
      balance: Number(card.balance),
      status: card.status as 'active' | 'frozen',
      cardNumber: `•••• •••• •••• ${last4}`,
      cvv: '***', // NEVER return actual CVV
      pin: '****', // NEVER return PIN - user must set via provider
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
      cardNumber: `•••• •••• •••• ${card.last4}`,
      cvv: '***', // NEVER return CVV
      pin: '****', // NEVER return PIN
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
      cardNumber: `•••• •••• •••• ${updatedCard.last4}`,
      cvv: '***',
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
    // PIN should be managed through the card provider, not stored locally
    // This endpoint is kept for backward compatibility but should be deprecated
    
    const card = await this.prisma.card.findFirst({
      where: {
        id: cardId,
        userId,
        status: { not: 'deleted' }
      },
      select: { last4: true }
    });

    if (!card) {
      throw new NotFoundException('Card not found');
    }

    // Create audit log for PIN access attempt
    await this.prisma.auditLog.create({
      data: {
        action: 'ACCESS_CARD_PIN_ATTEMPT',
        userId,
        actorType: 'user',
        metadata: { cardId, last4: card.last4, note: 'PIN should be managed via card provider' }
      }
    });

    // Return a message indicating PIN must be set via provider
    throw new BadRequestException('Card PIN must be set through the card provider mobile app. Download the Vura Cards app to manage your PIN.');
  }

  /**
   * Generate last 4 digits for display
   */
  private generateLast4(): string {
    const digits = [];
    for (let i = 0; i < 4; i++) {
      digits.push(Math.floor(Math.random() * 10).toString());
    }
    return digits.join('');
  }

  /**
   * Generate expiry date (MM/YY)
   */
  private generateExpiry(): string {
    const month = Math.floor(1 + Math.random() * 12).toString().padStart(2, '0');
    const year = (new Date().getFullYear() + Math.floor(2 + Math.random() * 3)).toString().slice(-2);
    return `${month}/${year}`;
  }
}
