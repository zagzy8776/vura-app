import { useState, useEffect } from 'react';
import { getApiUrl } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Users,
  Shield,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  Loader2,
  Eye,
  EyeOff,
  Check,
  X,
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Banknote,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

interface User {
  id: string;
  vuraTag: string;
  email?: string | null;
  legalFirstName?: string | null;
  legalLastName?: string | null;
  kycTier: number;
  kycStatus: string;
  bvnVerified: boolean;
  bvnVerifiedAt?: string | null;
  ninVerified: boolean;
  ninVerifiedAt?: string | null;
  lastLoginAt?: string | null;
  fraudScore?: number;
  reservedAccountNumber?: string | null;
  reservedAccountBankName?: string | null;
  idCardUrl: string | null;
  selfieUrl: string | null;
  idType: string | null;
  kycRejectionReason?: string | null;
  createdAt: string;
}

/** Date when user entered verification (for queue ordering and "waiting" display). */
function getSubmittedAt(u: User): string | null {
  return u.ninVerifiedAt || u.bvnVerifiedAt || u.createdAt || null;
}
function getWaitingDays(u: User): number {
  const at = getSubmittedAt(u);
  if (!at) return 0;
  const ms = Date.now() - new Date(at).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

interface KYCStats {
  totalUsers: number;
  tierBreakdown: { tier1: number; tier2: number; tier3: number };
  kycStatusBreakdown: { pending: number; verified: number; rejected: number };
}

const ADMIN_SECRET_KEY = 'vura_admin_secret';
const LIMIT = 20;

/** All admin API calls use this base. Set VITE_API_URL to https://vura-app.onrender.com in Vercel so this points to your backend. */
function adminApi(path: string, options?: RequestInit & { headers?: HeadersInit }) {
  const base = getApiUrl();
  const url = path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
  return fetch(url, options);
}

export default function AdminDashboard() {
  const [adminSecret, setAdminSecret] = useState<string | null>(() =>
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(ADMIN_SECRET_KEY) : null,
  );
  const [secretInput, setSecretInput] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [backendHint, setBackendHint] = useState<{ length?: number; error?: string }>({});
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<KYCStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [rejectModal, setRejectModal] = useState<{ user: User; reason: string } | null>(null);
  const [verifyConfirm, setVerifyConfirm] = useState<User | null>(null);
  const [tier2Form, setTier2Form] = useState({ first: '', last: '', reason: '' });
  const [tier2Loading, setTier2Loading] = useState(false);
  const [creditForm, setCreditForm] = useState<{ vuraTag: string; amount: string; reason: string }>({
    vuraTag: '',
    amount: '',
    reason: '',
  });
  const [creditLoading, setCreditLoading] = useState(false);
  const [businessBalance, setBusinessBalance] = useState<number | null>(null);
  const [topUpForm, setTopUpForm] = useState({ amount: '', reference: '' });
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [paystackForm, setPaystackForm] = useState({ amount: '', reference: '' });
  const [paystackLoading, setPaystackLoading] = useState(false);
  const [verifyRefInput, setVerifyRefInput] = useState('');
  const [verifyRefLoading, setVerifyRefLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const authHeader = adminSecret ? `Bearer ${adminSecret}` : '';

  // On login screen: ping backend to show expected secret length (and confirm we're pointing at the right API)
  useEffect(() => {
    if (adminSecret) return;
    let cancelled = false;
    adminApi('admin/check')
      .then((res) => {
        if (cancelled) return;
        if (res.ok) return res.json().then((d) => setBackendHint({ length: d.secretLength }));
        setBackendHint({ error: `Backend returned ${res.status}. Redeploy the vura-app backend on Render (Manual Deploy → Deploy latest commit) so it has the admin routes. Test: open ${getApiUrl()}/health in a browser — if that works, the backend is up but needs a fresh deploy.` });
      })
      .catch(() => {
        if (!cancelled) setBackendHint({ error: 'Could not reach backend. Set VITE_API_URL to https://vura-app.onrender.com in Vercel and redeploy.' });
      });
    return () => { cancelled = true; };
  }, [adminSecret]);

  useEffect(() => {
    if (!adminSecret) {
      setLoading(false);
      return;
    }
    setLoading(true);
    adminApi(`admin/users?limit=${LIMIT}&page=${page}`, { headers: { Authorization: authHeader } })
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('Failed to fetch')))
      .then((data) => {
        setUsers(data.users || []);
        setTotalCount(data.total ?? 0);
        setTotalPages(Math.max(1, data.totalPages ?? 1));
      })
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
    adminApi('admin/stats/kyc', { headers: { Authorization: authHeader } })
      .then((res) => res.ok && res.json().then(setStats))
      .catch(() => {});
    adminApi('admin/balance', { headers: { Authorization: authHeader } })
      .then((res) => res.ok ? res.json() : { amount: 0 })
      .then((d) => setBusinessBalance(d?.amount ?? 0))
      .catch(() => setBusinessBalance(0));
  }, [adminSecret, page, authHeader]);

  useEffect(() => {
    if (selectedUser) setTier2Form({ first: selectedUser.legalFirstName || '', last: selectedUser.legalLastName || '', reason: '' });
  }, [selectedUser?.id]);

  // After redirect from Paystack: verify payment with Paystack and credit float (don't rely only on webhook)
  useEffect(() => {
    if (!adminSecret) return;
    const floatTopup = searchParams.get('float_topup');
    const ref = searchParams.get('ref');
    if (floatTopup === 'success' && ref) {
      setSearchParams((p) => {
        const next = new URLSearchParams(p);
        next.delete('float_topup');
        next.delete('ref');
        return next;
      }, { replace: true });
      adminApi('admin/verify-float-payment', {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: ref }),
      })
        .then((res) => res.json().catch(() => ({})))
        .then((data) => {
          if (data?.success) {
            toast.success(data.alreadyCredited ? 'Payment was already credited.' : (data.message || '₦' + (data.amount ?? '') + ' added to business float.'));
          } else {
            toast.error(data?.message || 'Could not verify payment. Use "Verify with reference" below.');
          }
        })
        .catch(() => toast.error('Verification failed. Use "Verify with reference" below.'))
        .finally(() => {
          adminApi('admin/balance', { headers: { Authorization: authHeader } })
            .then((r) => r.ok && r.json().then((d) => setBusinessBalance(d?.amount ?? 0)))
            .catch(() => {});
        });
    }
  }, [adminSecret, searchParams, authHeader, setSearchParams]);

  const handleLogin = async () => {
    const secret = secretInput.trim();
    if (!secret) {
      setLoginError('Enter your admin secret');
      return;
    }
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await adminApi('admin/users?limit=1', { headers: { Authorization: `Bearer ${secret}` } });
      if (res.ok) {
        sessionStorage.setItem(ADMIN_SECRET_KEY, secret);
        setAdminSecret(secret);
        setSecretInput('');
      } else {
        setLoginError('Invalid admin secret. Use ADMIN_SECRET from your backend (vura-app on Render).');
      }
    } catch {
      setLoginError('Could not reach server. Check the API URL below and try again.');
    } finally {
      setLoginLoading(false);
    }
  };

  const lockAdmin = () => {
    sessionStorage.removeItem(ADMIN_SECRET_KEY);
    setAdminSecret(null);
    setUsers([]);
    setStats(null);
  };

  const refetch = () => {
    if (adminSecret) {
      adminApi(`admin/users?limit=${LIMIT}&page=${page}`, { headers: { Authorization: authHeader } })
        .then((res) => res.ok && res.json())
        .then((data) => {
          if (data) setUsers(data.users || []);
          if (data?.total != null) setTotalCount(data.total);
          if (data?.totalPages != null) setTotalPages(Math.max(1, data.totalPages));
        });
      adminApi('admin/stats/kyc', { headers: { Authorization: authHeader } }).then((res) => res.ok && res.json().then(setStats));
    }
  };

  const handleVerify = async (user: User) => {
    if (!authHeader) return;
    setActionLoading(true);
    setVerifyConfirm(null);
    try {
      const res = await adminApi(`admin/users/${user.id}/verify-kyc`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: 3, notes: 'Verified by admin' }),
      });
      if (res.ok) {
        toast.success('KYC approved. User is now Tier 3.');
        refetch();
        setSelectedUser(null);
      } else throw new Error();
    } catch {
      toast.error('Failed to verify KYC');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectModal || !authHeader) return;
    const reason = rejectModal.reason.trim() || 'Documents could not be verified. Please try again with a valid ID and clear selfie.';
    setActionLoading(true);
    try {
      const res = await adminApi(`admin/users/${rejectModal.user.id}/reject-kyc`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        toast.success('KYC rejected. User will see the reason in Settings → Identity verification.');
        refetch();
        setSelectedUser(null);
        setRejectModal(null);
      } else throw new Error();
    } catch {
      toast.error('Failed to reject KYC');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSetTier2 = async () => {
    if (!selectedUser || !authHeader) return;
    const first = tier2Form.first.trim();
    const last = tier2Form.last.trim();
    if (!first || !last) {
      toast.error('First and last name required');
      return;
    }
    setTier2Loading(true);
    try {
      const res = await adminApi(`admin/users/${selectedUser.id}/set-tier-2`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: first, lastName: last, reason: tier2Form.reason.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.message || 'User set to Tier 2.');
        setTier2Form({ first: '', last: '', reason: '' });
        refetch();
        setSelectedUser(null);
      } else toast.error(data.message || 'Failed to set Tier 2');
    } catch {
      toast.error('Failed to set Tier 2');
    } finally {
      setTier2Loading(false);
    }
  };

  const handleCreditUser = async () => {
    const tag = creditForm.vuraTag.trim().replace(/^@/, '');
    const amount = parseFloat(creditForm.amount);
    const reason = creditForm.reason.trim();
    if (!tag || !Number.isFinite(amount) || amount < 1 || amount > 50_000_000) {
      toast.error('Enter a valid @vuraTag and amount (₦1 – ₦50,000,000)');
      return;
    }
    if (!reason) {
      toast.error('Reason is required (e.g. Crypto purchase USDT - ref 123)');
      return;
    }
    if (!authHeader) return;
    setCreditLoading(true);
    try {
      const res = await adminApi('admin/credit', {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ vuraTag: tag, amount, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.message || `₦${amount.toLocaleString()} credited to @${tag}`);
        setCreditForm({ vuraTag: '', amount: '', reason: '' });
        adminApi('admin/balance', { headers: { Authorization: authHeader } })
          .then((r) => r.ok && r.json().then((d) => setBusinessBalance(d?.amount ?? 0)));
      } else {
        toast.error(data.message || 'Credit failed');
      }
    } catch {
      toast.error('Credit request failed');
    } finally {
      setCreditLoading(false);
    }
  };

  const handleTopUp = async () => {
    const amount = parseFloat(topUpForm.amount);
    const reference = topUpForm.reference.trim();
    if (!Number.isFinite(amount) || amount < 1 || amount > 50_000_000) {
      toast.error('Enter a valid amount (₦1 – ₦50,000,000)');
      return;
    }
    if (!reference) {
      toast.error('Reference is required (e.g. bank ref, tx hash) for accountability');
      return;
    }
    if (!authHeader) return;
    setTopUpLoading(true);
    try {
      const res = await adminApi('admin/top-up', {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, reference }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.message || `₦${amount.toLocaleString()} added to business float`);
        setTopUpForm({ amount: '', reference: '' });
        setBusinessBalance(data?.data?.balanceAfter != null ? parseFloat(data.data.balanceAfter) : (businessBalance ?? 0) + amount);
        adminApi('admin/balance', { headers: { Authorization: authHeader } })
          .then((r) => r.ok && r.json().then((d) => setBusinessBalance(d?.amount ?? 0)));
      } else {
        toast.error(data.message || 'Top-up failed');
      }
    } catch {
      toast.error('Top-up request failed');
    } finally {
      setTopUpLoading(false);
    }
  };

  const handleTopUpPaystack = async () => {
    const amount = parseFloat(paystackForm.amount);
    if (!Number.isFinite(amount) || amount < 100 || amount > 50_000_000) {
      toast.error('Enter a valid amount (₦100 – ₦50,000,000)');
      return;
    }
    if (!authHeader) return;
    setPaystackLoading(true);
    try {
      const res = await adminApi('admin/top-up-paystack', {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          reference: paystackForm.reference.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.authorizationUrl) {
        toast.success('Redirecting to Paystack…');
        window.location.href = data.authorizationUrl;
        return;
      }
      toast.error(data.message || 'Could not start payment');
    } catch {
      toast.error('Request failed');
    } finally {
      setPaystackLoading(false);
    }
  };

  const handleVerifyFloatPayment = async () => {
    const ref = verifyRefInput.trim();
    if (!ref) {
      toast.error('Enter the reference (from Paystack or from the URL after payment)');
      return;
    }
    if (!authHeader) return;
    setVerifyRefLoading(true);
    try {
      const res = await adminApi('admin/verify-float-payment', {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: ref }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        toast.success(data.alreadyCredited ? 'Already credited to your float.' : (data.message || `₦${data.amount ?? ''} added to business float.`));
        setVerifyRefInput('');
        adminApi('admin/balance', { headers: { Authorization: authHeader } })
          .then((r) => r.ok && r.json().then((d) => setBusinessBalance(d?.amount ?? 0)))
          .catch(() => {});
      } else {
        toast.error(data?.message || 'Verification failed');
      }
    } catch {
      toast.error('Request failed');
    } finally {
      setVerifyRefLoading(false);
    }
  };

  const pendingUsers = users
    .filter((u) => u.kycStatus === 'PENDING')
    .sort((a, b) => {
      const atA = getSubmittedAt(a) || '';
      const atB = getSubmittedAt(b) || '';
      return atA.localeCompare(atB);
    });
  const searchLower = search.trim().toLowerCase();
  const matchesSearch = (u: User) =>
    !searchLower ||
    u.vuraTag.toLowerCase().includes(searchLower) ||
    (u.email && u.email.toLowerCase().includes(searchLower));
  const filtered =
    tab === 'all'
      ? users.filter(matchesSearch)
      : pendingUsers.filter(matchesSearch);

  // ——— Login screen ———
  if (!adminSecret) {
    const apiBase = getApiUrl();
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Admin access</CardTitle>
            <CardDescription>
              Enter ADMIN_SECRET from your backend (vura-app on Render). All requests are sent to the API below.
            </CardDescription>
            <p className="text-xs font-mono text-muted-foreground mt-2 break-all" title="Set VITE_API_URL in Vercel to https://vura-app.onrender.com">
              API: {apiBase}
            </p>
            {backendHint.error && <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">{backendHint.error}</p>}
            {backendHint.length != null && !backendHint.error && (
              <p className="text-sm text-muted-foreground mt-1">Backend expects a secret of <strong>{backendHint.length}</strong> characters.</p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="admin-secret">Admin secret</Label>
              <div className="relative mt-2">
                <Input
                  id="admin-secret"
                  type={showSecret ? 'text' : 'password'}
                  placeholder="ADMIN_SECRET"
                  value={secretInput}
                  onChange={(e) => { setSecretInput(e.target.value); setLoginError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  className="font-mono pr-10"
                />
                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowSecret((v) => !v)} aria-label={showSecret ? 'Hide' : 'Show'}>
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              {showSecret && secretInput.length > 0 && backendHint.length != null && (
                <p className="text-xs text-muted-foreground mt-1">
                  You entered {secretInput.length} character{secretInput.length !== 1 ? 's' : ''} — {secretInput.length === backendHint.length ? 'length matches.' : `backend expects ${backendHint.length}.`}
                </p>
              )}
            </div>
            {loginError && <p className="text-sm text-destructive">{loginError}</p>}
            <Button className="w-full" onClick={handleLogin} disabled={loginLoading || !secretInput.trim()}>
              {loginLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Access admin dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  // ——— Dashboard ———
  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-4">
              <Link to="/" className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm">
                <ArrowLeft className="w-4 h-4" /> Back to Vura
              </Link>
              <Shield className="w-6 h-6 text-primary" />
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Vura Admin</h1>
                <p className="text-xs text-muted-foreground">KYC verification &amp; user review</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={lockAdmin}>Lock admin</Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="mb-6 p-4 rounded-lg border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <p className="font-medium">Compliance &amp; fraud prevention</p>
            <p className="mt-1 text-amber-700 dark:text-amber-300">
              Only approve after confirming identity. Reject if anything is suspicious. All actions are logged.
            </p>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className="border-0 shadow-sm"><CardContent className="pt-5 pb-5"><div className="flex items-center gap-3"><Users className="w-9 h-9 text-blue-600" /><div><p className="text-2xl font-bold tabular-nums">{stats.totalUsers}</p><p className="text-xs text-muted-foreground">Total users</p></div></div></CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="pt-5 pb-5"><div className="flex items-center gap-3"><Clock className="w-9 h-9 text-amber-600" /><div><p className="text-2xl font-bold tabular-nums">{stats.kycStatusBreakdown.pending}</p><p className="text-xs text-muted-foreground">Pending review</p></div></div></CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="pt-5 pb-5"><div className="flex items-center gap-3"><CheckCircle className="w-9 h-9 text-green-600" /><div><p className="text-2xl font-bold tabular-nums">{stats.kycStatusBreakdown.verified}</p><p className="text-xs text-muted-foreground">Verified</p></div></div></CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="pt-5 pb-5"><div className="flex items-center gap-3"><XCircle className="w-9 h-9 text-red-600" /><div><p className="text-2xl font-bold tabular-nums">{stats.kycStatusBreakdown.rejected}</p><p className="text-xs text-muted-foreground">Rejected</p></div></div></CardContent></Card>
          </div>
        )}

        {/* Business float: top up first, then credit customers from it */}
        <Card className="shadow-sm mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Banknote className="w-5 h-5" />
              Business float
            </CardTitle>
            <CardDescription>
              Money you have lodged (with a reference) for accountability. You can only credit customers from this balance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
              <span className="text-sm font-medium text-muted-foreground">Available to send</span>
              <span className="text-2xl font-bold tabular-nums">
                ₦{businessBalance != null ? Number(businessBalance).toLocaleString('en-NG', { minimumFractionDigits: 2 }) : '—'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Amount to add (₦)</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="e.g. 100000"
                  value={topUpForm.amount}
                  onChange={(e) => setTopUpForm((f) => ({ ...f, amount: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Reference (required)</Label>
                <Input
                  placeholder="e.g. Bank ref, tx hash"
                  value={topUpForm.reference}
                  onChange={(e) => setTopUpForm((f) => ({ ...f, reference: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <Button onClick={handleTopUp} disabled={topUpLoading}>
              {topUpLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Top up business float (record only)
            </Button>
            <div className="border-t pt-4 mt-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">Or pay with card/bank (Paystack)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Amount (₦)</Label>
                  <Input
                    type="number"
                    min={100}
                    placeholder="e.g. 100000"
                    value={paystackForm.amount}
                    onChange={(e) => setPaystackForm((f) => ({ ...f, amount: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Note (optional)</Label>
                  <Input
                    placeholder="e.g. March float"
                    value={paystackForm.reference}
                    onChange={(e) => setPaystackForm((f) => ({ ...f, reference: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              </div>
              <Button
                variant="secondary"
                className="mt-2"
                onClick={handleTopUpPaystack}
                disabled={paystackLoading}
              >
                {paystackLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Top up with Paystack
              </Button>
            </div>
            <div className="border-t pt-4 mt-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">Payment didn’t show? Verify with reference</p>
              <p className="text-xs text-muted-foreground mb-2">If you paid but the balance didn’t update, enter the reference from the redirect URL (ref=...) or from your Paystack dashboard.</p>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-[200px]">
                  <Label className="text-xs">Reference</Label>
                  <Input
                    placeholder="e.g. ADMIN-FLOAT-abc-123..."
                    value={verifyRefInput}
                    onChange={(e) => setVerifyRefInput(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={handleVerifyFloatPayment}
                  disabled={verifyRefLoading}
                >
                  {verifyRefLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Verify payment
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Credit user — deducts from business float */}
        <Card className="shadow-sm mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Banknote className="w-5 h-5" />
              Credit a customer’s wallet
            </CardTitle>
            <CardDescription>
              Add NGN to a <strong>customer’s</strong> Vura balance (e.g. after they paid you for crypto). Deducts from your business float above — top up first if needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Customer’s @vuraTag</Label>
                <Input
                  placeholder="the user to credit (e.g. johndoe)"
                  value={creditForm.vuraTag}
                  onChange={(e) => setCreditForm((f) => ({ ...f, vuraTag: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Amount (₦)</Label>
                <Input
                  type="number"
                  min={1}
                  max={50000000}
                  placeholder="e.g. 50000"
                  value={creditForm.amount}
                  onChange={(e) => setCreditForm((f) => ({ ...f, amount: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Reason (required)</Label>
                <Input
                  placeholder="e.g. Crypto USDT - ref #123"
                  value={creditForm.reason}
                  onChange={(e) => setCreditForm((f) => ({ ...f, reason: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <Button
              onClick={handleCreditUser}
              disabled={creditLoading}
              className="sm:self-end shrink-0"
            >
              {creditLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Credit customer
            </Button>
          </CardContent>
        </Card>

        <div className="mb-4 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
          <div className="flex rounded-lg border bg-background p-1">
            <button type="button" onClick={() => setTab('pending')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'pending' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              Pending ({pendingUsers.length})
            </button>
            <button type="button" onClick={() => setTab('all')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'all' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              All users
            </button>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by @tag or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
        </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">KYC queue</CardTitle>
          <CardDescription>{tab === 'pending' ? 'Oldest first. Review and approve or reject.' : 'All users. Use search to find by @tag or email.'}</CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {tab === 'pending' ? 'No users pending review.' : users.length === 0 ? 'No users yet.' : 'No matches.'}
            </p>
          ) : (
            <>
              <div className="space-y-3">
                {filtered.map((user) => {
                  const submittedAt = getSubmittedAt(user);
                  const waitingDays = getWaitingDays(user);
                  const hasRisk = typeof user.fraudScore === 'number' && user.fraudScore > 0;
                  return (
                    <div
                      key={user.id}
                      className={`flex items-center justify-between p-4 border rounded-lg ${hasRisk ? 'border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-950/20' : ''}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                          <span className="font-bold text-primary">{user.vuraTag[0].toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="font-medium">@{user.vuraTag}</p>
                          <p className="text-sm text-muted-foreground">
                            Tier {user.kycTier} · Joined {new Date(user.createdAt).toLocaleDateString()}
                            {tab === 'pending' && submittedAt && (
                              <> · Submitted {new Date(submittedAt).toLocaleDateString()}</>
                            )}
                          </p>
                          {tab === 'pending' && waitingDays > 0 && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                              Waiting {waitingDays} day{waitingDays !== 1 ? 's' : ''}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {hasRisk && (
                          <Badge variant="destructive" className="font-semibold">Risk {user.fraudScore}</Badge>
                        )}
                        <Badge variant={user.kycStatus === 'VERIFIED' ? 'default' : 'secondary'}>{user.kycStatus || 'PENDING'}</Badge>
                        {(user.idCardUrl || user.selfieUrl) && <Badge variant="outline">{user.idCardUrl && user.selfieUrl ? 'ID + Selfie' : user.idCardUrl ? 'ID only' : 'Selfie only'}</Badge>}
                        <Button variant="outline" size="sm" onClick={() => setSelectedUser(user)}><Eye className="w-4 h-4 mr-1" /> Review</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {tab === 'all' && totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 mt-4 border-t">
                  <p className="text-sm text-muted-foreground">Page {page} of {totalPages} ({totalCount} users)</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft className="w-4 h-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}><ChevronRight className="w-4 h-4" /></Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      </main>

      {/* Verify confirm */}
      {verifyConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <Card className="w-full max-w-md">
            <CardHeader><CardTitle>Approve KYC</CardTitle><CardDescription>Approve @{verifyConfirm.vuraTag} to Tier 3? They will get full limits.</CardDescription></CardHeader>
            <CardContent className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setVerifyConfirm(null)}>Cancel</Button>
              <Button className="bg-green-600 hover:bg-green-700" onClick={() => handleVerify(verifyConfirm)} disabled={actionLoading}>{actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Yes, approve</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* User detail modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>KYC Review — @{selectedUser.vuraTag}</CardTitle>
              <CardDescription>{selectedUser.id}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!(selectedUser.idCardUrl || selectedUser.selfieUrl) ? (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Prembly verification</p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">This user verified via Prembly (BVN + NIN + face). If Prembly sent document/selfie images, they appear below. Otherwise approve only if satisfied.</p>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Review checklist (ID/selfie)</p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">Confirm ID and selfie are valid. Reject if invalid or unclear.</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><p className="text-sm font-medium">Legal name</p><p>{[selectedUser.legalFirstName, selectedUser.legalLastName].filter(Boolean).join(' ') || 'Not set'}</p></div>
                <div><p className="text-sm font-medium">KYC Tier</p><p>{selectedUser.kycTier}</p></div>
                <div><p className="text-sm font-medium">KYC Status</p><Badge variant={selectedUser.kycStatus === 'VERIFIED' ? 'default' : 'secondary'}>{selectedUser.kycStatus}</Badge></div>
                <div><p className="text-sm font-medium">BVN verified</p><p>{selectedUser.bvnVerified ? 'Yes' : 'No'}</p></div>
                <div><p className="text-sm font-medium">BVN verified at</p><p>{selectedUser.bvnVerifiedAt ? new Date(selectedUser.bvnVerifiedAt).toLocaleString() : '—'}</p></div>
                <div><p className="text-sm font-medium">NIN verified</p><p>{selectedUser.ninVerified ? 'Yes' : 'No'}</p></div>
                <div><p className="text-sm font-medium">NIN verified at</p><p>{selectedUser.ninVerifiedAt ? new Date(selectedUser.ninVerifiedAt).toLocaleString() : '—'}</p></div>
                <div><p className="text-sm font-medium">ID type</p><p>{selectedUser.idType || '—'}</p></div>
                {typeof selectedUser.fraudScore === 'number' && selectedUser.fraudScore > 0 && (
                  <div className="col-span-2 p-3 rounded-lg border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30">
                    <p className="text-sm font-semibold text-red-700 dark:text-red-300">Fraud / risk score: {selectedUser.fraudScore}</p>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">Review carefully before approving. Reject if anything is suspicious.</p>
                  </div>
                )}
                {selectedUser.lastLoginAt && <div><p className="text-sm font-medium">Last login</p><p>{new Date(selectedUser.lastLoginAt).toLocaleString()}</p></div>}
                {selectedUser.kycRejectionReason && <div className="col-span-2"><p className="text-sm font-medium text-red-600">Previous rejection</p><p className="text-sm text-muted-foreground">{selectedUser.kycRejectionReason}</p></div>}
                <div className="col-span-2"><p className="text-sm font-medium">Bank account</p><p>{selectedUser.reservedAccountNumber ? `${selectedUser.reservedAccountNumber} (${selectedUser.reservedAccountBankName || 'Bank'})` : 'Not generated'}</p></div>
                <div><p className="text-sm font-medium">Joined</p><p>{new Date(selectedUser.createdAt).toLocaleString()}</p></div>
                <div><p className="text-sm font-medium">Verification submitted</p><p>{(selectedUser.ninVerifiedAt || selectedUser.bvnVerifiedAt) ? new Date(selectedUser.ninVerifiedAt || selectedUser.bvnVerifiedAt!).toLocaleString() : '—'}</p></div>
              </div>

              {(selectedUser.kycTier < 2 || !selectedUser.bvnVerified) && (
                <div className="p-4 border border-dashed border-primary/50 rounded-lg bg-primary/5 space-y-3">
                  <p className="text-sm font-medium">Set Tier 2 manually</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">First name</Label><Input placeholder="Legal first name" value={tier2Form.first} onChange={(e) => setTier2Form((f) => ({ ...f, first: e.target.value }))} className="mt-1" /></div>
                    <div><Label className="text-xs">Last name</Label><Input placeholder="Legal last name" value={tier2Form.last} onChange={(e) => setTier2Form((f) => ({ ...f, last: e.target.value }))} className="mt-1" /></div>
                  </div>
                  <div><Label className="text-xs">Reason (optional)</Label><Input placeholder="e.g. Verified offline" value={tier2Form.reason} onChange={(e) => setTier2Form((f) => ({ ...f, reason: e.target.value }))} className="mt-1" /></div>
                  <Button size="sm" onClick={handleSetTier2} disabled={tier2Loading || !tier2Form.first.trim() || !tier2Form.last.trim()}>{tier2Loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Set Tier 2</Button>
                </div>
              )}

              {selectedUser.idCardUrl ? <div><p className="text-sm font-medium mb-2">ID document</p><img src={selectedUser.idCardUrl} alt="ID" className="max-w-full max-h-64 object-contain border rounded bg-muted/50" /></div> : <div className="p-4 border border-dashed rounded text-center text-muted-foreground text-sm">No ID document</div>}
              {selectedUser.selfieUrl ? <div><p className="text-sm font-medium mb-2">Selfie</p><img src={selectedUser.selfieUrl} alt="Selfie" className="max-w-full max-h-64 object-contain border rounded bg-muted/50" /></div> : <div className="p-4 border border-dashed rounded text-center text-muted-foreground text-sm">No selfie</div>}

              <div className="flex gap-4 pt-4">
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => setVerifyConfirm(selectedUser)} disabled={actionLoading}>{actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />} Approve KYC</Button>
                <Button variant="destructive" className="flex-1" onClick={() => setRejectModal({ user: selectedUser, reason: '' })} disabled={actionLoading}><X className="w-4 h-4 mr-2" /> Reject KYC</Button>
                <Button variant="outline" onClick={() => setSelectedUser(null)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600"><X className="h-5 w-5" /> Reject KYC</CardTitle>
              <CardDescription>This reason will be shown to @{rejectModal.user.vuraTag} in Settings → Identity verification. A reason is required.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="reject-reason">Reason for rejection (required)</Label>
                <textarea id="reject-reason" value={rejectModal.reason} onChange={(e) => setRejectModal((m) => m ? { ...m, reason: e.target.value } : m)} placeholder="e.g. ID document unclear; please upload a clear government-issued ID" className="w-full min-h-[100px] px-3 py-2 text-sm border rounded-md bg-background mt-1" maxLength={500} />
              </div>
              <div className="flex gap-2">
                <Button variant="destructive" className="flex-1" onClick={handleReject} disabled={actionLoading || !rejectModal.reason.trim()}>{actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Confirm reject</Button>
                <Button variant="outline" onClick={() => setRejectModal(null)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
