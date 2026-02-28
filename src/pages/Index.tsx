import { useState, useEffect } from "react";
import AppSidebar from "@/components/AppSidebar";
import DashboardHeader from "@/components/DashboardHeader";
import BalanceCard from "@/components/BalanceCard";
import QuickActions from "@/components/QuickActions";
import StatsCards from "@/components/StatsCards";
import TransactionList from "@/components/TransactionList";
import SpendingChart from "@/components/SpendingChart";
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
      <main className="flex-1 ml-64 px-8 pb-8">
        <DashboardHeader />
        
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}
        
        <div className="grid grid-cols-12 gap-6">
          {/* Left column */}
          <div className="col-span-8 space-y-6">
            <BalanceCard 
              ngnBalance={ngnBalance} 
              usdtBalance={usdtBalance} 
              loading={loading} 
            />
            <StatsCards transactions={transactions} />
            <SpendingChart transactions={transactions} />
          </div>

          {/* Right column */}
          <div className="col-span-4 space-y-6">
            <QuickActions />
            <TransactionList transactions={transactions} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
