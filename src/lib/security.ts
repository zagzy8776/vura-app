/**
 * Security utilities for Vura Banking Application
 * Implements HTTPS enforcement, secure storage, and device fingerprinting
 */

// HTTPS Enforcement
export const enforceHTTPS = () => {
  if (typeof window !== 'undefined') {
    if (window.location.protocol !== 'https:' && import.meta.env.PROD) {
      window.location.href = window.location.href.replace(/^http:/, 'https:');
    }
  }
};

// Device Fingerprint Generation
export const generateDeviceFingerprint = (): string => {
  if (typeof window === 'undefined') return '';
  
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join('|');
  
  // Simple hash function for fingerprint
  let hash = 0;
  for (let i = 0; i < components.length; i++) {
    const char = components.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
};

// Secure Storage Keys
const STORAGE_KEYS = {
  TOKEN: 'vura_secure_token',
  USER: 'vura_secure_user',
};

// Check if localStorage is available
const isStorageAvailable = (): boolean => {
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
};

// Secure Storage Functions
export const getSecureStorage = (key: string): string | null => {
  if (!isStorageAvailable()) return null;
  
  const storageKey = STORAGE_KEYS[key as keyof typeof STORAGE_KEYS] || key;
  const item = localStorage.getItem(storageKey);
  
  if (!item) return null;
  
  try {
    return atob(item);
  } catch {
    return item;
  }
};

export const setSecureStorage = (key: string, value: string): void => {
  if (!isStorageAvailable()) return;
  
  const storageKey = STORAGE_KEYS[key as keyof typeof STORAGE_KEYS] || key;
  
  try {
    localStorage.setItem(storageKey, btoa(value));
  } catch {
    localStorage.setItem(storageKey, value);
  }
};

export const removeSecureStorage = (key: string): void => {
  if (!isStorageAvailable()) return;
  
  const storageKey = STORAGE_KEYS[key as keyof typeof STORAGE_KEYS] || key;
  localStorage.removeItem(storageKey);
};

// Password Strength Checker
export interface PasswordStrengthResult {
  strength: number; // 0-5
  message: string;
  requirements: {
    length: boolean;
    uppercase: boolean;
    lowercase: boolean;
    numbers: boolean;
    special: boolean;
  };
}

export const checkPasswordStrength = (password: string): PasswordStrengthResult => {
  const requirements = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    numbers: /[0-9]/.test(password),
    special: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),

  };

  const metRequirements = Object.values(requirements).filter(Boolean).length;
  
  let strength = 0;
  let message = "";

  if (password.length === 0) {
    strength = 0;
    message = "";
  } else if (metRequirements <= 2) {
    strength = 2;
    message = "Weak password";
  } else if (metRequirements === 3) {
    strength = 3;
    message = "Fair password";
  } else if (metRequirements === 4) {
    strength = 4;
    message = "Good password";
  } else if (metRequirements === 5) {
    strength = 5;
    message = "Strong password";
  }

  return {
    strength,
    message,
    requirements,
  };
};
