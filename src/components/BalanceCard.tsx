import { ArrowUpRight, ArrowDownLeft, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import vuraCard from "@/assets/vura-card.png";

interface BalanceCardProps {
  ngnBalance?: number;
  usdtBalance?: number;
  loading?: boolean;
}

const BalanceCard = ({ ngnBalance = 0, usdtBalance = 0, loading = false }: BalanceCardProps) => {
  const [showBalance, setShowBalance] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  const formatAmount = (amount: number) => {
    // Ensure amount is a valid number
    const validAmount = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
    return validAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-2xl gradient-card p-6 text-primary-foreground shadow-elevated"
    >
      <img
        src={vuraCard}
        alt=""
        className="absolute right-[-60px] top-[-30px] h-52 w-auto opacity-30 rotate-12 pointer-events-none"
      />
      
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-sm opacity-70">Total Balance</p>
            <div className="flex items-center gap-2 mt-1">
              <h2 className="text-3xl font-bold tracking-tight">
                {loading ? "..." : showBalance ? `₦${formatAmount(ngnBalance)}` : "₦•••••••"}
              </h2>
              <button
                onClick={() => setShowBalance(!showBalance)}
                className="opacity-60 hover:opacity-100 transition-opacity"
              >
                {showBalance ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {usdtBalance > 0 && (
              <p className="text-sm opacity-70 mt-1">
                USDT: {showBalance ? `$${formatAmount(usdtBalance)}` : "$••••"}
              </p>
            )}
            {user && user.vuraTag && (
              <p className="text-xs opacity-50 mt-2">@{user.vuraTag}</p>
            )}
          </div>
          {ngnBalance > 0 && (
            <div className="flex h-10 items-center gap-1 rounded-full bg-primary/20 px-3 text-xs font-medium">
              <ArrowUpRight className="h-3.5 w-3.5" />
              Active
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button 
            onClick={() => navigate("/send")}
            className="flex items-center gap-2 rounded-xl gradient-brand px-5 py-2.5 text-sm font-semibold transition-all hover:opacity-90 border-0"
          >
            <ArrowUpRight className="h-4 w-4" />
            Send
          </button>
          <button 
            onClick={() => navigate("/receive")}
            className="flex items-center gap-2 rounded-xl bg-primary-foreground/10 backdrop-blur-sm px-5 py-2.5 text-sm font-semibold transition-all hover:bg-primary-foreground/20 border-0"
          >
            <ArrowDownLeft className="h-4 w-4" />
            Receive
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default BalanceCard;
