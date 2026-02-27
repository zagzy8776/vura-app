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
  signIn: (vuraTag: string, pin: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// Session timeout in milliseconds (15 minutes)
const SESSION_TIMEOUT = 15 * 60 * 1000;

// Get API URL - use HTTPS in production
const getApiUrl = (): string => {
  const isProduction = import.meta.env.PROD;
  if (isProduction) {
    return "https://vura-app.onrender.com/api";
  }
  return "http://localhost:3000/api";
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
      body: JSON.stringify({ phone, pin, vuraTag }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || "Registration failed");
    }

    setSecureStorage("vura_token", data.token);
    setSecureStorage("vura_user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    setSessionExpiry(Date.now() + SESSION_TIMEOUT);
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
    <AuthContext.Provider value={{ user, token, loading, signUp, signIn, signOut }}>
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
