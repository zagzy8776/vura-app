# Vura Banking Application Security Implementation Guide

This guide provides step-by-step instructions to implement critical security features for your banking application.

## 1. HTTPS Enforcement

### Frontend Implementation
```typescript
// src/lib/security.ts
export const enforceHTTPS = () => {
  if (window.location.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    window.location.href = window.location.href.replace(/^http:/, 'https:');
  }
};

// In src/main.tsx
import { enforceHTTPS } from './lib/security';
enforceHTTPS();
```

### Backend Implementation
```typescript
// vura-backend/src/middleware/https-redirect.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class HTTPSRedirectMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(`https://${req.get('Host')}${req.url}`);
    }
    next();
  }
}

// In src/app.module.ts
import { HTTPSRedirectMiddleware } from './middleware/https-redirect.middleware';

@Module({
  // ... other configurations
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HTTPSRedirectMiddleware).forRoutes('*');
  }
}
```

## 2. Input Validation

### Frontend Validation
```typescript
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
```

### Backend Validation (DTOs)
```typescript
// vura-backend/src/auth/dto/send-money.dto.ts
import { IsString, IsNumber, Min, Max, IsOptional } from 'class-validator';

export class SendMoneyDto {
  @IsString()
  @IsNotEmpty()
  recipientTag: string;

  @IsNumber()
  @Min(1)
  @Max(10000000)
  amount: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  pin: string;
}
```

## 3. Rate Limiting

### Backend Rate Limiting
```typescript
// vura-backend/src/middleware/rate-limit.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      error: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  use(req: Request, res: Response, next: NextFunction) {
    this.limiter(req, res, next);
  }
}

// For login attempts specifically
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 login requests per windowMs
  message: {
    error: 'Too many login attempts, please try again in 15 minutes.'
  },
  skipSuccessfulRequests: true,
});
```

## 4. Session Timeout & Auto Logout

### Frontend Session Management
```typescript
// src/hooks/useSession.ts
import { useEffect, useRef } from 'react';
import { useAuth } from './useAuth';

const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

export const useSessionTimeout = () => {
  const { signOut } = useAuth();
  const timeoutRef = useRef<NodeJS.Timeout>();

  const resetTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      signOut();
    }, SESSION_TIMEOUT);
  };

  useEffect(() => {
    // Reset timeout on user activity
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    
    events.forEach(event => {
      document.addEventListener(event, resetTimeout, true);
    });

    resetTimeout();

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, resetTimeout, true);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [signOut]);
};
```

### Backend Session Management
```typescript
// vura-backend/src/auth/auth.service.ts
@Injectable()
export class AuthService {
  private readonly sessionTimeout = 30 * 60 * 1000; // 30 minutes

  async validateSession(userId: string): Promise<boolean> {
    const session = await this.prisma.session.findUnique({
      where: { userId },
      select: { lastActivity: true }
    });

    if (!session) return false;

    const now = new Date();
    const timeDiff = now.getTime() - session.lastActivity.getTime();
    
    if (timeDiff > this.sessionTimeout) {
      await this.prisma.session.delete({ where: { userId } });
      return false;
    }

    // Update last activity
    await this.prisma.session.update({
      where: { userId },
      data: { lastActivity: now }
    });

    return true;
  }
}
```

## 5. Data Encryption

### Frontend Encryption
```typescript
// src/lib/encryption.ts
import CryptoJS from 'crypto-js';

const SECRET_KEY = process.env.REACT_APP_ENCRYPTION_KEY || 'default-key';

export const encryptData = (data: string): string => {
  return CryptoJS.AES.encrypt(data, SECRET_KEY).toString();
};

export const decryptData = (encryptedData: string): string => {
  const bytes = CryptoJS.AES.decrypt(encryptedData, SECRET_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
};

export const secureLocalStorage = {
  setItem: (key: string, value: string) => {
    const encrypted = encryptData(value);
    localStorage.setItem(key, encrypted);
  },
  
  getItem: (key: string): string | null => {
    const encrypted = localStorage.getItem(key);
    if (!encrypted) return null;
    return decryptData(encrypted);
  },
  
  removeItem: (key: string) => {
    localStorage.removeItem(key);
  }
};
```

### Backend Encryption
```typescript
// vura-backend/src/utils/encryption.ts
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);
const IV_LENGTH = 16;

export class EncryptionService {
  static encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(KEY), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
  }

  static decrypt(text: string): string {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const tag = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = textParts.join(':');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(KEY), iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
```

## 6. CSRF Protection

### Backend CSRF Protection
```typescript
// vura-backend/src/middleware/csrf.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import csrf from 'csurf';

@Injectable()
export class CSRFMiddleware implements NestMiddleware {
  private csrfProtection = csrf({ 
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    }
  });

  use(req: Request, res: Response, next: NextFunction) {
    this.csrfProtection(req, res, next);
  }
}

