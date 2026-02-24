import { ArrowUpRight, ArrowDownLeft, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";
import vuraCard from "@/assets/vura-card.png";

const BalanceCard = () => {
  const [showBalance, setShowBalance] = useState(true);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-2xl gradient-card p-6 text-primary-foreground shadow-elevated"
    >
      {/* Card image background */}
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
                {showBalance ? "₦2,847,500.00" : "₦•••••••"}
              </h2>
              <button
                onClick={() => setShowBalance(!showBalance)}
                className="opacity-60 hover:opacity-100 transition-opacity"
              >
                {showBalance ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>
          <div className="flex h-10 items-center gap-1 rounded-full bg-primary/20 px-3 text-xs font-medium">
            <ArrowUpRight className="h-3.5 w-3.5" />
            +12.5%
          </div>
        </div>

        <div className="flex gap-3">
          <button className="flex items-center gap-2 rounded-xl gradient-brand px-5 py-2.5 text-sm font-semibold transition-all hover:opacity-90">
            <ArrowUpRight className="h-4 w-4" />
            Send
          </button>
          <button className="flex items-center gap-2 rounded-xl bg-primary-foreground/10 backdrop-blur-sm px-5 py-2.5 text-sm font-semibold transition-all hover:bg-primary-foreground/20">
            <ArrowDownLeft className="h-4 w-4" />
            Receive
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default BalanceCard;
