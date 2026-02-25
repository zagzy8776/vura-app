import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { toast } from "@/hooks/use-toast";

interface User {
  id: string;
  vuraTag: string;
  kycTier: number;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  signUp: (phone: string, pin: string, vuraTag: string) => Promise<void>;
  signIn: (vuraTag: string, pin: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const API_URL = "http://localhost:3000";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for stored auth
    const storedToken = localStorage.getItem("vura_token");
    const storedUser = localStorage.getItem("vura_user");
    
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const signUp = async (phone: string, pin: string, vuraTag: string) => {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, pin, vuraTag }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || "Registration failed");
    }

    // Store auth
    localStorage.setItem("vura_token", data.token);
    localStorage.setItem("vura_user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  };

  const signIn = async (vuraTag: string, pin: string) => {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vuraTag, pin }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || "Login failed");
    }

    // Store auth
    localStorage.setItem("vura_token", data.token);
    localStorage.setItem("vura_user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  };

  const signOut = () => {
    localStorage.removeItem("vura_token");
    localStorage.removeItem("vura_user");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

// API helper with auth
export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const token = localStorage.getItem("vura_token");
  
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });

  if (response.status === 401) {
    localStorage.removeItem("vura_token");
    localStorage.removeItem("vura_user");
    window.location.href = "/login";
    throw new Error("Session expired");
  }

  return response;
};
