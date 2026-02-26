// src/lib/encryption.ts
import CryptoJS from 'crypto-js';

const SECRET_KEY = process.env.REACT_APP_ENCRYPTION_KEY || 'vura-banking-encryption-key-2024';

export const encryptData = (data: string): string => {
  try {
    return CryptoJS.AES.encrypt(data, SECRET_KEY).toString();
  } catch (error) {
    console.error('Encryption failed:', error);
    return '';
  }
};

export const decryptData = (encryptedData: string): string => {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, SECRET_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('Decryption failed:', error);
    return '';
  }
};

export const secureLocalStorage = {
  setItem: (key: string, value: string) => {
    const encrypted = encryptData(value);
    if (encrypted) {
      localStorage.setItem(key, encrypted);
    }
  },
  
  getItem: (key: string): string | null => {
    const encrypted = localStorage.getItem(key);
    if (!encrypted) return null;
    return decryptData(encrypted);
  },
  
  removeItem: (key: string) => {
    localStorage.removeItem(key);
  },
  
  clear: () => {
    localStorage.clear();
  }
};

export const encryptUserData = (userData: Record<string, unknown>): string => {
  return encryptData(JSON.stringify(userData));
};

export const decryptUserData = (encryptedData: string): Record<string, unknown> | null => {
  const decrypted = decryptData(encryptedData);
  if (!decrypted) return null;
  try {
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Failed to parse decrypted user data:', error);
    return null;
  }
};

export const generateSecureToken = (): string => {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2);
  return encryptData(timestamp + random);
};