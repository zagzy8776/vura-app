import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { CookieConsent } from "@/components/CookieConsent";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Register from "./pages/Register";
import SendMoney from "./pages/SendMoney";
import Receive from "./pages/Receive";
import Cards from "./pages/Cards";
import Transactions from "./pages/Transactions";
import Accounts from "./pages/Accounts";
import Settings from "./pages/Settings";
import Help from "./pages/Help";
import NotFound from "./pages/NotFound";
import CryptoDeposit from "./pages/CryptoDeposit";
import { MerchantDashboard } from "./pages/MerchantDashboard";
import { TermsOfService } from "./pages/TermsOfService";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";



const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-brand animate-pulse">
          <span className="text-lg font-bold text-primary-foreground">V</span>
        </div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return null;
  }
  
  if (user) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
    <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
    <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
    <Route path="/send" element={<ProtectedRoute><SendMoney /></ProtectedRoute>} />
    <Route path="/receive" element={<ProtectedRoute><Receive /></ProtectedRoute>} />
    <Route path="/cards" element={<ProtectedRoute><Cards /></ProtectedRoute>} />
    <Route path="/transactions" element={<ProtectedRoute><Transactions /></ProtectedRoute>} />
    <Route path="/accounts" element={<ProtectedRoute><Accounts /></ProtectedRoute>} />
    <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
    <Route path="/help" element={<ProtectedRoute><Help /></ProtectedRoute>} />
    <Route path="/crypto-deposit" element={<ProtectedRoute><CryptoDeposit /></ProtectedRoute>} />
    <Route path="/merchant-dashboard" element={<ProtectedRoute><MerchantDashboard /></ProtectedRoute>} />
    <Route path="/terms" element={<TermsOfService />} />
    <Route path="/privacy" element={<PrivacyPolicy />} />
    <Route path="*" element={<NotFound />} />
  </Routes>

);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
          <CookieConsent />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);


export default App;