// In main.ts
app.use(cookieParser());
app.use(csrf({ cookie: true }));
```

### Frontend CSRF Token Handling
```typescript
// src/lib/api.ts
export const apiFetch = async (url: string, options: RequestInit = {}) => {
  const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
  
  return fetch(url, {
    ...options,
    headers: {
      'X-CSRF-Token': token || '',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
};
```

## 7. Data Privacy & Compliance

### Privacy Policy Component
```typescript
// src/pages/PrivacyPolicy.tsx
const PrivacyPolicy = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      <div className="space-y-6 text-muted-foreground">
        <section>
          <h2 className="text-xl font-semibold mb-2">Data Collection</h2>
          <p>We collect personal information including name, email, phone number, and financial data necessary for banking services.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-2">Data Protection</h2>
          <p>All sensitive data is encrypted both in transit and at rest using industry-standard encryption protocols.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-2">Data Retention</h2>
          <p>We retain customer data for as long as necessary to provide services, comply with legal obligations, and resolve disputes.</p>
        </section>
      </div>
    </div>
  );
};
```

## 8. Fraud Detection

### Backend Fraud Detection
```typescript
// vura-backend/src/fraud/fraud.service.ts
@Injectable()
export class FraudDetectionService {
  async detectFraud(transaction: any): Promise<{ isFraudulent: boolean; reason?: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: transaction.userId }
    });

    // Check for unusual transaction amounts
    if (transaction.amount > user.dailyLimit * 2) {
      return { isFraudulent: true, reason: 'Transaction amount exceeds normal pattern' };
    }

    // Check for rapid transactions
    const recentTransactions = await this.prisma.transaction.findMany({
      where: {
        userId: transaction.userId,
        createdAt: {
          gte: new Date(Date.now() - 5 * 60 * 1000) // Last 5 minutes
        }
      }
    });

    if (recentTransactions.length > 3) {
      return { isFraudulent: true, reason: 'Multiple rapid transactions detected' };
    }

    return { isFraudulent: false };
  }
}
```

## 9. Error Handling

### Frontend Error Boundaries
```typescript
// src/components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    // Log to error reporting service
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">Something went wrong</h2>
            <p className="text-muted-foreground mb-4">We're working to fix this issue</p>
            <button onClick={() => window.location.reload()} className="btn-primary">
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

## 10. Customer Support

### Live Chat Implementation
```typescript
// src/components/LiveChat.tsx
import { useState, useEffect } from 'react';

const LiveChat = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: newMessage })
    });
    
    const data = await response.json();
    setMessages([...messages, { user: 'me', text: newMessage }, { user: 'agent', text: data.reply }]);
    setNewMessage('');
  };

  return (
    <div className={`fixed bottom-4 right-4 ${isOpen ? 'block' : 'hidden'}`}>
      <div className="bg-white rounded-lg shadow-lg border border-border w-80 h-96 flex flex-col">
        <div className="p-3 border-b flex justify-between items-center">
          <h3 className="font-semibold">Live Support</h3>
          <button onClick={() => setIsOpen(false)}>×</button>
        </div>
        <div className="flex-1 p-3 overflow-y-auto">
          {messages.map((msg, i) => (
            <div key={i} className={`mb-2 ${msg.user === 'me' ? 'text-right' : 'text-left'}`}>
              <span className={`inline-block p-2 rounded-lg ${msg.user === 'me' ? 'bg-primary text-white' : 'bg-gray-200'}`}>
                {msg.text}
              </span>
            </div>
          ))}
        </div>
        <div className="p-3 border-t">
          <input 
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type your message..."
            className="w-full p-2 border rounded"
          />
        </div>
      </div>
      
      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          className="bg-primary text-white p-3 rounded-full shadow-lg"
        >
          💬
        </button>
      )}
    </div>
  );
};
```

## Implementation Priority

1. **High Priority (Implement First):**
   - HTTPS enforcement
   - Input validation
   - Session timeout
   - Basic encryption

2. **Medium Priority:**
   - Rate limiting
   - CSRF protection
   - Error handling
   - Fraud detection

3. **Low Priority (Implement Last):**
   - Advanced customer support
   - Comprehensive audit logs
   - Advanced monitoring

## Testing Security Features

```typescript
// src/__tests__/security.test.ts
describe('Security Features', () => {
  test('should enforce HTTPS in production', () => {
    // Test HTTPS redirect
  });

  test('should validate input properly', () => {
    // Test input validation
  });

  test('should implement rate limiting', () => {
    // Test rate limiting
  });

  test('should encrypt sensitive data', () => {
    // Test encryption
  });
});
```

This implementation guide provides a comprehensive approach to securing your banking application. Start with the high-priority items and work your way through the medium and low-priority features as your application matures.