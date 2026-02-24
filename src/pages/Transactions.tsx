import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Filter, ArrowUpRight, ArrowDownLeft, ShoppingCart, Coffee, Fuel, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AppSidebar from "@/components/AppSidebar";
import DashboardHeader from "@/components/DashboardHeader";

const allTransactions = [
  { id: 1, icon: ArrowDownLeft, name: "Salary - Dangote Ltd", amount: "+₦450,000.00", date: "Feb 24, 9:30 AM", type: "credit", status: "completed" },
  { id: 2, icon: ShoppingCart, name: "Shoprite Mall", amount: "-₦12,350.00", date: "Feb 24, 2:15 PM", type: "debit", status: "completed" },
  { id: 3, icon: ArrowUpRight, name: "Transfer to @emeka", amount: "-₦75,000.00", date: "Feb 23, 11:00 AM", type: "debit", status: "completed" },
  { id: 4, icon: Coffee, name: "Cafe Neo", amount: "-₦3,500.00", date: "Feb 23, 3:45 PM", type: "debit", status: "completed" },
  { id: 5, icon: ArrowDownLeft, name: "Freelance Payment", amount: "+₦180,000.00", date: "Feb 21, 10:20 AM", type: "credit", status: "completed" },
  { id: 6, icon: Fuel, name: "NNPC Filling Station", amount: "-₦25,000.00", date: "Feb 20, 7:15 AM", type: "debit", status: "completed" },
  { id: 7, icon: ArrowUpRight, name: "Transfer to @chioma", amount: "-₦50,000.00", date: "Feb 19, 4:00 PM", type: "debit", status: "pending" },
  { id: 8, icon: ArrowDownLeft, name: "Refund - Jumia", amount: "+₦15,600.00", date: "Feb 18, 1:30 PM", type: "credit", status: "completed" },
  { id: 9, icon: ShoppingCart, name: "Amazon Purchase", amount: "-₦42,000.00", date: "Feb 17, 6:20 PM", type: "debit", status: "flagged" },
  { id: 10, icon: ArrowDownLeft, name: "Payment from @tunde", amount: "+₦200,000.00", date: "Feb 16, 9:00 AM", type: "credit", status: "completed" },
];

const filters = ["All", "Sent", "Received", "Pending", "Flagged"];

const Transactions = () => {
  const [activeFilter, setActiveFilter] = useState("All");
  const [search, setSearch] = useState("");

  const filtered = allTransactions.filter((tx) => {
    if (activeFilter === "Sent") return tx.type === "debit";
    if (activeFilter === "Received") return tx.type === "credit";
    if (activeFilter === "Pending") return tx.status === "pending";
    if (activeFilter === "Flagged") return tx.status === "flagged";
    return true;
  }).filter((tx) => tx.name.toLowerCase().includes(search.toLowerCase()));

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
              <Input placeholder="Search transactions..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-11 rounded-xl" />
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
            {filtered.map((tx, i) => (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-4 rounded-xl bg-card border border-border p-4 shadow-card hover:shadow-elevated transition-all"
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tx.type === "credit" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                  <tx.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{tx.name}</p>
                  <p className="text-xs text-muted-foreground">{tx.date}</p>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-semibold ${tx.type === "credit" ? "text-primary" : "text-foreground"}`}>
                    {tx.amount}
                  </span>
                  {tx.status !== "completed" && (
                    <span className={`block text-[10px] font-medium mt-0.5 ${tx.status === "pending" ? "text-accent" : "text-destructive"}`}>
                      {tx.status.toUpperCase()}
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">No transactions found</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Transactions;
