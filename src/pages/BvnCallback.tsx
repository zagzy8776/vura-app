import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Shield, Loader2 } from 'lucide-react';
import { apiFetch } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export default function BvnCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const reference =
          searchParams.get('reference') ||
          searchParams.get('tx_ref') ||
          searchParams.get('ref');
        if (!reference) {
          toast({
            title: 'Verification link invalid',
            description: 'Missing reference. Please try again from Settings.',
            variant: 'destructive',
          });
          navigate('/settings');
          return;
        }

        const res = await apiFetch('/kyc/complete-bvn', {
          method: 'POST',
          body: JSON.stringify({ reference }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.message || 'Failed to complete BVN verification');
        }

        const firstName = data?.data?.firstName || '';
        const lastName = data?.data?.lastName || '';
        const name = `${firstName} ${lastName}`.trim() || 'there';
        toast({
          title: 'BVN verified',
          description: `Welcome back, ${name}! Tier 2 limits are now active.`,
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Verification could not be completed';
        toast({
          title: 'Verification incomplete',
          description: message,
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
        navigate('/settings');
      }
    };

    run();
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center space-y-6 max-w-sm">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          {loading ? (
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          ) : (
            <Shield className="h-8 w-8 text-primary" />
          )}
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {loading ? 'Completing verification…' : 'Taking you back'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {loading ? 'Please wait a moment.' : 'Redirecting to Settings…'}
          </p>
        </div>
      </div>
    </div>
  );
}
