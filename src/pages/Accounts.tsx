import { motion } from "framer-motion";
import { Wallet, Plus, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppSidebar from "@/components/AppSidebar";
import DashboardHeader from "@/components/DashboardHeader";

const accounts = [
  { currency: "NGN", name: "Nigerian Naira", symbol: "₦", balance: 2847500, flag: "🇳🇬", dailyLimit: 5000000, spent: 87350 },
  { currency: "GHS", name: "Ghanaian Cedi", symbol: "₵", balance: 45200, flag: "🇬🇭", dailyLimit: 500000, spent: 12000 },
  { currency: "USD", name: "US Dollar", symbol: "$", balance: 1250, flag: "🇺🇸", dailyLimit: 10000, spent: 0 },
  { currency: "XAF", name: "Central African CFA", symbol: "FCFA", balance: 380000, flag: "🇨🇲", dailyLimit: 2000000, spent: 50000 },
];

const Accounts = () => {
  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 ml-64 px-8 pb-8">
        <DashboardHeader />
        <div className="max-w-3xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Accounts</h2>
              <p className="text-muted-foreground text-sm mt-1">Manage your multi-currency wallets</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-xl">
                <ArrowRightLeft className="h-4 w-4 mr-1" /> Convert
              </Button>
              <Button className="rounded-xl gradient-brand text-primary-foreground font-semibold border-0 hover:opacity-90">
                <Plus className="h-4 w-4 mr-1" /> Add Currency
              </Button>
            </div>
          </div>

          {/* Total Balance */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl gradient-card p-6 text-primary-foreground shadow-elevated mb-6">
            <p className="text-sm opacity-70">Total Balance (NGN equivalent)</p>
            <p className="text-3xl font-bold mt-1">₦3,542,700.00</p>
            <p className="text-xs opacity-50 mt-1">Across {accounts.length} currencies</p>
          </motion.div>

          {/* Account Cards */}
          <div className="grid gap-4">
            {accounts.map((acc, i) => {
              const limitPct = (acc.spent / acc.dailyLimit) * 100;
              return (
                <motion.div
                  key={acc.currency}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="rounded-2xl bg-card border border-border p-5 shadow-card hover:shadow-elevated transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-3xl">{acc.flag}</div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-foreground">{acc.name}</p>
                          <p className="text-xs text-muted-foreground">{acc.currency}</p>
                        </div>
                        <p className="text-xl font-bold text-foreground">
                          {acc.symbol}{acc.balance.toLocaleString()}
                        </p>
                      </div>
                      {/* Daily limit bar */}
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Daily limit used</span>
                          <span>{acc.symbol}{acc.spent.toLocaleString()} / {acc.symbol}{acc.dailyLimit.toLocaleString()}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-secondary">
                          <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${Math.min(limitPct, 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Accounts;
