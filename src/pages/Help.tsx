import { motion } from "framer-motion";
import { Search, MessageCircle, Phone, Mail, ChevronRight, HelpCircle, Shield, CreditCard, ArrowRightLeft } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import AppSidebar from "@/components/AppSidebar";
import DashboardHeader from "@/components/DashboardHeader";

const faqs = [
  { q: "How do I send money?", a: "Navigate to Send Money, enter the recipient's @tag or email, type the amount, and confirm. Transfers within Vura are instant.", icon: ArrowRightLeft },
  { q: "What are the tier limits?", a: "Tier 1: ₦50k/day send. Tier 2 (BVN verified): ₦200k/day. Tier 3 (BVN + NIN): ₦5M/day. Upgrade anytime in Settings.", icon: Shield },
  { q: "How do I get a virtual card?", a: "Go to Cards and tap 'New Card'. Virtual cards are issued instantly and can be used for online purchases worldwide.", icon: CreditCard },
  { q: "What happens if I'm flagged for fraud?", a: "Your transaction will be reviewed within 16 days per CBN guidelines. You'll receive updates and can contact support anytime.", icon: HelpCircle },
];

const Help = () => {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const filtered = faqs.filter((f) => f.q.toLowerCase().includes(search.toLowerCase()) || f.a.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 ml-64 px-8 pb-8">
        <DashboardHeader />
        <div className="max-w-2xl">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-foreground">Help & Support</h2>
            <p className="text-muted-foreground text-sm mt-1">Find answers or get in touch</p>
          </div>

          {/* Search */}
          <div className="relative mb-8">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search for help..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-11 h-12 rounded-xl" />
          </div>

          {/* Contact Options */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              { icon: MessageCircle, label: "Live Chat", desc: "Online now", color: "bg-primary/10 text-primary" },
              { icon: Phone, label: "Call Us", desc: "0800-VURA", color: "bg-accent/10 text-accent-foreground" },
              { icon: Mail, label: "Email", desc: "help@vura.ng", color: "bg-secondary text-muted-foreground" },
            ].map((c, i) => (
              <motion.button
                key={c.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="flex flex-col items-center gap-2 rounded-2xl bg-card border border-border p-5 shadow-card hover:shadow-elevated transition-all"
              >
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${c.color}`}>
                  <c.icon className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium text-foreground">{c.label}</span>
                <span className="text-xs text-muted-foreground">{c.desc}</span>
              </motion.button>
            ))}
          </div>

          {/* FAQs */}
          <h3 className="text-lg font-semibold text-foreground mb-4">Frequently Asked Questions</h3>
          <div className="space-y-2">
            {filtered.map((faq, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl bg-card border border-border shadow-card overflow-hidden"
              >
                <button
                  onClick={() => setExpanded(expanded === i ? null : i)}
                  className="flex w-full items-center gap-3 p-4 text-left hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                    <faq.icon className="h-4 w-4" />
                  </div>
                  <span className="flex-1 text-sm font-medium text-foreground">{faq.q}</span>
                  <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expanded === i ? "rotate-90" : ""}`} />
                </button>
                {expanded === i && (
                  <div className="px-4 pb-4 pl-16 text-sm text-muted-foreground">{faq.a}</div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Help;
