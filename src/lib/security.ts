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
