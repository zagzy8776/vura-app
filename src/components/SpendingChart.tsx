import { motion } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const data = [
  { name: "Jan", income: 520000, expenses: 180000 },
  { name: "Feb", income: 480000, expenses: 150000 },
  { name: "Mar", income: 630000, expenses: 200000 },
  { name: "Apr", income: 550000, expenses: 170000 },
  { name: "May", income: 690000, expenses: 220000 },
  { name: "Jun", income: 610000, expenses: 190000 },
  { name: "Jul", income: 720000, expenses: 160000 },
];

const SpendingChart = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.4 }}
      className="rounded-2xl bg-card border border-border p-6 shadow-card"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-foreground">Cash Flow</h3>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Income
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Expenses
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(43, 96%, 56%)" stopOpacity={0.2} />
              <stop offset="100%" stopColor="hsl(43, 96%, 56%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 16%, 90%)" vertical={false} />
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(220, 10%, 46%)" }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(220, 10%, 46%)" }} tickFormatter={(v) => `₦${v / 1000}k`} />
          <Tooltip
            contentStyle={{
              background: "hsl(220, 25%, 7%)",
              border: "none",
              borderRadius: "12px",
              color: "white",
              fontSize: "12px",
            }}
            formatter={(value: number) => [`₦${value.toLocaleString()}`, ""]}
          />
          <Area type="monotone" dataKey="income" stroke="hsl(160, 84%, 39%)" fill="url(#incomeGrad)" strokeWidth={2.5} />
          <Area type="monotone" dataKey="expenses" stroke="hsl(43, 96%, 56%)" fill="url(#expenseGrad)" strokeWidth={2.5} />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

export default SpendingChart;
