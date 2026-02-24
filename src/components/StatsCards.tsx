import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";

const stats = [
  { label: "Income", value: "₦630,000", change: "+8.2%", trend: "up", icon: TrendingUp },
  { label: "Expenses", value: "₦115,850", change: "-3.1%", trend: "down", icon: TrendingDown },
  { label: "Savings", value: "₦1,200,000", change: "+15%", trend: "up", icon: DollarSign },
];

const StatsCards = () => {
  return (
    <div className="grid grid-cols-3 gap-4">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + i * 0.08, duration: 0.4 }}
          className="rounded-2xl bg-card border border-border p-5 shadow-card"
        >
          <div className="flex items-center justify-between mb-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${stat.trend === "up" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
              <stat.icon className="h-4.5 w-4.5" />
            </div>
            <span className={`text-xs font-semibold ${stat.trend === "up" ? "text-primary" : "text-destructive"}`}>
              {stat.change}
            </span>
          </div>
          <p className="text-2xl font-bold text-foreground">{stat.value}</p>
          <p className="text-xs text-muted-foreground mt-1">{stat.label} this month</p>
        </motion.div>
      ))}
    </div>
  );
};

export default StatsCards;
