import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AppSidebar from "@/components/AppSidebar";
import DashboardHeader from "@/components/DashboardHeader";

const SendMoney = () => {
  const [step, setStep] = useState<"form" | "confirm" | "success">("form");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const fee = amount ? Math.max(10, Number(amount) * 0.005) : 0;
  const total = Number(amount) + fee;

  const handleSend = () => {
    setStep("success");
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 ml-64 px-8 pb-8">
        <DashboardHeader />
        <div className="max-w-lg mx-auto">
          {step === "form" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-foreground">Send Money</h2>
                <p className="text-muted-foreground text-sm mt-1">Transfer funds instantly to any Vura user</p>
              </div>

              <div className="rounded-2xl bg-card border border-border p-6 shadow-card space-y-5">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Recipient @tag or email</label>
                  <Input placeholder="@emeka or emeka@email.com" value={recipient} onChange={(e) => setRecipient(e.target.value)} className="h-12 rounded-xl" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Amount (₦)</label>
                  <Input type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-14 rounded-xl text-2xl font-bold" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Description (optional)</label>
                  <Input placeholder="What's this for?" value={description} onChange={(e) => setDescription(e.target.value)} className="h-12 rounded-xl" />
                </div>

                {amount && Number(amount) > 0 && (
                  <div className="rounded-xl bg-secondary p-4 space-y-2 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Transfer fee</span>
                      <span>₦{fee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-foreground">
                      <span>Total</span>
                      <span>₦{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                )}

                <Button onClick={() => setStep("confirm")} disabled={!recipient || !amount || Number(amount) <= 0} className="w-full h-12 rounded-xl gradient-brand text-primary-foreground font-semibold border-0 hover:opacity-90">
                  Continue
                </Button>
              </div>
            </motion.div>
          )}

          {step === "confirm" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <h2 className="text-2xl font-bold text-foreground">Confirm Transfer</h2>

              <div className="rounded-2xl bg-card border border-border p-6 shadow-card space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-xl bg-secondary">
                  <AlertTriangle className="h-5 w-5 text-accent" />
                  <p className="text-sm text-muted-foreground">Please verify the recipient details before confirming.</p>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">To</span><span className="font-medium text-foreground">{recipient}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-medium text-foreground">₦{Number(amount).toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Fee</span><span className="font-medium text-foreground">₦{fee.toFixed(2)}</span></div>
                  <hr className="border-border" />
                  <div className="flex justify-between text-base"><span className="font-semibold text-foreground">Total</span><span className="font-bold text-foreground">₦{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep("form")} className="flex-1 h-12 rounded-xl">Back</Button>
                  <Button onClick={handleSend} className="flex-1 h-12 rounded-xl gradient-brand text-primary-foreground font-semibold border-0 hover:opacity-90">
                    <ArrowUpRight className="h-4 w-4 mr-1" /> Send ₦{Number(amount).toLocaleString()}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {step === "success" && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-6 py-12">
              <div className="flex justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                  <CheckCircle className="h-10 w-10 text-primary" />
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">Transfer Successful!</h2>
                <p className="text-muted-foreground mt-2">₦{Number(amount).toLocaleString()} sent to {recipient}</p>
              </div>
              <Button onClick={() => { setStep("form"); setRecipient(""); setAmount(""); setDescription(""); }} className="rounded-xl gradient-brand text-primary-foreground border-0 hover:opacity-90 h-12 px-8">
                Send Another
              </Button>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
};

export default SendMoney;
