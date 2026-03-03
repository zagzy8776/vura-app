import { useState, useEffect } from "react";
import AppSidebar from "@/components/AppSidebar";
import DashboardHeader from "@/components/DashboardHeader";
import BalanceCard from "@/components/BalanceCard";
import QuickActions from "@/components/QuickActions";
import StatsCards from "@/components/StatsCards";
import TransactionList from "@/components/TransactionList";
import SpendingChart from "@/components/SpendingChart";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useAuth, apiFetch } from "@/hooks/useAuth";

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

const Index = () => {
  const { user } = useAuth();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setError(null);
        
        // Fetch balances
        const balanceRes = await apiFetch("/transactions/balance");
        if (balanceRes.ok) {
          const balanceData = await balanceRes.json();
          // Validate that balanceData is an array
          if (Array.isArray(balanceData)) {
            setBalances(balanceData);
          } else {
            console.warn("Balance data is not an array:", balanceData);
            setBalances([]);
          }
        } else {
          console.warn("Failed to fetch balances:", balanceRes.status);
          setBalances([]);
        }

        // Fetch transactions
        const txRes = await apiFetch("/transactions?limit=10");
        if (txRes.ok) {
          const txData = await txRes.json();
          // Validate that txData is an array
          if (Array.isArray(txData)) {
            setTransactions(txData);
          } else {
            console.warn("Transaction data is not an array:", txData);
            setTransactions([]);
          }
        } else {
          console.warn("Failed to fetch transactions:", txRes.status);
          setTransactions([]);
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

  // Get NGN and USDT balances with fallback
  const ngnBalance = balances.find(b => b.currency === "NGN")?.amount || 0;
  const usdtBalance = balances.find(b => b.currency === "USDT")?.amount || 0;

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
          </div>

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
      </main>
    </div>
  );
};

export default Index;
