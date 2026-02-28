import { motion } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface Transaction {
  id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  direction: string;
  createdAt: string;
}

interface SpendingChartProps {
  transactions?: Transaction[];
}

const SpendingChart = ({ transactions = [] }: SpendingChartProps) => {
  // Calculate monthly data from real transactions
  const calculateMonthlyData = () => {
    // Validate transactions array
    if (!Array.isArray(transactions)) {
      console.warn("SpendingChart: transactions is not an array");
      return [];
    }

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthlyData = months.map((month) => ({ name: month, income: 0, expenses: 0 }));

    transactions.forEach((tx) => {
      if (!tx || tx.status !== "COMPLETED") return;
      
      try {
        const txDate = new Date(tx.createdAt);
        if (isNaN(txDate.getTime())) return;
        
        const monthIndex = txDate.getMonth();
        
        const amount = typeof tx.amount === 'number' && !isNaN(tx.amount) ? tx.amount : 0;
        
        if (tx.direction === "incoming") {
          monthlyData[monthIndex].income += amount;
        } else if (tx.direction === "outgoing") {
          monthlyData[monthIndex].expenses += amount;
        }
      } catch (e) {
        console.warn("Invalid transaction in SpendingChart:", tx);
      }
    });

    // Return last 6 months with data, or all months if less data
    const currentMonth = new Date().getMonth();
    const last6Months = [];
    for (let i = 5; i >= 0; i--) {
      const monthIndex = (currentMonth - i + 12) % 12;
      last6Months.push(monthlyData[monthIndex]);
    }
    
    return last6Months;
  };

  const data = calculateMonthlyData();
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
