import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownLeft, Smartphone, Zap, Wifi, CreditCard, Bitcoin } from "lucide-react";
import { useNavigate } from "react-router-dom";

const QuickActions = () => {
  const navigate = useNavigate();

  const actions = [
    { icon: ArrowUpRight, label: "Send", color: "bg-primary/10 text-primary", onClick: () => navigate("/send") },
    { icon: ArrowDownLeft, label: "Receive", color: "bg-accent/10 text-accent-foreground", onClick: () => navigate("/receive") },
    { icon: Bitcoin, label: "Crypto", color: "bg-orange-500/10 text-orange-500", onClick: () => navigate("/crypto-deposit") },
    { icon: Smartphone, label: "Airtime", color: "bg-destructive/10 text-destructive", onClick: () => {} },
    { icon: Zap, label: "Electricity", color: "bg-accent/10 text-accent-foreground", onClick: () => {} },
    { icon: Wifi, label: "Internet", color: "bg-primary/10 text-primary", onClick: () => {} },
  ];

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h3>
      <div className="grid grid-cols-3 gap-3">
        {actions.map((action, i) => (
          <motion.button
            key={action.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
            onClick={action.onClick}
            className="flex flex-col items-center gap-2 rounded-2xl bg-card border border-border p-4 shadow-card transition-all hover:shadow-elevated hover:-translate-y-0.5"
          >
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${action.color}`}>
              <action.icon className="h-5 w-5" />
            </div>
            <span className="text-xs font-medium text-foreground">{action.label}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
};

export default QuickActions;
