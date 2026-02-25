import { motion } from "framer-motion";
import { 
  User, Shield, Bell, ChevronRight, LogOut, Lock, 
  Smartphone, Moon, Globe, FileText, HelpCircle, 
  Star, Camera, Check, Fingerprint,
  Eye, EyeOff, ToggleLeft, ToggleRight, CreditCard,
  BadgeCheck, AlertTriangle, ShieldCheck,
  MessageSquare, Mail
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
  const [bvnStatus, setBvnStatus] = useState<{ verified: boolean; tier?: number } | null>(null);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  
  const [settings, setSettings] = useState({
    hideBalance: false,
    hideTransactionAmounts: false,
    biometricEnabled: false,
    pushNotifications: true,
    smsNotifications: true,
    emailNotifications: false,
    marketingEmails: false,
  });

  useEffect(() => {
    const stored = localStorage.getItem("vura_settings");
    if (stored) {
      setSettings(JSON.parse(stored));
    }
    if (user) {
      setEditName(user.vuraTag || "");
      fetchBvnStatus();
    }
  }, [user]);

  const updateSetting = (key: keyof typeof settings, value: boolean) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    localStorage.setItem("vura_settings", JSON.stringify(newSettings));
    toast({ title: "Setting Saved", description: `${key} updated successfully.` });
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const getInitials = (tag: string) => tag.slice(0, 2).toUpperCase();

  const fetchBvnStatus = async () => {
    try {
      const response = await apiFetch("/kyc/status");
      if (response.ok) {
        const data = await response.json();
        setBvnStatus(data);
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
    setLoading(true);
    try {
      const response = await apiFetch("/kyc/bvn", {
        method: "POST",
        body: JSON.stringify({ bvn }),
      });
      const data = await response.json();
      if (response.ok) {
        toast({ title: "BVN Verified!", description: `Welcome ${data.userName}. Your KYC tier has been upgraded.` });
        setBvnStatus({ verified: true, tier: data.tier });
        setActiveDialog(null);
        setBvn("");
      } else {
        toast({ title: "Verification Failed", description: data.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to verify BVN", variant: "destructive" });
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
        toast({ title: "OTP Sent!", description: `Check your phone: ${data.maskedPhone}` });
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

  const handleSaveProfile = () => {
    toast({ title: "Profile Updated", description: "Your profile has been updated successfully." });
    setActiveDialog(null);
  };

  const handleFreezeAccount = async () => {
    try {
      const response = await apiFetch("/auth/freeze", { method: "POST" });
      if (response.ok) {
        toast({ title: "Account Frozen", description: "Your account has been temporarily frozen.", variant: "destructive" });
        signOut();
        navigate("/login");
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to freeze account", variant: "destructive" });
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
      <main className="flex-1 ml-64 px-8 pb-8">
        <DashboardHeader />
        <div className="max-w-2xl">
          
          {/* Profile Card */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl border border-border p-6 shadow-card mb-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="flex h-16 w-16 items-center justify-center rounded-full gradient-brand text-primary-foreground font-bold text-xl">
                  {user ? getInitials(user.vuraTag) : "??"}
                </div>
                <button className="absolute -bottom-1 -right-1 h-6 w-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground">
                  <Camera className="h-3 w-3" />
                </button>
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
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setActiveDialog("profile")}>Edit</Button>
            </div>
          </motion.div>

          {/* Account & Security */}
          <SettingsSection title="Account & Security">
            <SettingsItem icon={Shield} label="BVN Verification" value={bvnStatus?.verified ? "Verified" : "Verify your BVN to upgrade"} onClick={() => setActiveDialog("bvn")} />
            <SettingsItem icon={Lock} label="Change Transaction PIN" value="Change or reset your PIN" onClick={() => setActiveDialog("pin")} />
            <SettingsItem icon={Fingerprint} label="Biometric Login" value="Use fingerprint or Face ID" toggle toggleValue={settings.biometricEnabled} onToggle={() => updateSetting("biometricEnabled", !settings.biometricEnabled)} />
          </SettingsSection>

          {/* Payment Settings */}
          <SettingsSection title="Payment Settings">
            <SettingsItem icon={CreditCard} label="Default Payment Method" value="Vura Balance" onClick={() => setActiveDialog("payment")} />
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
          <SettingsSection title="Support & About">
            <SettingsItem icon={HelpCircle} label="Help & Support" onClick={() => setActiveDialog("help")} />
            <SettingsItem icon={FileText} label="Terms of Service" onClick={() => toast({ title: "Terms", description: "Opening Terms of Service..." })} />
            <SettingsItem icon={Shield} label="Privacy Policy" onClick={() => toast({ title: "Privacy", description: "Opening Privacy Policy..." })} />
            <SettingsItem icon={Star} label="Rate Vura" onClick={() => toast({ title: "Rate Us", description: "Thank you for your support!" })} />
          </SettingsSection>

          {/* Account Actions */}
          <SettingsSection title="Account Actions">
            <SettingsItem icon={AlertTriangle} label="Freeze Account" danger onClick={() => setActiveDialog("freeze")} />
          </SettingsSection>

          {/* Logout */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <Button onClick={handleLogout} variant="outline" className="w-full h-12 rounded-xl text-destructive hover:text-destructive border-destructive/20 hover:bg-destructive/5 mb-8">
              <LogOut className="h-4 w-4 mr-2" /> Log Out
            </Button>
          </motion.div>
        </div>

        {/* Profile Edit Dialog */}
        <Dialog open={activeDialog === "profile"} onOpenChange={() => setActiveDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Profile</DialogTitle>
              <DialogDescription>Update your personal information.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label>Full Name</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Enter your full name" /></div>
              <div className="space-y-2"><Label>Email Address</Label><Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="Enter your email" /></div>
              <div className="space-y-2"><Label>Phone Number</Label><Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Enter your phone number" /></div>
              <Button onClick={handleSaveProfile} className="w-full">Save Changes</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* BVN Dialog */}
        <Dialog open={activeDialog === "bvn"} onOpenChange={() => setActiveDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>BVN Verification</DialogTitle>
              <DialogDescription>Verify your BVN to upgrade your account tier and increase limits.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {bvnStatus?.verified ? (
                <div className="p-4 bg-green-50 rounded-lg text-center">
                  <Check className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <p className="text-green-700 font-medium">BVN Verified</p>
                  <p className="text-sm text-green-600">Your account is on Tier {bvnStatus?.tier || user?.kycTier}</p>
                </div>
              ) : (
                <>
                  <div className="p-4 bg-amber-50 rounded-lg"><p className="text-amber-700 text-sm">Your BVN is required for regulatory compliance and to unlock higher transaction limits.</p></div>
                  <div className="space-y-2"><Label>Enter your 11-digit BVN</Label><Input value={bvn} onChange={(e) => setBvn(e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="12345678901" maxLength={11} /></div>
                  <Button onClick={handleBvnSubmit} className="w-full" disabled={bvn.length !== 11 || loading}>{loading ? "Verifying..." : "Verify BVN"}</Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* PIN Dialog */}
        <Dialog open={activeDialog === "pin"} onOpenChange={() => { setActiveDialog(null); setOtpSent(false); setOtp(""); setCurrentPin(""); setNewPin(""); setConfirmPin(""); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Change Transaction PIN</DialogTitle><DialogDescription>Secure your account with a new PIN.</DialogDescription></DialogHeader>
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
            <DialogHeader><DialogTitle>Payment Settings</DialogTitle><DialogDescription>Configure your payment preferences.</DialogDescription></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label>Default Payment Method</Label><div className="grid grid-cols-2 gap-2"><Button variant="default" className="w-full">Vura Balance</Button><Button variant="outline" className="w-full">Bank Transfer</Button></div></div>
              <div className="space-y-2"><Label>PIN Required For</Label><div className="grid grid-cols-3 gap-2"><Button variant="outline" className="w-full text-xs">All</Button><Button variant="default" className="w-full text-xs">Above ₦1k</Button><Button variant="outline" className="w-full text-xs">Above ₦10k</Button></div></div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Help Dialog */}
        <Dialog open={activeDialog === "help"} onOpenChange={() => setActiveDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Help & Support</DialogTitle><DialogDescription>Get help with your account.</DialogDescription></DialogHeader>
            <div className="space-y-4 py-4">
              <Button variant="outline" className="w-full justify-start" onClick={() => toast({ title: "FAQ", description: "Opening FAQ..." })}><HelpCircle className="h-4 w-4 mr-2" /> Frequently Asked Questions</Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => toast({ title: "Support", description: "Contacting support..." })}><MessageSquare className="h-4 w-4 mr-2" /> Chat with Support</Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => toast({ title: "Email", description: "Opening email..." })}><Mail className="h-4 w-4 mr-2" /> Email Support</Button>
              <div className="p-3 bg-muted rounded-lg"><p className="text-xs text-muted-foreground">Support Hours: 24/7</p><p className="text-xs text-muted-foreground">Response Time: Usually within 1 hour</p></div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Freeze Account Dialog */}
        <Dialog open={activeDialog === "freeze"} onOpenChange={() => setActiveDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Freeze Account</DialogTitle><DialogDescription>Temporarily disable your account. You will be logged out and need to contact support to reactivate.</DialogDescription></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="p-4 bg-destructive/10 rounded-lg"><p className="text-sm text-destructive font-medium">Warning</p><p className="text-xs text-destructive/80 mt-1">Freezing your account will prevent all transactions and require contacting support to reactivate.</p></div>
              <div className="space-y-2"><Label>Enter your PIN to confirm</Label><Input type="password" placeholder="6-digit PIN" maxLength={6} /></div>
              <Button variant="destructive" className="w-full" onClick={handleFreezeAccount}>Freeze My Account</Button>
            </div>
          </DialogContent>
        </Dialog>

      </main>
    </div>
  );
};

export default SettingsPage;
