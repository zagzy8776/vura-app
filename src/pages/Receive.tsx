import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, CheckCircle, QrCode, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AppSidebar from "@/components/AppSidebar";
import DashboardHeader from "@/components/DashboardHeader";
import { toast } from "@/hooks/use-toast";

const Receive = () => {
  const [copied, setCopied] = useState(false);
  const [requestAmount, setRequestAmount] = useState("");
  const tag = "@adaeze";

  const handleCopy = () => {
    navigator.clipboard.writeText(tag);
    setCopied(true);
    toast({ title: "Copied!", description: "Your tag has been copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 ml-64 px-8 pb-8">
        <DashboardHeader />
        <div className="max-w-lg mx-auto space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Receive Money</h2>
            <p className="text-muted-foreground text-sm mt-1">Share your tag or request payment</p>
          </div>

          {/* QR / Tag Card */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl gradient-card p-8 text-center text-primary-foreground shadow-elevated">
            <div className="flex h-32 w-32 mx-auto items-center justify-center rounded-2xl bg-primary-foreground/10 backdrop-blur-sm mb-6">
              <QrCode className="h-16 w-16 opacity-80" />
            </div>
            <p className="text-sm opacity-70 mb-1">Your Vura Tag</p>
            <p className="text-3xl font-bold mb-4">{tag}</p>
            <div className="flex justify-center gap-3">
              <Button onClick={handleCopy} variant="outline" className="rounded-xl bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground">
                {copied ? <CheckCircle className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                {copied ? "Copied" : "Copy Tag"}
              </Button>
              <Button variant="outline" className="rounded-xl bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground">
                <Share2 className="h-4 w-4 mr-1" /> Share
              </Button>
            </div>
          </motion.div>

          {/* Request Payment */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-2xl bg-card border border-border p-6 shadow-card space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Request Payment</h3>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Amount (₦)</label>
              <Input type="number" placeholder="0.00" value={requestAmount} onChange={(e) => setRequestAmount(e.target.value)} className="h-12 rounded-xl text-xl font-bold" />
            </div>
            <Button disabled={!requestAmount} className="w-full h-12 rounded-xl gradient-brand text-primary-foreground font-semibold border-0 hover:opacity-90">
              Generate Payment Link
            </Button>
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default Receive;
