import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownLeft, ShoppingCart, Coffee, Fuel } from "lucide-react";
import { useNavigate } from "react-router-dom";

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

interface TransactionListProps {
  transactions?: Transaction[];
}

// Mock icons mapping
const getIcon = (type: string) => {
  if (type === "send" || type === "debit") return ArrowUpRight;
  if (type === "receive" || type === "credit") return ArrowDownLeft;
  if (type === "shopping") return ShoppingCart;
  if (type === "food") return Coffee;
  if (type === "fuel") return Fuel;
  return ArrowDownLeft;
};

const defaultTransactions = [
  { id: "1", type: "receive", amount: 450000, currency: "NGN", status: "completed", reference: "TXN001", createdAt: new Date().toISOString(), counterparty: "Dangote Ltd", direction: "received" },
  { id: "2", type: "shopping", amount: 12350, currency: "NGN", status: "completed", reference: "TXN002", createdAt: new Date().toISOString(), counterparty: "Shoprite Mall", direction: "sent" },
  { id: "3", type: "send", amount: 75000, currency: "NGN", status: "completed", reference: "TXN003", createdAt: new Date().toISOString(), counterparty: "@emeka", direction: "sent" },
];

const TransactionList = ({ transactions = defaultTransactions }: TransactionListProps) => {
  const navigate = useNavigate();

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatAmount = (amount: number, direction: string) => {
    const prefix = direction === "received" ? "+" : "-";
    return `${prefix}₦${amount.toLocaleString()}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Recent Transactions</h3>
        <button 
          onClick={() => navigate("/transactions")}
          className="text-sm font-medium text-primary hover:underline"
        >
          View All
        </button>
      </div>
      <div className="space-y-2">
        {transactions.map((tx, i) => {
          const Icon = getIcon(tx.type);
          return (
            <motion.div
              key={tx.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              className="flex items-center gap-4 rounded-xl bg-card border border-border p-4 shadow-card transition-all hover:shadow-elevated"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tx.direction === "received" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {tx.direction === "received" ? "From " : "To "}@{tx.counterparty}
                </p>
                <p className="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</p>
              </div>
              <span className={`text-sm font-semibold ${tx.direction === "received" ? "text-primary" : "text-foreground"}`}>
                {formatAmount(tx.amount, tx.direction)}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default TransactionList;
