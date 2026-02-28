// vura-backend/src/services/fraud-detection.service.ts
import { Injectable } from '@nestjs/common';

export interface FraudScore {
  score: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high';
  reasons: string[];
  blocked: boolean;
}

@Injectable()
export class FraudDetectionService {
  private readonly HIGH_RISK_THRESHOLD = 80;
  private readonly MEDIUM_RISK_THRESHOLD = 50;
  private readonly MAX_DAILY_AMOUNT = 5000000; // 50,000 NGN in kobo
  private readonly MAX_SINGLE_AMOUNT = 1000000; // 10,000 NGN in kobo

  analyzeTransaction(transaction: {
    amount: number;
    userId: string;
    beneficiaryId?: string;
  }): FraudScore {
    const reasons: string[] = [];
    let score = 0;

    // Check transaction amount
    if (transaction.amount > this.MAX_SINGLE_AMOUNT) {
      score += 30;
      reasons.push('Large transaction amount');
    }

    // Check for rapid transactions (same user, multiple transactions in short time)
    const rapidTransactions = this.checkRapidTransactions(transaction.userId);
    if (rapidTransactions > 5) {
      score += 25;
      reasons.push('Multiple rapid transactions');
    }

    // Check for transactions outside normal hours (8 AM - 8 PM)
    const hour = new Date().getHours();
    if (hour < 8 || hour > 20) {
      score += 15;
      reasons.push('Transaction outside normal hours');
    }

    // Check for transactions to new beneficiaries
    const isNewBeneficiary = this.checkNewBeneficiary(
      transaction.userId,
      transaction.beneficiaryId || '',
    );
    if (isNewBeneficiary) {
      score += 20;
      reasons.push('Transaction to new beneficiary');
    }

    // Check daily transaction limit
    const dailyAmount = this.getDailyTransactionAmount(
      transaction.userId,
    );
    if (dailyAmount > this.MAX_DAILY_AMOUNT) {
      score += 40;
      reasons.push('Daily transaction limit exceeded');
    }

    // Check for suspicious patterns (round numbers, specific amounts)
    if (this.isSuspiciousAmount(transaction.amount)) {
      score += 10;
      reasons.push('Suspicious transaction amount');
    }

    // Determine risk level and action
    const riskLevel = this.getRiskLevel(score);
    const blocked = score >= this.HIGH_RISK_THRESHOLD;

    return {
      score,
      riskLevel,
      reasons,
      blocked,
    };
  }

  private checkRapidTransactions(_userId: string): number {
    // This would query the database for recent transactions
    // For now, returning a mock value
    return Math.floor(Math.random() * 10);
  }

  private checkNewBeneficiary(_userId: string, _beneficiaryId: string): boolean {
    // This would check if this is the first transaction to this beneficiary
    // For now, returning a mock value
    return Math.random() > 0.7;
  }

  private getDailyTransactionAmount(_userId: string): number {
    // This would sum all transactions for the current day
    // For now, returning a mock value
    return Math.floor(Math.random() * 10000000);
  }

  private isSuspiciousAmount(amount: number): boolean {
    // Check for round numbers or specific suspicious patterns
    const suspiciousPatterns = [1000000, 500000, 250000, 100000];
    return suspiciousPatterns.includes(amount) || amount % 1000 === 0;
  }

  private getRiskLevel(score: number): 'low' | 'medium' | 'high' {
    if (score >= this.HIGH_RISK_THRESHOLD) return 'high';
    if (score >= this.MEDIUM_RISK_THRESHOLD) return 'medium';
    return 'low';
  }

  logSuspiciousActivity(
    userId: string,
    transactionId: string,
    fraudScore: FraudScore,
  ): void {
    // Log fraud detection alert using proper logging
    console.warn('FRAUD DETECTION ALERT:', {
      userId,
      transactionId,
      score: fraudScore.score,
      riskLevel: fraudScore.riskLevel,
      reasons: fraudScore.reasons,
      timestamp: new Date().toISOString(),
    });

    // In a real implementation, this would:
    // 1. Log to a security monitoring system
    // 2. Notify security team
    // 3. Potentially trigger additional verification
    // 4. Update user's risk profile
  }
}