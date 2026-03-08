import { useState, useEffect } from "react";
import AppSidebar from "@/components/AppSidebar";
import DashboardHeader from "@/components/DashboardHeader";
import BalanceCard from "@/components/BalanceCard";
import QuickActions from "@/components/QuickActions";
import StatsCards from "@/components/StatsCards";
import TransactionList from "@/components/TransactionList";
import SpendingChart from "@/components/SpendingChart";
import LoadingSpinner from "@/components/LoadingSpinner";
import { PaymentRequestNotification } from "@/components/PaymentRequestNotification";
import { useAuth, apiFetch } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Bell, Check, X, Loader2 } from "lucide-react";

interface Balance {
  currency: string;
  amount: number;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  reference: string;
  createdAt: string;
  counterparty: string;
  direction: string;
}

interface PendingRequest {
  id: string;
  reference: string;
  amount: number;
  description: string;
  requesterVuraTag: string;
  requesterKycTier: number;
  createdAt: string;
  expiresAt: string;
}

const Index = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<PendingRequest | null>(null);
  const [limits, setLimits] = useState<{ remainingDaily?: number; dailyLimit?: number }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPendingRequests = async () => {
    try {
      const res = await apiFetch("/payment-requests/pending");
      if (res.ok) {
        const data = await res.json();
        setPendingRequests(Array.isArray(data) ? data : []);
      } else {
        setPendingRequests([]);
      }
    } catch {
      setPendingRequests([]);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setError(null);
        
        // Fetch balances
        const balanceRes = await apiFetch("/transactions/balance");
        if (balanceRes.ok) {
          const balanceData = await balanceRes.json();
          if (Array.isArray(balanceData)) {
            setBalances(balanceData);
          } else {
            setBalances([]);
          }
        } else {
          setBalances([]);
        }

        // Fetch transactions
        const txRes = await apiFetch("/transactions?limit=10");
        if (txRes.ok) {
          const txData = await txRes.json();
          if (Array.isArray(txData)) {
            setTransactions(txData);
          } else {
            setTransactions([]);
          }
        } else {
          setTransactions([]);
        }

        await fetchPendingRequests();

        const limitsRes = await apiFetch("/limits");
        if (limitsRes.ok) {
          const lim = await limitsRes.json().catch(() => ({}));
          setLimits({ remainingDaily: lim?.remainingDaily, dailyLimit: lim?.dailyLimit });
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
        setError("Failed to load dashboard data. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [user]);

  const handleAcceptRequest = async (requestId: string, pin: string) => {
    try {
      const res = await apiFetch(`/payment-requests/${requestId}/accept`, {
        method: "POST",
        body: JSON.stringify({ pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Payment failed", description: data.message || "Could not complete payment", variant: "destructive" });
        return;
      }
      toast({ title: "Payment sent", description: data.message || `₦${data.request?.amount} sent.` });
      setSelectedRequest(null);
      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
      const balanceRes = await apiFetch("/transactions/balance");
      if (balanceRes.ok) {
        const balanceData = await balanceRes.json();
        if (Array.isArray(balanceData)) setBalances(balanceData);
      }
      const txRes = await apiFetch("/transactions?limit=10");
      if (txRes.ok) {
        const txData = await txRes.json();
        if (Array.isArray(txData)) setTransactions(txData);
      }
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Request failed", variant: "destructive" });
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    try {
      await apiFetch(`/payment-requests/${requestId}/decline`, { method: "POST" });
      setSelectedRequest(null);
      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch {
      toast({ title: "Error", description: "Could not decline request", variant: "destructive" });
    }
  };

  // Get NGN and USDT balances with fallback
  const ngnBalance = balances.find(b => b.currency === "NGN")?.amount || 0;
  const usdtBalance = balances.find(b => b.currency === "USDT")?.amount || 0;
  const remainingToSend = Number(limits.remainingDaily);
  const hasRemaining = Number.isFinite(remainingToSend) && remainingToSend > 0;

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 lg:ml-64 px-3 sm:px-4 lg:px-6 py-4 sm:py-6 pb-28 safe-area-bottom">
        <DashboardHeader />
        
        {error && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-red-600 text-xs sm:text-sm">{error}</p>
          </div>
        )}
        
        <div className="space-y-4 sm:space-y-6">
          {/* Balance Card - Full width on mobile */}
          <div>
            <BalanceCard 
              ngnBalance={ngnBalance} 
              usdtBalance={usdtBalance} 
              loading={loading} 
            />
            {!loading && hasRemaining && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <p className="text-sm text-muted-foreground">
                  You have <span className="font-semibold text-foreground">₦{remainingToSend.toLocaleString()}</span> left to send today.
                </p>
                <Button size="sm" className="rounded-xl h-8" onClick={() => navigate("/send")}>
                  Send
                </Button>
              </div>
            )}
          </div>

          {/* Pending payment requests */}
          {pendingRequests.length > 0 && (
            <div className="rounded-2xl bg-card border border-border p-4 shadow-card">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-3">
                <Bell className="h-5 w-5 text-primary" />
                Payment requests ({pendingRequests.length})
              </h3>
              <ul className="space-y-2">
                {pendingRequests.map((req) => (
                  <li key={req.id} className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">@{req.requesterVuraTag}</p>
                      <p className="text-sm text-muted-foreground">{req.description || "Payment request"} · ₦{Number(req.amount).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" className="rounded-lg" onClick={() => handleDeclineRequest(req.id)}>
                        <X className="h-4 w-4" />
                      </Button>
                      <Button size="sm" className="rounded-lg bg-primary text-primary-foreground hover:opacity-90" onClick={() => setSelectedRequest(req)}>
                        <Check className="h-4 w-4 mr-1" /> Pay
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Quick Actions - Moved up after Balance */}
          <div>
            <QuickActions />
          </div>

          {/* Stats Cards - Responsive grid */}
          <div>
            <StatsCards transactions={transactions} />
          </div>

          {/* Transaction List - Full width on mobile */}
          <div>
            <TransactionList transactions={transactions} />
          </div>

          {/* Spending Chart - Full width */}
          <div>
            <SpendingChart transactions={transactions} />
          </div>
        </div>

        <PaymentRequestNotification
          isOpen={!!selectedRequest}
          onClose={() => setSelectedRequest(null)}
          request={selectedRequest}
          onAccept={handleAcceptRequest}
          onDecline={handleDeclineRequest}
        />
      </main>
    </div>
  );
};

export default Index;
