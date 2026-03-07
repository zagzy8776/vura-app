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
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface User {
  id: string;
  vuraTag: string;
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

  const authHeader = adminSecret ? `Bearer ${adminSecret}` : '';

  // On login screen: ping backend to show expected secret length (and confirm we're pointing at the right API)
  useEffect(() => {
    if (adminSecret) return;
    let cancelled = false;
    adminApi('admin/check')
      .then((res) => {
        if (cancelled) return;
        if (res.ok) return res.json().then((d) => setBackendHint({ length: d.secretLength }));
        setBackendHint({ error: `Backend returned ${res.status}. Ensure your backend is deployed at the API URL below.` });
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
  }, [adminSecret, page, authHeader]);

  useEffect(() => {
    if (selectedUser) setTier2Form({ first: selectedUser.legalFirstName || '', last: selectedUser.legalLastName || '', reason: '' });
  }, [selectedUser?.id]);

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

  const pendingUsers = users.filter((u) => u.kycStatus === 'PENDING');
  const filtered =
    tab === 'all'
      ? users.filter((u) => !search || u.vuraTag.toLowerCase().includes(search.toLowerCase()))
      : pendingUsers.filter((u) => !search || u.vuraTag.toLowerCase().includes(search.toLowerCase()));

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
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
            <ArrowLeft className="w-4 h-4" /> Back to Vura
          </Link>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        </div>
        <Button variant="outline" size="sm" onClick={lockAdmin}>Lock admin</Button>
      </div>

      <div className="mb-6 p-4 rounded-lg border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800 dark:text-amber-200">
          <p className="font-medium">Compliance &amp; fraud prevention</p>
          <p className="mt-1 text-amber-700 dark:text-amber-300">
            Only approve after confirming identity. Reject if anything is suspicious. All actions are logged. See docs/ADMIN_AND_FRAUD_PREVENTION.md.
          </p>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><Users className="w-10 h-10 text-blue-500" /><div><p className="text-2xl font-bold">{stats.totalUsers}</p><p className="text-sm text-gray-500">Total Users</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><Clock className="w-10 h-10 text-yellow-500" /><div><p className="text-2xl font-bold">{stats.kycStatusBreakdown.pending}</p><p className="text-sm text-gray-500">Pending KYC</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><CheckCircle className="w-10 h-10 text-green-500" /><div><p className="text-2xl font-bold">{stats.kycStatusBreakdown.verified}</p><p className="text-sm text-gray-500">Verified</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><XCircle className="w-10 h-10 text-red-500" /><div><p className="text-2xl font-bold">{stats.kycStatusBreakdown.rejected}</p><p className="text-sm text-gray-500">Rejected</p></div></div></CardContent></Card>
        </div>
      )}

      <div className="mb-6 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <div className="flex rounded-lg border p-1 bg-muted/30">
          <button type="button" onClick={() => setTab('pending')} className={`px-4 py-2 rounded-md text-sm font-medium ${tab === 'pending' ? 'bg-background shadow' : 'text-muted-foreground'}`}>
            Pending ({pendingUsers.length})
          </button>
          <button type="button" onClick={() => setTab('all')} className={`px-4 py-2 rounded-md text-sm font-medium ${tab === 'all' ? 'bg-background shadow' : 'text-muted-foreground'}`}>
            All users
          </button>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by vura tag..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>KYC Verification</CardTitle>
          <CardDescription>Approve or reject users. Prembly (BVN + NIN + face) or ID/selfie uploads.</CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {tab === 'pending' ? 'No users pending review.' : users.length === 0 ? 'No users yet.' : 'No matches.'}
            </p>
          ) : (
            <>
              <div className="space-y-4">
                {filtered.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center"><span className="font-bold text-primary">{user.vuraTag[0].toUpperCase()}</span></div>
                      <div>
                        <p className="font-medium">@{user.vuraTag}</p>
                        <p className="text-sm text-muted-foreground">Tier {user.kycTier} · Joined {new Date(user.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {typeof user.fraudScore === 'number' && user.fraudScore > 0 && <Badge variant="destructive">Risk {user.fraudScore}</Badge>}
                      <Badge variant={user.kycStatus === 'VERIFIED' ? 'default' : 'secondary'}>{user.kycStatus || 'PENDING'}</Badge>
                      {(user.idCardUrl || user.selfieUrl) && <Badge variant="outline">{user.idCardUrl && user.selfieUrl ? 'ID + Selfie' : user.idCardUrl ? 'ID only' : 'Selfie only'}</Badge>}
                      <Button variant="outline" size="sm" onClick={() => setSelectedUser(user)}><Eye className="w-4 h-4 mr-1" /> Review</Button>
                    </div>
                  </div>
                ))}
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
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">This user verified via Prembly (BVN + NIN + face). We don&apos;t store ID/selfie here. Approve only if satisfied. Reject if anything seems off.</p>
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
                {typeof selectedUser.fraudScore === 'number' && selectedUser.fraudScore > 0 && <div className="col-span-2"><p className="text-sm font-medium text-red-600">Fraud score</p><p>{selectedUser.fraudScore} — review carefully.</p></div>}
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
              <CardDescription>This reason will be shown to @{rejectModal.user.vuraTag} in Settings → Identity verification.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="reject-reason">Reason</Label>
                <textarea id="reject-reason" value={rejectModal.reason} onChange={(e) => setRejectModal((m) => m ? { ...m, reason: e.target.value } : m)} placeholder="e.g. ID unclear; please upload a clear government-issued ID" className="w-full min-h-[100px] px-3 py-2 text-sm border rounded-md bg-background mt-1" maxLength={500} />
              </div>
              <div className="flex gap-2">
                <Button variant="destructive" className="flex-1" onClick={handleReject} disabled={actionLoading}>{actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Confirm reject</Button>
                <Button variant="outline" onClick={() => setRejectModal(null)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
