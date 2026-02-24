import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownLeft, ShoppingCart, Coffee, Fuel } from "lucide-react";

const transactions = [
  { id: 1, icon: ArrowDownLeft, name: "Salary - Dangote Ltd", amount: "+₦450,000.00", date: "Today, 9:30 AM", type: "credit" },
  { id: 2, icon: ShoppingCart, name: "Shoprite Mall", amount: "-₦12,350.00", date: "Today, 2:15 PM", type: "debit" },
  { id: 3, icon: ArrowUpRight, name: "Transfer to Emeka", amount: "-₦75,000.00", date: "Yesterday", type: "debit" },
  { id: 4, icon: Coffee, name: "Cafe Neo", amount: "-₦3,500.00", date: "Yesterday", type: "debit" },
  { id: 5, icon: ArrowDownLeft, name: "Freelance Payment", amount: "+₦180,000.00", date: "Feb 21", type: "credit" },
  { id: 6, icon: Fuel, name: "NNPC Filling Station", amount: "-₦25,000.00", date: "Feb 20", type: "debit" },
];

const TransactionList = () => {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Recent Transactions</h3>
        <button className="text-sm font-medium text-primary hover:underline">View All</button>
      </div>
      <div className="space-y-2">
        {transactions.map((tx, i) => (
          <motion.div
            key={tx.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04, duration: 0.3 }}
            className="flex items-center gap-4 rounded-xl bg-card border border-border p-4 shadow-card transition-all hover:shadow-elevated"
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tx.type === "credit" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
              <tx.icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{tx.name}</p>
              <p className="text-xs text-muted-foreground">{tx.date}</p>
            </div>
            <span className={`text-sm font-semibold ${tx.type === "credit" ? "text-primary" : "text-foreground"}`}>
              {tx.amount}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default TransactionList;
