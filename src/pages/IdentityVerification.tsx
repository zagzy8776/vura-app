import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  Smartphone,
  Monitor,
  Copy,
  Loader2,
  ArrowLeft,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AppSidebar from "@/components/AppSidebar";
import DashboardHeader from "@/components/DashboardHeader";
import { apiFetch } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";

const IdentityVerification = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await apiFetch("/kyc/prembly-sdk/initiate", {
          method: "POST",
          body: JSON.stringify({}),
        });
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (response.ok && data?.verificationUrl) {
          setVerificationUrl(data.verificationUrl);
          QRCode.toDataURL(data.verificationUrl, {
            width: 220,
            margin: 2,
            color: { dark: "#0f172a", light: "#ffffff" },
          })
            .then((url) => !cancelled && setQrDataUrl(url))
            .catch(() => {});
        } else {
          setError(data?.message || "Could not start verification. Complete Step 1 (BVN) first.");
        }
      } catch {
        if (!cancelled) setError("Failed to load. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const copyLink = () => {
    if (!verificationUrl) return;
    navigator.clipboard.writeText(verificationUrl);
    setCopied(true);
    toast({ title: "Link copied", description: "Open it on your phone to continue." });
    setTimeout(() => setCopied(false), 2000);
  };

  const openOnThisDevice = () => {
    if (!verificationUrl) return;
    window.location.href = verificationUrl;
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 lg:ml-64 px-4 sm:px-6 lg:px-8 py-6 pb-24">
        <DashboardHeader />
        <div className="max-w-lg mx-auto">
          <Button
            variant="ghost"
            size="sm"
            className="mb-4 -ml-2 text-muted-foreground"
            onClick={() => navigate("/settings")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Settings
          </Button>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-2xl border border-border p-6 shadow-card"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">
                  Identity verification
                </h1>
                <p className="text-xs text-muted-foreground">Step 2 of 2</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Verify your identity with your ID document and a selfie. Choose how you’d like to continue.
            </p>

            {loading && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-3" />
                <p className="text-sm">Preparing verification…</p>
              </div>
            )}

            {error && !loading && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive mb-4">
                {error}
              </div>
            )}

            {!loading && verificationUrl && (
              <div className="space-y-4">
                {/* Continue on this device */}
                <button
                  type="button"
                  onClick={openOnThisDevice}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Monitor className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground">Continue on this device</p>
                    <p className="text-xs text-muted-foreground">
                      Complete verification in this browser (ID + selfie)
                    </p>
                  </div>
                </button>

                {/* Open on my phone */}
                <div className="rounded-xl border border-border p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Smartphone className="h-4 w-4" /> Open on my phone
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Scan the QR code with your phone camera, or copy the link and open it on your phone.
                  </p>
                  {qrDataUrl && (
                    <div className="flex justify-center py-2">
                      <img
                        src={qrDataUrl}
                        alt="Verification QR code"
                        className="w-[200px] h-[200px] rounded-lg border border-border"
                      />
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={verificationUrl}
                      className="font-mono text-xs bg-muted flex-1 min-w-0"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={copyLink}
                      className="shrink-0"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {!loading && !verificationUrl && !error && (
              <p className="text-sm text-muted-foreground">No verification session available.</p>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default IdentityVerification;
