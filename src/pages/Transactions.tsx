import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, ArrowUpRight, ArrowDownLeft, ShoppingCart, Coffee, Fuel, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AppSidebar from "@/components/AppSidebar";
import DashboardHeader from "@/components/DashboardHeader";
import { apiFetch } from "@/hooks/useAuth";

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

const filters = ["All", "Sent", "Received", "Pending", "Flagged"];

const Transactions = () => {
  const [activeFilter, setActiveFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const res = await apiFetch("/transactions?limit=50");
        if (res.ok) {
          const data = await res.json();
          setTransactions(data);
        }
      } catch (error) {
        console.error("Failed to fetch transactions:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, []);

  const filtered = transactions
    .filter((tx) => {
      if (activeFilter === "Sent") return tx.direction === "sent";
      if (activeFilter === "Received") return tx.direction === "received";
      if (activeFilter === "Pending") return tx.status === "PENDING";
      if (activeFilter === "Flagged") return tx.status === "FLAGGED";
      return true;
    })
    .filter((tx) => tx.counterparty?.toLowerCase().includes(search.toLowerCase()));

  const getIcon = (type: string) => {
    if (type === "send" || type === "debit") return ArrowUpRight;
    if (type === "receive" || type === "credit") return ArrowDownLeft;
    if (type === "shopping") return ShoppingCart;
    if (type === "food" || type === "coffee") return Coffee;
    if (type === "fuel") return Fuel;
    return type === "received" ? ArrowDownLeft : ArrowUpRight;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 ml-64 px-8 pb-8">
        <DashboardHeader />
        <div className="max-w-3xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Transactions</h2>
              <p className="text-muted-foreground text-sm mt-1">Your complete transaction history</p>
            </div>
            <Button variant="outline" className="rounded-xl">
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          </div>

          {/* Search & Filters */}
          <div className="flex gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search transactions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-11 rounded-xl"
              />
            </div>
          </div>

          <div className="flex gap-2 mb-6">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  activeFilter === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Transaction List */}
          <div className="space-y-2">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No transactions found</div>
            ) : (
              filtered.map((tx, i) => {
                const Icon = getIcon(tx.type);
                return (
                  <motion.div
                    key={tx.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-center gap-4 rounded-xl bg-card border border-border p-4 shadow-card hover:shadow-elevated transition-all"
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
                    <div className="text-right">
                      <span className={`text-sm font-semibold ${tx.direction === "received" ? "text-primary" : "text-foreground"}`}>
                        {tx.direction === "received" ? "+" : "-"}₦{tx.amount.toLocaleString()}
                      </span>
                      {tx.status !== "SUCCESS" && (
                        <span className={`block text-[10px] font-medium mt-0.5 ${tx.status === "PENDING" ? "text-accent" : "text-destructive"}`}>
                          {tx.status}
                        </span>
                      )}
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Transactions;
