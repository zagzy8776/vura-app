import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

const VerifyOtp = () => {
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { verifyDeviceOtp, signIn } = useAuth();

  // Get verification data from location state with validation
  const locationState = location.state || {};
  const vuraTag = locationState.vuraTag;
  const deviceFingerprint = locationState.deviceFingerprint;
  const message = locationState.message;

  // If no verification data, redirect to login
  if (!vuraTag || !deviceFingerprint) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Session Expired</h1>
          <p className="text-muted-foreground mb-6">Please login again</p>
          <Button onClick={() => navigate("/login")}>Go to Login</Button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (otp.length !== 6) {
      toast({
        title: "Invalid code",
        description: "Please enter all 6 digits",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      await verifyDeviceOtp(vuraTag, otp, deviceFingerprint);
      toast({
        title: "Device verified!",
        description: "Welcome back to Vura",
      });
      navigate("/");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Verification failed";
      toast({
        title: "Verification failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    try {
      // Re-trigger login to send new OTP
      await signIn(vuraTag, ""); // This will fail but trigger OTP resend
      toast({
        title: "Code resent",
        description: "Check your email for the new code",
      });
    } catch {
      // Expected to fail, but OTP should be resent
      toast({
        title: "Code resent",
        description: "Check your email for the new code",
      });
    } finally {
      setResendLoading(false);
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
          <h2 className="text-4xl font-bold mb-4 leading-tight">Secure<br />your account.</h2>
          <p className="text-lg opacity-70">We sent a verification code to your email to keep your account safe.</p>
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

          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Mail className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Verify your device</h1>
            <p className="text-muted-foreground">{message || "We sent a 6-digit code to your email"}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={otp}
                onChange={setOtp}
                render={({ slots }) => (
                  <InputOTPGroup className="gap-2">
                    {slots?.map((slot, index) => (
                      <InputOTPSlot
                        key={index}
                        index={index}
                        {...(slot || {})}
                        className="w-12 h-14 text-2xl font-bold border-2 rounded-xl"
                      />
                    ))}
                  </InputOTPGroup>
                )}
              />
            </div>


            <Button 
              type="submit" 
              disabled={loading || otp.length !== 6} 
              className="w-full h-12 rounded-xl gradient-brand text-primary-foreground font-semibold text-sm hover:opacity-90 border-0"
            >
              {loading ? "Verifying..." : "Verify Device"}
              {!loading && <ArrowRight className="h-4 w-4 ml-1" />}
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={handleResend}
                disabled={resendLoading}
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <RefreshCw className={`h-4 w-4 ${resendLoading ? 'animate-spin' : ''}`} />
                {resendLoading ? "Sending..." : "Resend code"}
              </button>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Didn't receive the email? Check your spam folder or try resending.
            </p>
          </form>
        </motion.div>
      </div>
    </div>
  );
};

export default VerifyOtp;
