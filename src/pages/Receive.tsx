import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Copy, CheckCircle, QrCode, Share2, Link2, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AppSidebar from "@/components/AppSidebar";
import DashboardHeader from "@/components/DashboardHeader";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import QRCode from "qrcode";
import { apiFetch } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

type VirtualAccount = {
  accountNumber: string;
  bankName: string;
  accountName: string;
};

const Receive = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [requestAmount, setRequestAmount] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [paymentLink, setPaymentLink] = useState<string>("");
  const [virtualAccount, setVirtualAccount] = useState<VirtualAccount | null>(null);
  const [isMinting, setIsMinting] = useState(false);
  const [needsBvn, setNeedsBvn] = useState(false);
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


  const handleGenerateVirtualAccount = async () => {
    setIsMinting(true);
    setNeedsBvn(false);
    try {
      const res = await apiFetch('/virtual-accounts/create', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        const message = String(data.message || 'Please complete BVN verification first.');
        if (message.toLowerCase().includes('bvn')) {
          setNeedsBvn(true);
        }
        toast({
          title: 'Cannot generate account',
          description: message,
          variant: 'destructive',
        });
        return;
      }

      setVirtualAccount(data.data);
      toast({
        title: 'Account generated',
        description: 'Your permanent Vura bank account is ready.',
      });
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Failed to generate account',
        variant: 'destructive',
      });
    } finally {
      setIsMinting(false);
    }
  };

  // Try to generate/fetch virtual account after BVN is verified (user action still needed if missing)
  useEffect(() => {
    setVirtualAccount(null);
  }, [user?.id]);

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

  const handleCopyAccountNumber = async () => {
    if (!virtualAccount?.accountNumber) return;
    await navigator.clipboard.writeText(virtualAccount.accountNumber);
    toast({ title: 'Copied!', description: 'Account number copied' });
  };

  const handleShareReceiptImage = async () => {
    if (!virtualAccount) return;

    // Create a simple branded receipt on canvas, then share/download
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // background
    const gradient = ctx.createLinearGradient(0, 0, 1080, 1080);
    gradient.addColorStop(0, '#0ea5e9');
    gradient.addColorStop(1, '#10b981');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1080, 1080);

    // card
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.roundRect(90, 150, 900, 780, 40);
    ctx.fill();

    // header
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 72px Inter, system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillText('Vura', 140, 260);
    ctx.font = '500 34px Inter, system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillStyle = '#334155';
    ctx.fillText('Bank Transfer Details', 140, 315);

    const rows = [
      { label: 'Account Number', value: virtualAccount.accountNumber },
      { label: 'Bank Name', value: virtualAccount.bankName },
      { label: 'Account Name', value: virtualAccount.accountName },
      { label: 'Vura Tag', value: tag },
    ];

    let y = 420;
    for (const r of rows) {
      ctx.fillStyle = '#64748b';
      ctx.font = '600 28px Inter, system-ui, -apple-system, Segoe UI, Roboto';
      ctx.fillText(r.label.toUpperCase(), 140, y);
      y += 52;
      ctx.fillStyle = '#0f172a';
      ctx.font = '700 52px Inter, system-ui, -apple-system, Segoe UI, Roboto';
      ctx.fillText(String(r.value), 140, y);
      y += 110;
    }

    ctx.fillStyle = '#475569';
    ctx.font = '500 28px Inter, system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillText('Share this to receive money instantly.', 140, 900);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png', 1),
    );
    if (!blob) return;

    const file = new File([blob], `vura-bank-details-${user?.vuraTag || 'user'}.png`, {
      type: 'image/png',
    });

    // Try native share first
    // @ts-expect-error - Web Share API types vary by browser
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        // @ts-expect-error - Web Share API types vary by browser
        await navigator.share({
          title: 'Vura Bank Details',
          text: 'Use these details to send me money on Vura.',
          files: [file],
        });
        return;
      } catch {
        // user cancelled, fallback to download
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    toast({
      title: 'Saved',
      description: 'Receipt image downloaded. You can share it on WhatsApp.',
    });
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

          {/* Your Vura Bank Account (Flutterwave Virtual Account) */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-2xl bg-card border border-border p-6 shadow-card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Your Vura Bank Account</h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-4 w-4" />
                Instant bank transfers
              </div>
            </div>

            {virtualAccount ? (
              <Card className="border-2 border-primary/30">
                <CardHeader>
                  <CardTitle className="text-base">Bank Transfer Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-xl bg-muted/40 p-4">
                    <p className="text-xs text-muted-foreground">Account Number</p>
                    <p className="text-2xl font-bold tracking-wider text-foreground">
                      {virtualAccount.accountNumber}
                    </p>
                    <p className="text-sm text-muted-foreground">{virtualAccount.bankName}</p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Account Name</p>
                    <p className="font-semibold text-foreground">{virtualAccount.accountName}</p>
                  </div>

                  <div className="flex gap-3">
                    <Button onClick={handleCopyAccountNumber} variant="outline" className="flex-1 rounded-xl">
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Number
                    </Button>
                    <Button onClick={handleShareReceiptImage} className="flex-1 rounded-xl gradient-brand text-primary-foreground font-semibold border-0 hover:opacity-90">
                      <Share2 className="h-4 w-4 mr-2" />
                      Share Receipt
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <p className="text-sm text-foreground font-medium">Generate your permanent account</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    This creates a bank account tied to your BVN name. Any deposit to it credits your Vura balance instantly.
                  </p>
                </div>

                {needsBvn && (
                  <Button
                    onClick={() => navigate('/settings')}
                    variant="outline"
                    className="w-full h-12 rounded-xl"
                  >
                    Verify BVN to Generate Account
                  </Button>
                )}

                <Button
                  onClick={handleGenerateVirtualAccount}
                  disabled={isMinting}
                  className="w-full h-12 rounded-xl gradient-brand text-primary-foreground font-semibold border-0 hover:opacity-90"
                >
                  {isMinting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Minting your account...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate My Vura Bank Account
                    </>
                  )}
                </Button>
              </div>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default Receive;
