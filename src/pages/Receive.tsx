import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Copy, CheckCircle, QrCode, Share2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AppSidebar from "@/components/AppSidebar";
import DashboardHeader from "@/components/DashboardHeader";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import QRCode from "qrcode";

const Receive = () => {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [requestAmount, setRequestAmount] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [paymentLink, setPaymentLink] = useState<string>("");
  const tag = user?.vuraTag ? `@${user.vuraTag}` : "@user";

  // Generate QR code when user changes
  useEffect(() => {
    if (user?.vuraTag) {
      const baseUrl = window.location.origin;
      const qrData = `${baseUrl}/send?to=${user.vuraTag}`;
      
      QRCode.toDataURL(qrData, {
        width: 256,
        margin: 2,
        color: {
          dark: "#10b981",
          light: "#ffffff",
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error("QR generation failed:", err));
    }
  }, [user]);

  const handleCopy = () => {
    navigator.clipboard.writeText(tag);
    setCopied(true);
    toast({ title: "Copied!", description: "Your tag has been copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateLink = () => {
    if (!user?.vuraTag) return;
    
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/send?to=${user.vuraTag}${requestAmount ? `&amount=${requestAmount}` : ""}`;
    setPaymentLink(link);
    
    navigator.clipboard.writeText(link);
    toast({ 
      title: "Payment Link Generated!", 
      description: "Link copied to clipboard. Share it to receive payment." 
    });
  };

  const handleShare = async () => {
    const shareData = {
      title: "Send me money on Vura",
      text: `Send money to ${tag} on Vura - the easiest way to pay!`,
      url: paymentLink || `${window.location.origin}/send?to=${user?.vuraTag}`,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.log("Share cancelled");
      }
    } else {
      handleCopy();
    }
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
            <div className="flex h-48 w-48 mx-auto items-center justify-center rounded-2xl bg-white p-3 mb-6">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Payment QR Code" className="h-full w-full" />
              ) : (
                <QrCode className="h-16 w-16 opacity-80" />
              )}
            </div>
            <p className="text-sm opacity-70 mb-1">Your Vura Tag</p>
            <p className="text-3xl font-bold mb-4">{tag}</p>
            <p className="text-xs opacity-60 mb-4">Scan to send money instantly</p>
            <div className="flex justify-center gap-3">
              <Button onClick={handleCopy} variant="outline" className="rounded-xl bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground">
                {copied ? <CheckCircle className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                {copied ? "Copied" : "Copy Tag"}
              </Button>
              <Button onClick={handleShare} variant="outline" className="rounded-xl bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground">
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
            <Button 
              onClick={handleGenerateLink} 
              disabled={!requestAmount} 
              className="w-full h-12 rounded-xl gradient-brand text-primary-foreground font-semibold border-0 hover:opacity-90"
            >
              <Link2 className="h-4 w-4 mr-2" />
              Generate Payment Link
            </Button>
            
            {paymentLink && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="p-3 bg-primary/10 rounded-xl"
              >
                <p className="text-xs text-muted-foreground mb-1">Payment link copied!</p>
                <p className="text-sm font-medium text-primary truncate">{paymentLink}</p>
              </motion.div>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default Receive;
