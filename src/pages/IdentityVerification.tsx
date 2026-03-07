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
  Upload,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AppSidebar from "@/components/AppSidebar";
import DashboardHeader from "@/components/DashboardHeader";
import { apiFetch } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";

const isMobileDevice = () => {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || navigator.vendor || "";
  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const smallScreen = window.innerWidth < 768;
  return smallScreen || hasTouch || /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua.toLowerCase());
};

const IdentityVerification = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isMobile] = useState(isMobileDevice);
  const [docsUploaded, setDocsUploaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/kyc/status");
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          setDocsUploaded(!!(data?.idCardUrl && data?.selfieUrl));
        }
      } catch {
        if (!cancelled) setDocsUploaded(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
          setError(data?.message || "Could not start verification. Please try again.");
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
    // Same-tab navigation works on all mobile browsers (no popup blocking). Widget opens full screen.
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
            <p className="text-xs text-muted-foreground">Step 1: Upload docs. Step 2: Live verification.</p>
              </div>
            </div>
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

            {!loading && (
              <div className="space-y-6">
                {/* Option B Step 1: Upload ID and selfie first so admin sees docs */}
                <div className={`rounded-xl border-2 p-4 ${docsUploaded ? "border-green-500/50 bg-green-500/5" : "border-primary/30 bg-primary/5"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${docsUploaded ? "bg-green-500/20 text-green-600" : "bg-primary/20 text-primary"}`}>
                      {docsUploaded ? <CheckCircle className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">Step 1: Upload ID and selfie</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {docsUploaded
                          ? "Done. Your documents are with our team. Now complete Step 2 below."
                          : "Upload your ID document and a selfie so admins can review them. Then complete live verification in Step 2."}
                      </p>
                      {!docsUploaded && (
                        <Button className="mt-3" onClick={() => navigate("/id-upload")}>
                          <Upload className="h-4 w-4 mr-2" /> Upload ID and selfie
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Step 2: Live verification (Prembly) - only when verificationUrl is ready */}
                {verificationUrl && (
                  <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">Step 2: Complete live verification</p>
                        <p className="text-sm text-muted-foreground">BVN, ID and face check in one flow.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={openOnThisDevice}
                  className="w-full flex items-center gap-4 p-5 rounded-xl border-2 border-primary bg-primary/10 hover:bg-primary/20 active:scale-[0.98] transition-all text-left touch-manipulation min-h-[72px]"
                >
                  <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                    {isMobile ? (
                      <Smartphone className="h-6 w-6 text-primary" />
                    ) : (
                      <Monitor className="h-6 w-6 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">
                      {isMobile ? "Open verification" : "Continue on this device"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isMobile
                        ? "Opens in this tab so the widget works on your phone. Complete BVN, ID and face there."
                        : "Complete verification in this browser (ID + selfie)"}
                    </p>
                  </div>
                </button>

                {/* Open on my phone: only show on desktop (on mobile they're already on phone) */}
                {!isMobile && (
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
                )}

                {isMobile && (
                  <p className="text-xs text-muted-foreground text-center">
                    Or{" "}
                    <button type="button" onClick={copyLink} className="text-primary font-medium underline">
                      copy link
                    </button>{" "}
                    to open in another browser.
                  </p>
                )}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default IdentityVerification;
