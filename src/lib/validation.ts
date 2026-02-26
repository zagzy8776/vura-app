// src/lib/validation.ts
export const validateAmount = (amount: string): { isValid: boolean; error?: string } => {
  const num = parseFloat(amount);
  if (!amount || isNaN(num)) return { isValid: false, error: 'Invalid amount' };
  if (num <= 0) return { isValid: false, error: 'Amount must be greater than 0' };
  if (num > 10000000) return { isValid: false, error: 'Amount exceeds maximum limit' };
  return { isValid: true };
};

export const validatePIN = (pin: string): { isValid: boolean; error?: string } => {
  if (!/^\d{6}$/.test(pin)) return { isValid: false, error: 'PIN must be 6 digits' };
  return { isValid: true };
};

export const validateVuraTag = (tag: string): { isValid: boolean; error?: string } => {
  const cleanTag = tag.startsWith('@') ? tag.slice(1) : tag;
  if (!/^[a-zA-Z0-9_]{3,15}$/.test(cleanTag)) {
    return { isValid: false, error: 'Tag must be 3-15 alphanumeric characters' };
  }
  return { isValid: true };
};

export const validateAccountNumber = (accountNumber: string): { isValid: boolean; error?: string } => {
  if (!/^\d{10}$/.test(accountNumber)) {
    return { isValid: false, error: 'Account number must be 10 digits' };
  }
  return { isValid: true };
};

export const validateBVN = (bvn: string): { isValid: boolean; error?: string } => {
  if (!/^\d{11}$/.test(bvn)) {
    return { isValid: false, error: 'BVN must be 11 digits' };
  }
  return { isValid: true };
};

export const validateNIN = (nin: string): { isValid: boolean; error?: string } => {
  if (!/^[A-Z0-9]{11}$/.test(nin)) {
    return { isValid: false, error: 'NIN must be 11 characters (letters and numbers)' };
  }
  return { isValid: true };
};

export const validateDescription = (description: string): { isValid: boolean; error?: string } => {
  if (description.length > 200) {
    return { isValid: false, error: 'Description must be less than 200 characters' };
  }
  return { isValid: true };
};

export const validateTransaction = (data: {
  amount: string;
  pin: string;
  recipientTag?: string;
  accountNumber?: string;
  description?: string;
}): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  const amountResult = validateAmount(data.amount);
  if (!amountResult.isValid) errors.push(amountResult.error!);
  
  const pinResult = validatePIN(data.pin);
  if (!pinResult.isValid) errors.push(pinResult.error!);
  
  if (data.recipientTag) {
    const tagResult = validateVuraTag(data.recipientTag);
    if (!tagResult.isValid) errors.push(tagResult.error!);
  }
  
  if (data.accountNumber) {
    const accountResult = validateAccountNumber(data.accountNumber);
    if (!accountResult.isValid) errors.push(accountResult.error!);
  }
  
  if (data.description) {
    const descResult = validateDescription(data.description);
    if (!descResult.isValid) errors.push(descResult.error!);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};