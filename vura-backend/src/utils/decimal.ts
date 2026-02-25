import Decimal from 'decimal.js';

// Configure Decimal.js for precise financial calculations
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

// Common currency configurations
export const CURRENCY_CONFIG = {
  NGN: { decimals: 2, symbol: '₦' },  // Kobo precision
  USDT: { decimals: 8, symbol: '$' }, // Crypto precision
};

/**
 * Format amount with currency symbol
 */
export function formatCurrency(amount: string | number | Decimal, currency: string): string {
  const config = CURRENCY_CONFIG[currency as keyof typeof CURRENCY_CONFIG];
  if (!config) return amount.toString();
  
  const decimalAmount = new Decimal(amount);
  return `${config.symbol}${decimalAmount.toFixed(config.decimals)}`;
}

/**
 * Parse currency string to Decimal
 */
export function parseCurrency(amount: string, currency: string): Decimal {
  const config = CURRENCY_CONFIG[currency as keyof typeof CURRENCY_CONFIG];
  if (!config) return new Decimal(amount);
  
  return new Decimal(amount).toDecimalPlaces(config.decimals);
}

/**
 * Add two amounts (safe for financial calculations)
 */
export function addAmount(a: string | number | Decimal, b: string | number | Decimal): Decimal {
  return new Decimal(a).plus(b);
}

/**
 * Subtract two amounts (safe for financial calculations)
 */
export function subtractAmount(a: string | number | Decimal, b: string | number | Decimal): Decimal {
  return new Decimal(a).minus(b);
}

/**
 * Multiply amount (safe for financial calculations)
 */
export function multiplyAmount(a: string | number | Decimal, b: string | number | Decimal): Decimal {
  return new Decimal(a).times(b);
}

/**
 * Divide amount (safe for financial calculations)
 */
export function divideAmount(a: string | number | Decimal, b: string | number | Decimal): Decimal {
  if (new Decimal(b).isZero()) {
    throw new Error('Division by zero');
  }
  return new Decimal(a).dividedBy(b);
}

/**
 * Compare two amounts
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareAmount(a: string | number | Decimal, b: string | number | Decimal): number {
  const da = new Decimal(a);
  const db = new Decimal(b);
  if (da.lt(db)) return -1;
  if (da.gt(db)) return 1;
  return 0;
}

/**
 * Check if amount is zero
 */
export function isZero(amount: string | number | Decimal): boolean {
  return new Decimal(amount).isZero();
}

/**
 * Check if amount is positive
 */
export function isPositive(amount: string | number | Decimal): boolean {
  return new Decimal(amount).greaterThan(0);
}

/**
 * Check if amount is negative
 */
export function isNegative(amount: string | number | Decimal): boolean {
  return new Decimal(amount).lessThan(0);
}
