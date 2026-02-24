import { motion } from "framer-motion";
import { CreditCard, Plus, Lock, Eye, EyeOff, Snowflake, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import AppSidebar from "@/components/AppSidebar";
import DashboardHeader from "@/components/DashboardHeader";

const cards = [
  { id: 1, type: "Virtual", last4: "4523", expiry: "12/27", balance: "₦2,847,500", color: "gradient-card", status: "active" },
  { id: 2, type: "Physical", last4: "8891", expiry: "06/28", balance: "₦1,200,000", color: "gradient-brand", status: "active" },
];

const Cards = () => {
  const [showDetails, setShowDetails] = useState<Record<number, boolean>>({});

  const toggleDetails = (id: number) => {
    setShowDetails((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 ml-64 px-8 pb-8">
        <DashboardHeader />
        <div className="max-w-3xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Cards</h2>
              <p className="text-muted-foreground text-sm mt-1">Manage your virtual and physical cards</p>
            </div>
            <Button className="rounded-xl gradient-brand text-primary-foreground font-semibold border-0 hover:opacity-90">
              <Plus className="h-4 w-4 mr-1" /> New Card
            </Button>
          </div>

          <div className="grid gap-6">
            {cards.map((card, i) => (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="rounded-2xl overflow-hidden shadow-elevated"
              >
                {/* Card visual */}
                <div className={`${card.color} p-6 text-primary-foreground relative`}>
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      <span className="text-sm font-medium opacity-80">{card.type} Card</span>
                    </div>
                    <span className="text-xl font-bold tracking-tight">Vura</span>
                  </div>
                  <p className="text-2xl font-mono tracking-widest mb-4">
                    {showDetails[card.id] ? `•••• •••• •••• ${card.last4}` : "•••• •••• •••• ••••"}
                  </p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs opacity-60">Balance</p>
                      <p className="text-lg font-bold">{showDetails[card.id] ? card.balance : "₦•••••••"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs opacity-60">Expires</p>
                      <p className="text-sm font-medium">{card.expiry}</p>
                    </div>
                  </div>
                </div>

                {/* Card actions */}
                <div className="bg-card border border-border border-t-0 p-4 flex gap-2">
                  <Button variant="outline" size="sm" className="rounded-lg" onClick={() => toggleDetails(card.id)}>
                    {showDetails[card.id] ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                    {showDetails[card.id] ? "Hide" : "Show"} Details
                  </Button>
                  <Button variant="outline" size="sm" className="rounded-lg">
                    <Snowflake className="h-3.5 w-3.5 mr-1" /> Freeze
                  </Button>
                  <Button variant="outline" size="sm" className="rounded-lg">
                    <Lock className="h-3.5 w-3.5 mr-1" /> PIN
                  </Button>
                  <Button variant="outline" size="sm" className="rounded-lg text-destructive hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Cards;
