import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, DollarSign, Wallet } from "lucide-react";
import LoadingSpinner from "./LoadingSpinner";

interface Transaction {
  id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  direction: string;
  createdAt: string;
}

interface StatsCardsProps {
  transactions?: Transaction[];
}

const StatsCards = ({ transactions = [] }: StatsCardsProps) => {
  // Calculate real stats from transactions
  const calculateStats = () => {
    // Validate transactions array
    if (!Array.isArray(transactions)) {
      console.warn("StatsCards: transactions is not an array");
      return [];
    }

    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    
    // Filter transactions for this month with validation
    const thisMonthTransactions = transactions.filter(tx => {
      if (!tx || !tx.createdAt) return false;
      try {
        const txDate = new Date(tx.createdAt);
        return !isNaN(txDate.getTime()) && txDate.getMonth() === thisMonth && txDate.getFullYear() === thisYear;
      } catch (e) {
        console.warn("Invalid transaction date:", tx.createdAt);
        return false;
      }
    });
    
    // Calculate income (received money) - check multiple direction values
    const income = thisMonthTransactions
      .filter(tx => {
        const isIncoming = tx.direction === "incoming" || tx.direction === "received" || tx.direction === "credit";
        const isCompleted = tx.status === "COMPLETED" || tx.status === "success" || tx.status === "completed";
        return isIncoming && isCompleted;
      })
      .reduce((sum, tx) => {
        const amount = typeof tx.amount === 'number' && !isNaN(tx.amount) ? tx.amount : 0;
        return sum + amount;
      }, 0);
    
    // Calculate expenses (sent money) - check multiple direction values
    const expenses = thisMonthTransactions
      .filter(tx => {
        const isOutgoing = tx.direction === "outgoing" || tx.direction === "sent" || tx.direction === "debit";
        const isCompleted = tx.status === "COMPLETED" || tx.status === "success" || tx.status === "completed";
        return isOutgoing && isCompleted;
      })
      .reduce((sum, tx) => {
        const amount = typeof tx.amount === 'number' && !isNaN(tx.amount) ? tx.amount : 0;
        return sum + amount;
      }, 0);
    
    // Calculate savings (net)
    const savings = income - expenses;
    
    // Format currency with validation
    const formatNaira = (amount: number) => {
      const validAmount = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
      return "₦" + validAmount.toLocaleString("en-NG");
    };
    
    return [
      { 
        label: "Income", 
        value: formatNaira(income), 
        change: income > 0 ? "+This month" : "No income", 
        trend: "up" as const, 
        icon: TrendingUp 
      },
      { 
        label: "Expenses", 
        value: formatNaira(expenses), 
        change: expenses > 0 ? "-This month" : "No expenses", 
        trend: "down" as const, 
        icon: TrendingDown 
      },
      { 
        label: "Net Flow", 
        value: formatNaira(savings), 
        change: savings >= 0 ? "Positive" : "Negative", 
        trend: savings >= 0 ? "up" as const : "down" as const, 
        icon: Wallet 
      },
    ];
  };

  const stats = calculateStats();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + i * 0.08, duration: 0.4 }}
          className="rounded-2xl bg-card border border-border p-4 sm:p-5 shadow-card"
        >
          <div className="flex items-center justify-between mb-3">
            <div className={`flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl ${stat.trend === "up" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
              <stat.icon className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </div>
            <span className={`text-xs font-semibold ${stat.trend === "up" ? "text-primary" : "text-destructive"}`}>
              {stat.change}
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-foreground">{stat.value}</p>
          <p className="text-xs text-muted-foreground mt-1">{stat.label} this month</p>
        </motion.div>
      ))}
    </div>
  );
};

export default StatsCards;
