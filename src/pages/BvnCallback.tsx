import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
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
            title: 'BVN callback missing reference',
            description:
              'We could not read the verification reference from the redirect URL.',
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
        toast({
          title: 'Tier 2 Unlocked',
          description: `Welcome ${`${firstName} ${lastName}`.trim()}! Your BVN is verified.`,
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'BVN completion failed';
        toast({
          title: 'BVN verification not completed',
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
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-2">
        <div className="text-lg font-semibold">Completing BVN verification…</div>
        <div className="text-sm text-muted-foreground">
          {loading ? 'Please wait' : 'Redirecting…'}
        </div>
      </div>
    </div>
  );
}
