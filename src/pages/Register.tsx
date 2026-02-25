import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

const Register = () => {
  const [phone, setPhone] = useState("");
  const [vuraTag, setVuraTag] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (phone.length < 10) {
      toast({ title: "Invalid phone", description: "Enter a valid phone number", variant: "destructive" });
      return;
    }
    
    if (!/^[a-zA-Z0-9_]{3,15}$/.test(vuraTag)) {
      toast({ title: "Invalid tag", description: "Tag must be 3-15 alphanumeric characters", variant: "destructive" });
      return;
    }
    
    if (pin.length !== 6) {
      toast({ title: "Invalid PIN", description: "PIN must be 6 digits", variant: "destructive" });
      return;
    }
    
    setLoading(true);
    try {
      // Clean phone - remove any non-digits
      const cleanPhone = phone.replace(/\D/g, "");
      await signUp(cleanPhone, pin, vuraTag);
      toast({ title: "Account created!", description: "Welcome to Vura" });
      navigate("/");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Registration failed";
      toast({ title: "Registration failed", description: errorMessage, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 gradient-card items-center justify-center p-12">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-md text-primary-foreground"
        >
          <div className="flex items-center gap-2 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-brand">
              <span className="text-xl font-bold">V</span>
            </div>
            <span className="text-2xl font-bold tracking-tight">Vura</span>
          </div>
          <h2 className="text-4xl font-bold mb-4 leading-tight">Start your<br />journey today.</h2>
          <p className="text-lg opacity-70">Join millions sending money across borders with zero hassle.</p>
        </motion.div>
      </div>

      {/* Right panel */}
      <div className="flex flex-1 items-center justify-center p-8 bg-background">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full max-w-md"
        >
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-brand">
              <span className="text-lg font-bold text-primary-foreground">V</span>
            </div>
            <span className="text-xl font-bold text-foreground">Vura</span>
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-1">Create account</h1>
          <p className="text-muted-foreground mb-8">Choose your Vura Tag and 6-digit PIN</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Phone Number</label>
              <Input
                type="tel"
                placeholder="08012345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                required
                className="h-12 rounded-xl"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Choose Vura Tag</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                <Input
                  type="text"
                  placeholder="yourname"
                  value={vuraTag}
                  onChange={(e) => setVuraTag(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase())}
                  required
                  className="h-12 rounded-xl pl-7"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">This is how others will send you money</p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">6-digit PIN</label>
              <div className="relative">
                <Input
                  type={showPin ? "text" : "password"}
                  placeholder="••••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  maxLength={6}
                  className="h-12 rounded-xl pr-10 text-center tracking-widest font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">You'll need this PIN to authorize transactions</p>
            </div>

            <Button 
              type="submit" 
              disabled={loading || pin.length !== 6} 
              className="w-full h-12 rounded-xl gradient-brand text-primary-foreground font-semibold text-sm hover:opacity-90 border-0"
            >
              {loading ? "Creating account..." : "Create Account"}
              {!loading && <ArrowRight className="h-4 w-4 ml-1" />}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-primary font-semibold hover:underline">Sign in</Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default Register;
