import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { toast } from "@/hooks/use-toast";
import { enforceHTTPS, generateDeviceFingerprint, getSecureStorage, setSecureStorage, removeSecureStorage } from "@/lib/security";

interface User {
  id: string;
  vuraTag: string;
  kycTier: number;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  signUp: (phone: string, pin: string, vuraTag: string, email?: string, password?: string) => Promise<void>;
  signIn: (vuraTag: string, pin: string) => Promise<SignInResult>;
  completeRegistration: (pendingId: string, otp: string) => Promise<void>;
  resendOtp: (email: string, purpose?: string) => Promise<void>;
  verifyDeviceOtp: (vuraTag: string, otp: string, deviceFingerprint: string) => Promise<void>;
  signOut: () => void;
}

type SignInResult =
  | { requiresVerification: false }
  | {
      requiresVerification: true;
      method: string;
      message?: string;
      otp?: string;
      vuraTag: string;
      deviceFingerprint: string;
    };

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// Session timeout in milliseconds (15 minutes)
const SESSION_TIMEOUT = 15 * 60 * 1000;

// Get API URL - use HTTPS in production
const getApiUrl = (): string => {
  const isProduction = import.meta.env.PROD;
  if (isProduction) {
    return "https://vura-app.onrender.com/api";
  }
  return "http://localhost:3002/api";
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpiry, setSessionExpiry] = useState<number | null>(null);

  // Enforce HTTPS on mount
  useEffect(() => {
    enforceHTTPS();
  }, []);

  // Session timeout handler
  useEffect(() => {
    if (!token || !sessionExpiry) return;

    const checkSession = () => {
      if (Date.now() > sessionExpiry) {
        toast({
          title: "Session Expired",
          description: "Your session has expired for security. Please login again.",
          variant: "destructive"
        });
        signOut();
      }
    };

    const interval = setInterval(checkSession, 60000);
    
    const resetSession = () => {
      setSessionExpiry(Date.now() + SESSION_TIMEOUT);
    };

    window.addEventListener("click", resetSession);
    window.addEventListener("keypress", resetSession);

    return () => {
      clearInterval(interval);
      window.removeEventListener("click", resetSession);
      window.removeEventListener("keypress", resetSession);
    };
  }, [token, sessionExpiry]);

  useEffect(() => {
    const storedToken = getSecureStorage("vura_token");
    const storedUser = getSecureStorage("vura_user");
    
    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        setSessionExpiry(Date.now() + SESSION_TIMEOUT);
      } catch (e) {
        removeSecureStorage("vura_token");
        removeSecureStorage("vura_user");
      }
    }
    setLoading(false);
  }, []);

  const signUp = async (phone: string, pin: string, vuraTag: string, email?: string, password?: string) => {
    const API_URL = getApiUrl();
    const deviceFingerprint = generateDeviceFingerprint();
    
    const response = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-Device-Fingerprint": deviceFingerprint
      },
      body: JSON.stringify({ phone, email, pin, vuraTag }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || "Registration failed");
    }

    // In production, backend may require OTP verification for registration
    if (data.requiresVerification) {
      // If backend is temporarily bypassing email, it may return the OTP directly
      if (data.otp) {
        throw new Error(
          JSON.stringify({
            code: "REGISTRATION_OTP_REQUIRED",
            message: data.message || "Verification required",
            pendingId: data.pendingId,
            email,
            otp: data.otp,
          }),
        );
      }

      // Let the caller decide how to route (e.g. navigate to OTP screen)
      throw new Error(
        JSON.stringify({
          code: "REGISTRATION_OTP_REQUIRED",
          message: data.message || "Verification required",
          pendingId: data.pendingId,
          email,
        }),
      );
    }

    setSecureStorage("vura_token", data.token);
    setSecureStorage("vura_user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    setSessionExpiry(Date.now() + SESSION_TIMEOUT);
  };

  const completeRegistration = async (pendingId: string, otp: string) => {
    const API_URL = getApiUrl();
    const response = await fetch(`${API_URL}/auth/complete-registration`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pendingId, otp }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Verification failed");
    }

    setSecureStorage("vura_token", data.token);
    setSecureStorage("vura_user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    setSessionExpiry(Date.now() + SESSION_TIMEOUT);
  };

  const resendOtp = async (email: string, purpose?: string) => {
    const API_URL = getApiUrl();
    const response = await fetch(`${API_URL}/auth/resend-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, purpose }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Resend failed");
    }
  };

  const signIn = async (vuraTag: string, pin: string) => {
    const API_URL = getApiUrl();
    const deviceFingerprint = generateDeviceFingerprint();
    
    const response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-Device-Fingerprint": deviceFingerprint
      },
      body: JSON.stringify({ vuraTag, pin, deviceFingerprint }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || "Login failed");
    }

    // Check if device verification is required
    if (data.requiresVerification) {
      return {
        requiresVerification: true,
        method: data.method,
        message: data.message,
        otp: data.otp,
        vuraTag,
        deviceFingerprint,
      };
    }

    setSecureStorage("vura_token", data.token);
    setSecureStorage("vura_user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    setSessionExpiry(Date.now() + SESSION_TIMEOUT);
    return { requiresVerification: false };
  };

  const verifyDeviceOtp = async (vuraTag: string, otp: string, deviceFingerprint: string) => {
    const API_URL = getApiUrl();
    
    const response = await fetch(`${API_URL}/auth/verify-otp`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ vuraTag, otp, deviceFingerprint }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || "Verification failed");
    }

    setSecureStorage("vura_token", data.token);
    setSecureStorage("vura_user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    setSessionExpiry(Date.now() + SESSION_TIMEOUT);
  };

  const signOut = () => {
    removeSecureStorage("vura_token");
    removeSecureStorage("vura_user");
    setToken(null);
    setUser(null);
    setSessionExpiry(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        signUp,
        signIn,
        completeRegistration,
        resendOtp,
        verifyDeviceOtp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

// API helper with auth
export const apiFetch = async (endpoint: string, options: RequestInit = {}): Promise<Response> => {
  const API_URL = getApiUrl();
  const token = getSecureStorage("vura_token");
  const deviceFingerprint = generateDeviceFingerprint();
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Device-Fingerprint": deviceFingerprint,
  };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: options.method || "GET",
    body: options.body,
    credentials: options.credentials,
    headers: {
      ...headers,
      ...(options.headers as Record<string, string>),
    },
  });

  if (response.status === 401) {
    removeSecureStorage("vura_token");
    removeSecureStorage("vura_user");
    window.location.href = "/login";
    throw new Error("Session expired");
  }

  return response;
};