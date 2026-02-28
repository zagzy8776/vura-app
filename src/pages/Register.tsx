import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { checkPasswordStrength } from "@/lib/security";

const Register = () => {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [vuraTag, setVuraTag] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const passwordStrength = checkPasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate phone
    if (phone.length < 10) {
      toast({ title: "Invalid phone", description: "Enter a valid phone number", variant: "destructive" });
      return;
    }
    
    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address", variant: "destructive" });
      return;
    }
    
    // Validate password
    if (password.length < 8) {
      toast({ title: "Weak password", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please ensure both passwords are the same", variant: "destructive" });
      return;
    }
    
    // Validate tag
    if (!/^[a-zA-Z0-9_]{3,15}$/.test(vuraTag)) {
      toast({ title: "Invalid tag", description: "Tag must be 3-15 alphanumeric characters", variant: "destructive" });
      return;
    }
    
    // Validate PIN
    if (pin.length !== 6) {
      toast({ title: "Invalid PIN", description: "PIN must be 6 digits", variant: "destructive" });
      return;
    }
    
    // Validate terms acceptance
    if (!acceptTerms) {
      toast({ title: "Terms required", description: "Please accept the Terms of Service and Privacy Policy", variant: "destructive" });
      return;
    }
    
    setLoading(true);
    try {
      // Clean phone - remove any non-digits
      const cleanPhone = phone.replace(/\D/g, "");
      await signUp(cleanPhone, pin, vuraTag, email, password);
      toast({ title: "Account created!", description: "Welcome to Vura" });
      navigate("/");
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : "Registration failed";

      // signUp throws a JSON string when OTP verification is required
      try {
        const parsed = JSON.parse(rawMessage);
        if (parsed?.code === "REGISTRATION_OTP_REQUIRED") {
          if (parsed.otp) {
            toast({
              title: "OTP (email bypass)",
              description: `Your OTP is: ${parsed.otp}`,
            });
          }
          toast({
            title: "Verify your email",
            description: parsed.message || "Enter the code sent to your email",
          });
          navigate("/verify-otp", {
            state: {
              mode: "registration",
              pendingId: parsed.pendingId,
              email,
              message: parsed.message,
            },
          });
          return;
        }
      } catch {
        // ignore JSON parse errors
      }

      toast({
        title: "Registration failed",
        description: rawMessage,
        variant: "destructive",
      });
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
              <label className="text-sm font-medium text-foreground mb-1.5 block">Email Address</label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 rounded-xl"
              />
              <p className="text-xs text-muted-foreground mt-1">For account recovery and security notifications</p>
            </div>
            
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Create a strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="h-12 rounded-xl pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {password && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <div
                        key={level}
                        className={`h-1 flex-1 rounded ${
                          level <= passwordStrength.strength
                            ? passwordStrength.strength < 3
                              ? "bg-red-500"
                              : passwordStrength.strength < 4
                                ? "bg-yellow-500"
                                : "bg-green-500"
                            : "bg-gray-200"
                        }`}
                      />
                    ))}
                  </div>
                  <p className={`text-xs ${
                    passwordStrength.strength < 3
                      ? "text-red-500"
                      : passwordStrength.strength < 4
                        ? "text-yellow-500"
                        : "text-green-500"
                  }`}>
                    {passwordStrength.message}
                  </p>
                </div>
              )}
            </div>
            
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Confirm Password</label>
              <Input
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="h-12 rounded-xl"
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-500 mt-1">Passwords don't match</p>
              )}
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

            <div className="flex items-start space-x-2">
              <Checkbox
                id="terms"
                checked={acceptTerms}
                onCheckedChange={(checked) => setAcceptTerms(checked as boolean)}
                className="mt-1"
              />
              <label
                htmlFor="terms"
                className="text-sm text-muted-foreground cursor-pointer"
              >
                I agree to the{" "}
                <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>
                {" "}and{" "}
                <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
              </label>
            </div>

            <Button 
              type="submit" 
              disabled={loading || pin.length !== 6 || !acceptTerms || password !== confirmPassword} 
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
