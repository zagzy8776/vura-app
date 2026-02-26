// src/lib/security.ts
import CryptoJS from 'crypto-js';

// CRITICAL: Get the public key from environment - never use fallback in production
const getPublicKey = (): string => {
  const key = import.meta.env.VITE_RSA_PUBLIC_KEY || '';
  if (!key && import.meta.env.PROD) {
    console.error('SECURITY ERROR: No RSA public key configured!');
  }
  return key;
};

// Session timeout constants (in milliseconds)
const SESSION_TIMEOUT = 15 * 60 * 1000; // 15 minutes inactivity
const ABSOLUTE_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours max session

export const enforceHTTPS = () => {
  if (window.location.protocol !== 'https:' && import.meta.env.PROD) {
    window.location.href = window.location.href.replace(/^http:/, 'https:');
  }
};

// FIX #1: Secure PIN hashing using HMAC-SHA256
// The PIN is hashed with a server-provided salt before sending
export const hashPIN = (pin: string, salt: string): string => {
  return CryptoJS.HmacSHA256(pin, salt).toString();
};

// FIX #2: Generate device fingerprint
export const generateDeviceFingerprint = (): string => {
  const nav = navigator;
  const screen = window.screen;
  
  const fingerprintData = [
    nav.userAgent,
    nav.language,
    nav.platform,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
  ].join('|');
  
  return CryptoJS.SHA256(fingerprintData).toString();
};

// FIX #3: Secure token storage (not localStorage - vulnerable to XSS)
// Use sessionStorage with encryption as an alternative
export const secureTokenStorage = {
  setToken: (token: string): void => {
    // Encrypt before storing
    const encrypted = CryptoJS.AES.encrypt(token, import.meta.env.VITE_STORAGE_KEY || 'fallback-key').toString();
    sessionStorage.setItem('vura_token', encrypted);
  },
  
  getToken: (): string | null => {
    const encrypted = sessionStorage.getItem('vura_token');
    if (!encrypted) return null;
    try {
      const bytes = CryptoJS.AES.decrypt(encrypted, import.meta.env.VITE_STORAGE_KEY || 'fallback-key');
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch {
      return null;
    }
  },
  
  removeToken: (): void => {
    sessionStorage.removeItem('vura_token');
  },

  setUser: (user: object): void => {
    const encrypted = CryptoJS.AES.encrypt(JSON.stringify(user), import.meta.env.VITE_STORAGE_KEY || 'fallback-key').toString();
    sessionStorage.setItem('vura_user', encrypted);
  },
  
  getUser: (): object | null => {
    const encrypted = sessionStorage.getItem('vura_user');
    if (!encrypted) return null;
    try {
      const bytes = CryptoJS.AES.decrypt(encrypted, import.meta.env.VITE_STORAGE_KEY || 'fallback-key');
      return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    } catch {
      return null;
    }
  },
  
  clearAll: (): void => {
    sessionStorage.removeItem('vura_token');
    sessionStorage.removeItem('vura_user');
    localStorage.removeItem('vura_token');
    localStorage.removeItem('vura_user');
  }
};

// FIX #4: Session timeout management
let sessionStartTime = Date.now();
let lastActivityTime = Date.now();

export const resetActivityTimer = (): void => {
  lastActivityTime = Date.now();
};

export const checkSessionTimeout = (): boolean => {
  const now = Date.now();
  
  // Check absolute timeout (24 hours max)
  if (now - sessionStartTime > ABSOLUTE_TIMEOUT) {
    return true;
  }
  
  // Check inactivity timeout (15 minutes)
  if (now - lastActivityTime > SESSION_TIMEOUT) {
    return true;
  }
  
  return false;
};

export const initSessionTimeout = (onTimeout: () => void): (() => void) => {
  sessionStartTime = Date.now();
  lastActivityTime = Date.now();
  
  const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
  
  const activityHandler = () => {
    lastActivityTime = Date.now();
  };
  
  // Check every minute
  const intervalId = setInterval(() => {
    if (checkSessionTimeout()) {
      onTimeout();
    }
  }, 60000);
  
  // Add listeners
  events.forEach(event => {
    document.addEventListener(event, activityHandler, { passive: true });
  });
  
  // Return cleanup function
  return () => {
    clearInterval(intervalId);
    events.forEach(event => {
      document.removeEventListener(event, activityHandler);
    });
  };
};

export const sanitizeInput = (input: string): string => {
  return input.replace(/[<>"'&]/g, '');
};

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePhoneNumber = (phone: string): boolean => {
  const phoneRegex = /^\+?[\d\s\-()]{10,}$/;
  return phoneRegex.test(phone);
};

export const generateCSRFToken = (): string => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

export const isSecureContext = (): boolean => {
  return window.isSecureContext || window.location.protocol === 'https:';
};

export const checkPasswordStrength = (password: string): { strength: number; message: string } => {
  let strength = 0;
  let message = '';

  if (password.length >= 8) strength++;
  if (/[a-z]/.test(password)) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;

  if (strength < 2) {
    message = 'Weak password';
  } else if (strength < 4) {
    message = 'Medium password';
  } else {
    message = 'Strong password';
  }

  return { strength, message };
};
