import { useState, useEffect } from "react";
import { Bell, Search, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { useAuth, apiFetch } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TxItem {
  id: string;
  amount: number;
  direction: string;
  counterparty: string;
  createdAt: string;
}

const systemLabels = ["Bills", "Airtime", "Data", "Electricity", "deposit", "external_transfer"];
const formatCounterparty = (c: string, direction: string) => {
  if (!c) return direction === "received" ? "Someone" : "—";
  const isSystem = systemLabels.some((l) => c.toLowerCase().includes(l.toLowerCase()));
  return isSystem || c.startsWith("@") ? c : `@${c}`;
};

const DashboardHeader = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [recentTx, setRecentTx] = useState<TxItem[]>([]);
  const [activityOpen, setActivityOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/transactions?limit=5");
        if (!cancelled && res.ok) {
          const data = await res.json();
          setRecentTx(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) setRecentTx([]);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const getInitials = (tag: string) => tag.slice(0, 2).toUpperCase();

  return (
    <header className="flex items-center justify-between py-4 sm:py-6 pl-14 lg:pl-0 safe-area-top">
      <div className="min-w-0 flex-1">
        <h1 className="text-lg sm:text-2xl font-bold text-foreground truncate">
          Welcome back, {user ? `@${user.vuraTag}` : "Guest"} 👋
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 hidden sm:block">Here's what's happening with your finances</p>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 ml-2 shrink-0">
        <button className="hidden sm:flex h-10 w-10 items-center justify-center rounded-xl bg-card border border-border shadow-card transition-colors hover:bg-secondary">
          <Search className="h-4.5 w-4.5 text-muted-foreground" />
        </button>
        <DropdownMenu open={activityOpen} onOpenChange={setActivityOpen}>
          <DropdownMenuTrigger asChild>
            <button className="relative flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-card border border-border shadow-card transition-colors hover:bg-secondary">
              <Bell className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-muted-foreground" />
              <span className="absolute right-1.5 top-1.5 sm:right-2 sm:top-2 h-2 w-2 rounded-full bg-primary" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72 sm:w-80">
            <div className="px-2 py-1.5 text-sm font-semibold text-foreground">Recent activity</div>
            {recentTx.length === 0 ? (
              <div className="px-2 py-4 text-sm text-muted-foreground">No recent transactions</div>
            ) : (
              recentTx.map((tx) => (
                <DropdownMenuItem
                  key={tx.id}
                  className="flex items-center gap-2 py-2 cursor-pointer"
                  onSelect={() => { setActivityOpen(false); navigate("/transactions"); }}
                >
                  <div className={`shrink-0 flex h-8 w-8 items-center justify-center rounded-lg ${tx.direction === "received" ? "bg-primary/10 text-primary" : "bg-muted"}`}>
                    {tx.direction === "received" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">
                      {tx.direction === "received"
                        ? `${formatCounterparty(tx.counterparty || "", tx.direction)} sent you ₦${Number(tx.amount).toLocaleString()}`
                        : `You sent ₦${Number(tx.amount).toLocaleString()} to ${formatCounterparty(tx.counterparty || "", tx.direction)}`}
                    </p>
                    <p className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString()}</p>
                  </div>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuItem className="text-primary font-medium justify-center" onSelect={() => { setActivityOpen(false); navigate("/transactions"); }}>
              View all transactions
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl gradient-brand text-primary-foreground font-semibold text-xs sm:text-sm">
          {user ? getInitials(user.vuraTag) : "??"}
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
