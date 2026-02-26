import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { toast } from "@/hooks/use-toast";
import { 
  secureTokenStorage, 
  initSessionTimeout, 
  generateDeviceFingerprint,
  checkSessionTimeout 
} from "@/lib/security";

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

// Get API URL from environment - must be HTTPS in production
const getApiUrl = (): string => {
  const url = import.meta.env.VITE_API_URL || "http://localhost:3000";
  if (import.meta.env.PROD && url.startsWith("http:")) {
    console.error("SECURITY WARNING: Using HTTP in production!");
  }
  return url;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // FIX #4: Implement session timeout
  useEffect(() => {
    // Check for stored auth using secure storage
    const storedToken = secureTokenStorage.getToken();
    const storedUser = secureTokenStorage.getUser() as User | null;
    
    if (storedToken && storedUser) {
      // Check if session has expired
      if (checkSessionTimeout()) {
        // Session expired, clear and force re-login
        secureTokenStorage.clearAll();
        setToken(null);
        setUser(null);
      } else {
        setToken(storedToken);
        setUser(storedUser);
        
        // Initialize session timeout monitoring
        const cleanup = initSessionTimeout(() => {
          toast({ 
            title: "Session Expired", 
            description: "Your session has timed out for security. Please log in again.",
            variant: "destructive"
          });
          signOut();
        });
        
        return cleanup;
      }
    }
    setLoading(false);
  }, []);

  const signUp = async (
    phone: string, 
    pin: string, 
    vuraTag: string,
    email?: string,
    password?: string
  ) => {
    const apiUrl = getApiUrl();
    
    // Generate device fingerprint for security tracking
    const deviceFingerprint = generateDeviceFingerprint();
    
    const response = await fetch(`${apiUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        phone, 
        pin, 
        vuraTag,
        email, // Optional email
        password, // Optional password
        deviceFingerprint 
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || "Registration failed");
    }

    // Store auth using secure storage
    secureTokenStorage.setToken(data.token);
    secureTokenStorage.setUser(data.user);
    setToken(data.token);
    setUser(data.user);
    
    // Initialize session timeout after successful login
    const cleanup = initSessionTimeout(() => {
      toast({ 
        title: "Session Expired", 
        description: "Your session has timed out for security.",
        variant: "destructive"
      });
      signOut();
    });
  };

  const signIn = async (vuraTag: string, pin: string) => {
    const apiUrl = getApiUrl();
    
    // Generate device fingerprint for security tracking
    const deviceFingerprint = generateDeviceFingerprint();
    
    const response = await fetch(`${apiUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        vuraTag, 
        pin,
        deviceFingerprint // Send device fingerprint for security
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || "Login failed");
    }

    // Store auth using secure storage
    secureTokenStorage.setToken(data.token);
    secureTokenStorage.setUser(data.user);
    setToken(data.token);
    setUser(data.user);
    
    // Initialize session timeout after successful login
    initSessionTimeout(() => {
      toast({ 
        title: "Session Expired", 
        description: "Your session has timed out for security. Please log in again.",
        variant: "destructive"
      });
      signOut();
    });
  };

  const signOut = () => {
    secureTokenStorage.clearAll();
    setToken(null);
    setUser(null);
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

// API helper with auth - FIX #3: Secure token retrieval
export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const apiUrl = getApiUrl();
  const token = secureTokenStorage.getToken();
  
  const response = await fetch(`${apiUrl}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });

  if (response.status === 401) {
    secureTokenStorage.clearAll();
    window.location.href = "/login";
    throw new Error("Session expired. Please log in again.");
  }

  return response;
};
