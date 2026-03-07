import { motion } from "framer-motion";
import { 
  Shield, Bell, ChevronRight, LogOut, Lock, 
  Smartphone, Moon, Globe, FileText, HelpCircle, 
  Star, Fingerprint,
  Eye, EyeOff, ToggleLeft, ToggleRight, CreditCard,
  BadgeCheck, AlertTriangle, ShieldCheck,
  Mail, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import AppSidebar from "@/components/AppSidebar";
import DashboardHeader from "@/components/DashboardHeader";
import { useAuth, apiFetch } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

interface SettingsItemProps {
  icon: React.ElementType;
  label: string;
  value?: string;
  onClick?: () => void;
  danger?: boolean;
  toggle?: boolean;
  toggleValue?: boolean;
  onToggle?: () => void;
}

const SettingsPage = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  
  const [activeDialog, setActiveDialog] = useState<string | null>(null);
  const [bvn, setBvn] = useState("");
  const [bvnFirstName, setBvnFirstName] = useState("");
  const [bvnLastName, setBvnLastName] = useState("");
  const [bvnStatus, setBvnStatus] = useState<{ verified: boolean; tier?: number; verifiedAt?: string | null } | null>(null);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [premblySdkLoading, setPremblySdkLoading] = useState(false);
  
  const [settings, setSettings] = useState({
    hideBalance: false,
    hideTransactionAmounts: false,
    biometricEnabled: false,
    pushNotifications: true,
    smsNotifications: true,
    emailNotifications: false,
    marketingEmails: false,
  });

  const [paymentPrefs, setPaymentPrefs] = useState({
    defaultMethod: "balance" as "balance" | "bank",
    pinRequiredAbove: 1000 as number,
  });

  useEffect(() => {
    const stored = localStorage.getItem("vura_settings");
    if (stored) {
      try {
        setSettings(JSON.parse(stored));
      } catch {
        // ignore invalid stored settings
      }
    }
    const prefs = localStorage.getItem("vura_payment_prefs");
    if (prefs) {
      try {
        setPaymentPrefs(JSON.parse(prefs));
      } catch {
        // ignore invalid stored prefs
      }
    }
    if (user) fetchBvnStatus();
  }, [user]);

  useEffect(() => {
    if (activeDialog === "bvn") fetchBvnStatus();
  }, [activeDialog]);

  const updateSetting = (key: keyof typeof settings, value: boolean) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    localStorage.setItem("vura_settings", JSON.stringify(newSettings));
    const labels: Record<string, string> = {
      hideBalance: "Hide balance",
      hideTransactionAmounts: "Privacy mode",
      biometricEnabled: "Biometric login",
      pushNotifications: "Push notifications",
      smsNotifications: "SMS notifications",
      emailNotifications: "Email notifications",
      marketingEmails: "Marketing emails",
    };
    toast({ title: "Saved", description: `${labels[key] ?? key} updated.` });
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const getInitials = (tag: string) => tag.slice(0, 2).toUpperCase();

  const fetchBvnStatus = async () => {
    try {
      const response = await apiFetch("/kyc/bvn-status");
      if (response.ok) {
        const data = await response.json();
        // backend returns { success: true, data: { verified, verifiedAt, kycTier } }
        if (data?.data) {
          setBvnStatus({
            verified: !!data.data.verified,
            tier: data.data.kycTier,
            verifiedAt: data.data.verifiedAt ?? null,
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch BVN status:", error);
    }
  };

  const handleBvnSubmit = async () => {
    if (bvn.length !== 11) {
      toast({ title: "Invalid BVN", description: "BVN must be 11 digits", variant: "destructive" });
      return;
    }
    if (!bvnFirstName.trim() || !bvnLastName.trim()) {
      toast({
        title: "Missing name",
        description: "Enter your first name and last name as it appears on your BVN.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const response = await apiFetch("/kyc/verify-bvn", {
        method: "POST",
        body: JSON.stringify({ bvn, firstName: bvnFirstName.trim(), lastName: bvnLastName.trim() }),
      });
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        toast({ title: "Wrong server", description: "The API URL may point to the app instead of the backend. Check VITE_API_URL and redeploy.", variant: "destructive" });
        return;
      }
      let data: { success?: boolean; message?: string; data?: { success?: boolean; consentUrl?: string; url?: string; message?: string } };
      try {
        data = await response.json();
      } catch {
        toast({ title: "Verification Failed", description: "Invalid response from server. Please try again or contact support.", variant: "destructive" });
        return;
      }
      if (response.ok) {
        // Backend can return 200 with data.data.success === false (e.g. Prembly not configured correctly)
        if (data?.data && (data.data as { success?: boolean }).success === false) {
          const msg = (data.data as { message?: string }).message || data.message || "Verification could not be completed.";
          toast({ title: "Verification Failed", description: msg, variant: "destructive" });
          return;
        }
        const consentUrl = data?.data?.consentUrl || data?.data?.url;
        if (consentUrl && typeof consentUrl === "string") {
          toast({
            title: "Taking you to secure verification",
            description: "You'll complete BVN consent on a secure NIBSS page, then return here.",
          });
          window.location.href = consentUrl;
          return;
        }
        // No redirect = instant verification (e.g. Prembly)
        toast({
          title: "BVN verified",
          description: "Your account is now Tier 2. Higher limits are active.",
        });
        fetchBvnStatus();
        setActiveDialog(null);
      } else {
        toast({ title: "Verification Failed", description: data?.message ?? "BVN verification failed. Please try again or contact support.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to verify BVN. Please try again or contact support.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleChangePin = async () => {
    if (newPin.length !== 6 || confirmPin.length !== 6) {
      toast({ title: "Invalid PIN", description: "PIN must be 6 digits", variant: "destructive" });
      return;
    }
    if (newPin !== confirmPin) {
      toast({ title: "PIN Mismatch", description: "New PIN and confirmation do not match", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const response = await apiFetch("/auth/change-pin", {
        method: "POST",
        body: JSON.stringify({ currentPin, newPin }),
      });
      const data = await response.json();
      if (response.ok) {
        toast({ title: "PIN Changed!", description: "Your PIN has been updated successfully." });
        setCurrentPin(""); setNewPin(""); setConfirmPin(""); setActiveDialog(null);
      } else {
        toast({ title: "Failed", description: data.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to change PIN", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPin = async () => {
    if (!user?.vuraTag) return;
    setLoading(true);
    try {
      const response = await apiFetch("/auth/forgot-pin", {
        method: "POST",
        body: JSON.stringify({ vuraTag: user.vuraTag }),
      });
      const data = await response.json();
        if (response.ok) {
        toast({ title: "OTP Sent!", description: data.maskedPhone ? `Check your phone: ${data.maskedPhone}` : (data.message || "Check your registered phone for the code.") });
        setOtpSent(true);
      } else {
        toast({ title: "Failed", description: data.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to send OTP", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPin = async () => {
    if (otp.length !== 6 || newPin.length !== 6) {
      toast({ title: "Invalid Input", description: "OTP and PIN must be 6 digits", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const response = await apiFetch("/auth/reset-pin", {
        method: "POST",
        body: JSON.stringify({ vuraTag: user?.vuraTag, otp, newPin }),
      });
      const data = await response.json();
      if (response.ok) {
        toast({ title: "PIN Reset!", description: "Your PIN has been reset successfully." });
        setOtp(""); setNewPin(""); setConfirmPin(""); setOtpSent(false); setActiveDialog(null);
      } else {
        toast({ title: "Failed", description: data.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to reset PIN", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const openSupportMail = () => {
    window.location.href = "mailto:support@vura.com?subject=Vura%20Support";
  };

  const handlePremblySdkStart = async () => {
    setPremblySdkLoading(true);
    try {
      const response = await apiFetch("/kyc/prembly-sdk/initiate", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.verificationUrl) {
        toast({
          title: "Verification window",
          description: "Complete your identity verification in the popup, then return here.",
        });
        window.open(data.verificationUrl, "prembly_verification", "width=800,height=600,scrollbars=yes");
      } else {
        toast({
          title: "Could not start verification",
          description: data?.message || "Prembly SDK may not be configured. Try BVN verification instead.",
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({
        title: "Error",
        description: "Failed to start identity verification. Please try again.",
        variant: "destructive",
      });
    } finally {
      setPremblySdkLoading(false);
    }
  };

  const getKycStatus = () => {
    if (bvnStatus?.verified || (user?.kycTier && user.kycTier >= 2)) {
      return { text: "Verified", color: "text-green-500", bg: "bg-green-50" };
    }
    return { text: "Unverified", color: "text-amber-500", bg: "bg-amber-50" };
  };

  const kycStatus = getKycStatus();

  const SettingsSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-4">{title}</h3>
      <div className="bg-card rounded-2xl border border-border overflow-hidden">{children}</div>
    </div>
  );

  const SettingsItem = ({ icon: Icon, label, value, onClick, danger = false, toggle = false, toggleValue = false, onToggle }: SettingsItemProps) => (
    <div 
      className={`flex items-center gap-4 p-4 ${onClick ? "cursor-pointer hover:bg-secondary/50" : ""} transition-colors border-b border-border last:border-b-0`}
      onClick={onClick}
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${danger ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <p className={`text-sm font-medium ${danger ? "text-destructive" : "text-foreground"}`}>{label}</p>
        {value && <p className="text-xs text-muted-foreground">{value}</p>}
      </div>
      {toggle ? (
        <button onClick={(e) => { e.stopPropagation(); onToggle?.(); }}>
          {toggleValue ? <ToggleRight className="h-6 w-6 text-primary" /> : <ToggleLeft className="h-6 w-6 text-muted-foreground" />}
        </button>
      ) : (
        <ChevronRight className={`h-4 w-4 ${danger ? "text-destructive" : "text-muted-foreground"}`} />
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 lg:ml-64 px-4 sm:px-6 lg:px-8 py-6 pb-24">
        <DashboardHeader />
        <div className="max-w-2xl">
          
          {/* Profile Card */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl border border-border p-6 shadow-card mb-6">
            <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full gradient-brand text-primary-foreground font-bold text-xl shrink-0">
                  {user ? getInitials(user.vuraTag) : "??"}
                </div>
              <div className="flex-1">
                <p className="font-semibold text-foreground text-lg">{user ? `@${user.vuraTag}` : "Loading..."}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${kycStatus.bg} ${kycStatus.color}`}>
                    {kycStatus.text}
                  </span>
                  <span className="text-xs text-muted-foreground">Tier {user?.kycTier || 1}</span>
                </div>
              </div>
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setActiveDialog("profile")}>View profile</Button>
            </div>
          </motion.div>

          {/* Account & Security */}
          <SettingsSection title="Account & Security">
            <SettingsItem icon={Shield} label="BVN Verification" value={bvnStatus?.verified ? "Verified" : "Verify your BVN to upgrade"} onClick={() => setActiveDialog("bvn")} />
            <SettingsItem
              icon={BadgeCheck}
              label="Identity verification (Prembly)"
              value={premblySdkLoading ? "Opening…" : "Document + selfie verification"}
              onClick={premblySdkLoading ? undefined : handlePremblySdkStart}
            />
            <SettingsItem icon={Lock} label="Transaction PIN" value="Change or reset your 6-digit PIN" onClick={() => setActiveDialog("pin")} />
            <SettingsItem icon={Fingerprint} label="Biometric Login" value="Use fingerprint or Face ID" toggle toggleValue={settings.biometricEnabled} onToggle={() => updateSetting("biometricEnabled", !settings.biometricEnabled)} />
          </SettingsSection>

          {/* Payment Settings */}
          <SettingsSection title="Payment Settings">
            <SettingsItem icon={CreditCard} label="Default Payment Method" value={paymentPrefs.defaultMethod === "balance" ? "Vura Balance" : "Bank Transfer"} onClick={() => setActiveDialog("payment")} />
            <SettingsItem icon={BadgeCheck} label="Auto-Pay" value="Manage recurring payments" onClick={() => toast({ title: "Coming Soon", description: "Auto-pay feature will be available soon." })} />
          </SettingsSection>

          {/* Notifications */}
          <SettingsSection title="Notifications">
            <SettingsItem icon={Bell} label="Push Notifications" toggle toggleValue={settings.pushNotifications} onToggle={() => updateSetting("pushNotifications", !settings.pushNotifications)} />
            <SettingsItem icon={Smartphone} label="SMS Notifications" toggle toggleValue={settings.smsNotifications} onToggle={() => updateSetting("smsNotifications", !settings.smsNotifications)} />
            <SettingsItem icon={FileText} label="Email Notifications" toggle toggleValue={settings.emailNotifications} onToggle={() => updateSetting("emailNotifications", !settings.emailNotifications)} />
          </SettingsSection>

          {/* Privacy */}
          <SettingsSection title="Privacy">
            <SettingsItem icon={settings.hideBalance ? EyeOff : Eye} label="Hide Balance" value="Require PIN to view balance" toggle toggleValue={settings.hideBalance} onToggle={() => updateSetting("hideBalance", !settings.hideBalance)} />
            <SettingsItem icon={ShieldCheck} label="Privacy Mode" value="Hide transaction amounts" toggle toggleValue={settings.hideTransactionAmounts} onToggle={() => updateSetting("hideTransactionAmounts", !settings.hideTransactionAmounts)} />
          </SettingsSection>

          {/* Preferences */}
          <SettingsSection title="Preferences">
            <SettingsItem icon={Globe} label="Language" value="English" onClick={() => toast({ title: "Language", description: "Only English is currently supported." })} />
            <SettingsItem icon={Moon} label="Appearance" value="Light mode" onClick={() => toast({ title: "Appearance", description: "Dark mode coming soon." })} />
          </SettingsSection>

          {/* Support & About */}
          <SettingsSection title="Support & legal">
            <SettingsItem icon={HelpCircle} label="Help & support" value="Email and FAQs" onClick={() => setActiveDialog("help")} />
            <SettingsItem icon={FileText} label="Terms of service" value="Usage and rules" onClick={() => window.open("/terms", "_blank")} />
            <SettingsItem icon={Shield} label="Privacy policy" value="How we use your data" onClick={() => window.open("/privacy", "_blank")} />
            <SettingsItem icon={Star} label="Rate Vura" value="Share your feedback" onClick={() => toast({ title: "Thanks!", description: "Rate us on the app store when you can." })} />
          </SettingsSection>

          {/* Account actions */}
          <SettingsSection title="Account actions">
            <SettingsItem icon={AlertTriangle} label="Freeze account" value="Contact support to temporarily disable" danger onClick={() => setActiveDialog("freeze")} />
          </SettingsSection>

          {/* Logout */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <Button onClick={handleLogout} variant="outline" className="w-full h-12 rounded-xl border-border mb-8">
              <LogOut className="h-4 w-4 mr-2" /> Log out
            </Button>
          </motion.div>
        </div>

        {/* Profile Dialog */}
        <Dialog open={activeDialog === "profile"} onOpenChange={() => setActiveDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Profile</DialogTitle>
              <DialogDescription>Your account details. To change your display name or contact info, contact support.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Display name</Label>
                <Input value={user ? `@${user.vuraTag}` : ""} readOnly className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>KYC tier</Label>
                <Input value={`Tier ${user?.kycTier ?? 1}`} readOnly className="bg-muted" />
              </div>
              <p className="text-xs text-muted-foreground">
                Need to update your name or phone? Email us and we’ll help you securely.
              </p>
              <Button variant="outline" className="w-full" onClick={openSupportMail}>
                <Mail className="h-4 w-4 mr-2" /> Contact support
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* BVN Dialog */}
        <Dialog open={activeDialog === "bvn"} onOpenChange={() => setActiveDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>BVN Verification</DialogTitle>
              <DialogDescription>
                {bvnStatus?.verified
                  ? "Your identity is verified. You have access to higher limits."
                  : "Verify once to unlock Tier 2 limits and secure your account. We use a secure NIBSS-backed flow."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {bvnStatus?.verified ? (
                <div className="p-6 rounded-xl bg-green-500/10 border border-green-500/20 text-center space-y-3">
                  <div className="mx-auto w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Shield className="h-7 w-7 text-green-600" />
                  </div>
                  <p className="font-semibold text-green-800 dark:text-green-200">BVN Verified</p>
                  <p className="text-sm text-muted-foreground">
                    Tier {bvnStatus?.tier ?? user?.kycTier ?? 2} &bull; Higher limits enabled
                  </p>
                  {bvnStatus?.verifiedAt && (
                    <p className="text-xs text-muted-foreground">
                      Verified {new Date(bvnStatus.verifiedAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="p-4 rounded-xl bg-muted/80 border border-border space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Enter your details exactly as they appear on your BVN. Verification is secure and we never store your full BVN.
                    </p>
                    <p className="text-xs text-muted-foreground">You may be taken to a secure NIBSS page to complete consent, or verified instantly depending on our provider.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>First name</Label>
                      <Input
                        value={bvnFirstName}
                        onChange={(e) => setBvnFirstName(e.target.value)}
                        placeholder="As on BVN"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Last name</Label>
                      <Input
                        value={bvnLastName}
                        onChange={(e) => setBvnLastName(e.target.value)}
                        placeholder="As on BVN"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>11-digit BVN</Label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      value={bvn}
                      onChange={(e) => setBvn(e.target.value.replace(/\D/g, "").slice(0, 11))}
                      placeholder="•••••••••••"
                      maxLength={11}
                      className="font-mono"
                    />
                  </div>
                  <Button
                    onClick={handleBvnSubmit}
                    className="w-full h-11 rounded-xl"
                    disabled={bvn.length !== 11 || !bvnFirstName.trim() || !bvnLastName.trim() || loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Preparing…
                      </>
                    ) : (
                      "Continue to secure verification"
                    )}
                  </Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* PIN Dialog */}
        <Dialog open={activeDialog === "pin"} onOpenChange={() => { setActiveDialog(null); setOtpSent(false); setOtp(""); setCurrentPin(""); setNewPin(""); setConfirmPin(""); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Transaction PIN</DialogTitle><DialogDescription>Use a 6-digit PIN to confirm transfers. Change it here or reset with an OTP if you forgot it.</DialogDescription></DialogHeader>
            <div className="space-y-4 py-4">
              {!otpSent ? (
                <>
                  <div className="space-y-2"><Label>Current PIN</Label><Input type="password" value={currentPin} onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter current 6-digit PIN" maxLength={6} /></div>
                  <div className="space-y-2"><Label>New PIN</Label><Input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter new 6-digit PIN" maxLength={6} /></div>
                  <div className="space-y-2"><Label>Confirm New PIN</Label><Input type="password" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Confirm new 6-digit PIN" maxLength={6} /></div>
                  <Button onClick={handleChangePin} className="w-full" disabled={!currentPin || !newPin || !confirmPin || loading}>{loading ? "Changing..." : "Change PIN"}</Button>
                  <div className="text-center"><button onClick={handleForgotPin} className="text-sm text-primary hover:underline" disabled={loading}>Forgot PIN? Reset with OTP</button></div>
                </>
              ) : (
                <>
                  <div className="p-4 bg-blue-50 rounded-lg"><p className="text-blue-700 text-sm">An OTP has been sent to your registered phone number.</p></div>
                  <div className="space-y-2"><Label>Enter OTP</Label><Input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter 6-digit OTP" maxLength={6} /></div>
                  <div className="space-y-2"><Label>New PIN</Label><Input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter new 6-digit PIN" maxLength={6} /></div>
                  <Button onClick={handleResetPin} className="w-full" disabled={otp.length !== 6 || newPin.length !== 6 || loading}>{loading ? "Resetting..." : "Reset PIN"}</Button>
                  <div className="text-center"><button onClick={() => setOtpSent(false)} className="text-sm text-muted-foreground hover:underline">Back to Change PIN</button></div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Payment Settings Dialog */}
        <Dialog open={activeDialog === "payment"} onOpenChange={() => setActiveDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Payment preferences</DialogTitle>
              <DialogDescription>Saved on this device. Applies when you pay or transfer.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Default payment method</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant={paymentPrefs.defaultMethod === "balance" ? "default" : "outline"} className="w-full" onClick={() => { const p = { ...paymentPrefs, defaultMethod: "balance" as const }; setPaymentPrefs(p); localStorage.setItem("vura_payment_prefs", JSON.stringify(p)); toast({ title: "Saved", description: "Vura Balance set as default." }); }}>Vura Balance</Button>
                  <Button variant={paymentPrefs.defaultMethod === "bank" ? "default" : "outline"} className="w-full" onClick={() => { const p = { ...paymentPrefs, defaultMethod: "bank" as const }; setPaymentPrefs(p); localStorage.setItem("vura_payment_prefs", JSON.stringify(p)); toast({ title: "Saved", description: "Bank Transfer set as default." }); }}>Bank Transfer</Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Require PIN for transactions</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Button variant={paymentPrefs.pinRequiredAbove === 0 ? "default" : "outline"} className="w-full text-xs" onClick={() => { const p = { ...paymentPrefs, pinRequiredAbove: 0 }; setPaymentPrefs(p); localStorage.setItem("vura_payment_prefs", JSON.stringify(p)); toast({ title: "Saved", description: "PIN required for all." }); }}>All</Button>
                  <Button variant={paymentPrefs.pinRequiredAbove === 1000 ? "default" : "outline"} className="w-full text-xs" onClick={() => { const p = { ...paymentPrefs, pinRequiredAbove: 1000 }; setPaymentPrefs(p); localStorage.setItem("vura_payment_prefs", JSON.stringify(p)); toast({ title: "Saved", description: "PIN above ₦1,000." }); }}>Above ₦1k</Button>
                  <Button variant={paymentPrefs.pinRequiredAbove === 10000 ? "default" : "outline"} className="w-full text-xs" onClick={() => { const p = { ...paymentPrefs, pinRequiredAbove: 10000 }; setPaymentPrefs(p); localStorage.setItem("vura_payment_prefs", JSON.stringify(p)); toast({ title: "Saved", description: "PIN above ₦10,000." }); }}>Above ₦10k</Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Help Dialog */}
        <Dialog open={activeDialog === "help"} onOpenChange={() => setActiveDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Help & support</DialogTitle>
              <DialogDescription>We’re here to help. Reach out and we’ll get back to you quickly.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <Button variant="outline" className="w-full justify-start" onClick={openSupportMail}>
                <Mail className="h-4 w-4 mr-2" /> Email support
              </Button>
              <div className="p-3 bg-muted rounded-lg space-y-1">
                <p className="text-xs font-medium text-foreground">Support</p>
                <p className="text-xs text-muted-foreground">support@vura.com</p>
                <p className="text-xs text-muted-foreground mt-2">We aim to respond within 1 hour during business hours.</p>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Freeze Account Dialog */}
        <Dialog open={activeDialog === "freeze"} onOpenChange={() => setActiveDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Freeze account</DialogTitle>
              <DialogDescription>To temporarily disable your account, contact support. We’ll verify your identity and freeze it. You’ll need to contact us again to reactivate.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Freezing stops all transactions and hides your account until you ask us to turn it back on.</p>
              </div>
              <Button variant="outline" className="w-full" onClick={openSupportMail}>
                <Mail className="h-4 w-4 mr-2" /> Contact support to freeze account
              </Button>
            </div>
          </DialogContent>
        </Dialog>

      </main>
    </div>
  );
};

export default SettingsPage;
