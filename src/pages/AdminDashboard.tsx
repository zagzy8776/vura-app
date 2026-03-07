import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getApiUrl } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Users, Shield, CheckCircle, XCircle, Clock, Search, Loader2, Eye, EyeOff, Check, X, AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
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
  flutterwaveOrderRef?: string | null;
  idCardUrl: string | null;
  selfieUrl: string | null;
  idType: string | null;
  kycRejectionReason?: string | null;
  createdAt: string;
}

interface KYCStats {
  totalUsers: number;
  tierBreakdown: {
    tier1: number;
    tier2: number;
    tier3: number;
  };
  kycStatusBreakdown: {
    pending: number;
    verified: number;
    rejected: number;
  };
}

const ADMIN_SECRET_STORAGE_KEY = 'vura_admin_secret';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [adminAccessSecret, setAdminAccessSecret] = useState<string | null>(() =>
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(ADMIN_SECRET_STORAGE_KEY) : null,
  );
  const [adminSecretInput, setAdminSecretInput] = useState('');
  const [showAdminSecret, setShowAdminSecret] = useState(false);
  const [adminLoginLoading, setAdminLoginLoading] = useState(false);
  const [adminLoginError, setAdminLoginError] = useState('');
  const [backendSecretLength, setBackendSecretLength] = useState<number | null>(null);
  const [backendCheckError, setBackendCheckError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<KYCStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [listTab, setListTab] = useState<'pending' | 'all'>('pending');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [userToReject, setUserToReject] = useState<User | null>(null);
  const [tier2FirstName, setTier2FirstName] = useState('');
  const [tier2LastName, setTier2LastName] = useState('');
  const [tier2Reason, setTier2Reason] = useState('');
  const [setTier2Loading, setSetTier2Loading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalUsersCount, setTotalUsersCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [showVerifyConfirm, setShowVerifyConfirm] = useState(false);
  const [userToVerify, setUserToVerify] = useState<User | null>(null);

  const authHeader = adminAccessSecret ? `Bearer ${adminAccessSecret}` : '';
  const limit = 20;

  useEffect(() => {
    if (adminAccessSecret) {
      setLoading(true);
      fetchUsers(page);
      fetchStats();
    } else {
      setLoading(false);
    }
  }, [adminAccessSecret, page]);

  useEffect(() => {
    if (selectedUser) {
      setTier2FirstName(selectedUser.legalFirstName || '');
      setTier2LastName(selectedUser.legalLastName || '');
    }
  }, [selectedUser?.id]);

  // When showing login form, ask backend what length it expects (no secret required)
  useEffect(() => {
    if (adminAccessSecret) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${getApiUrl()}/admin/check`);
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setBackendSecretLength(data.secretLength ?? null);
          setBackendCheckError(null);
        } else {
          setBackendSecretLength(null);
          setBackendCheckError('Backend returned ' + res.status);
        }
      } catch (e) {
        if (cancelled) return;
        setBackendSecretLength(null);
        setBackendCheckError('Could not reach backend. Check VITE_API_URL points to your API (e.g. Render).');
      }
    })();
    return () => { cancelled = true; };
  }, [adminAccessSecret]);

  const handleAdminLogin = async () => {
    const secret = adminSecretInput.trim();
    if (!secret) {
      setAdminLoginError('Enter your admin secret');
      return;
    }
    setAdminLoginLoading(true);
    setAdminLoginError('');
    try {
      const res = await fetch(`${getApiUrl()}/admin/users?limit=1`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      if (res.ok) {
        sessionStorage.setItem(ADMIN_SECRET_STORAGE_KEY, secret);
        setAdminAccessSecret(secret);
        setAdminSecretInput('');
      } else {
        setAdminLoginError('Invalid admin secret. Use ADMIN_SECRET from your backend (e.g. Render).');
      }
    } catch {
      setAdminLoginError('Could not reach server. Try again.');
    } finally {
      setAdminLoginLoading(false);
    }
  };

  const lockAdmin = () => {
    sessionStorage.removeItem(ADMIN_SECRET_STORAGE_KEY);
    setAdminAccessSecret(null);
    setUsers([]);
    setStats(null);
  };

  const fetchUsers = async (pageNum: number = 1) => {
    if (!authHeader) return;
    try {
      const res = await fetch(`${getApiUrl()}/admin/users?limit=${limit}&page=${pageNum}`, {
        headers: { Authorization: authHeader },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setTotalUsersCount(data.total ?? 0);
        setTotalPages(Math.max(1, data.totalPages ?? 1));
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    if (!authHeader) return;
    try {
      const res = await fetch(`${getApiUrl()}/admin/stats/kyc`, {
        headers: { Authorization: authHeader },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const requestVerify = (u: User) => {
    setUserToVerify(u);
    setShowVerifyConfirm(true);
  };

  const handleVerify = async () => {
    if (!authHeader || !userToVerify) return;
    setActionLoading(true);
    setShowVerifyConfirm(false);
    const userId = userToVerify.id;
    setUserToVerify(null);
    try {
      const res = await fetch(`${getApiUrl()}/admin/users/${userId}/verify-kyc`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tier: 3, notes: 'Verified by admin' }),
      });
      if (res.ok) {
        toast.success('KYC approved. User is now Tier 3.');
        fetchUsers(page);
        fetchStats();
        setSelectedUser(null);
      } else {
        throw new Error('Failed to verify');
      }
    } catch (error) {
      toast.error('Failed to verify KYC');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSetTier2 = async () => {
    if (!selectedUser || !authHeader) return;
    const first = tier2FirstName.trim();
    const last = tier2LastName.trim();
    if (!first || !last) {
      toast.error('First name and last name are required');
      return;
    }
    setSetTier2Loading(true);
    try {
      const res = await fetch(`${getApiUrl()}/admin/users/${selectedUser.id}/set-tier-2`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: first,
          lastName: last,
          reason: tier2Reason.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.message || 'User set to Tier 2. They can now receive money.');
        setTier2FirstName('');
        setTier2LastName('');
        setTier2Reason('');
        fetchUsers(page);
        fetchStats();
        setSelectedUser(null);
      } else {
        toast.error(data.message || 'Failed to set Tier 2');
      }
    } catch (error) {
      toast.error('Failed to set Tier 2');
    } finally {
      setSetTier2Loading(false);
    }
  };

  const handleRejectClick = (user: User) => {
    setUserToReject(user);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const handleReject = async () => {
    if (!userToReject || !authHeader) return;
    const reason = rejectReason.trim() || 'Documents could not be verified. Please upload a valid government-issued ID and a clear selfie.';
    setActionLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/admin/users/${userToReject.id}/reject-kyc`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        toast.success('KYC rejected. User will see the reason in Settings → Identity verification.');
        fetchUsers(page);
        fetchStats();
        setSelectedUser(null);
        setShowRejectModal(false);
        setUserToReject(null);
        setRejectReason('');
      } else {
        throw new Error('Failed to reject');
      }
    } catch (error) {
      toast.error('Failed to reject KYC');
    } finally {
      setActionLoading(false);
    }
  };

  // Pending = has at least ID or selfie uploaded and status is PENDING (so admin can catch bad uploads)
  // Pending = anyone awaiting admin approval (Prembly widget completed = Tier 2 PENDING, or old ID/selfie upload)
  const pendingUsers = users.filter((u) => u.kycStatus === 'PENDING');

  const filteredUsers =
    listTab === 'all'
      ? search
        ? users.filter((u) =>
            u.vuraTag.toLowerCase().includes(search.toLowerCase()),
          )
        : users
      : search
        ? users.filter((u) =>
            u.vuraTag.toLowerCase().includes(search.toLowerCase()),
          )
        : pendingUsers;

  if (!adminAccessSecret) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Admin access</CardTitle>
            <CardDescription>
              Enter your admin secret to view and permit verifications. Use the ADMIN_SECRET from your backend (e.g. Render environment variables).
            </CardDescription>
            {backendCheckError && (
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
                {backendCheckError}
              </p>
            )}
            {backendSecretLength !== null && !backendCheckError && (
              <p className="text-sm text-muted-foreground mt-2">
                Your backend expects a secret of <strong>{backendSecretLength}</strong> character{backendSecretLength !== 1 ? 's' : ''}. Type exactly that many (no extra space or quotes).
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="admin-secret">Admin secret</Label>
              <div className="relative mt-2">
                <Input
                  id="admin-secret"
                  type={showAdminSecret ? 'text' : 'password'}
                  placeholder="ADMIN_SECRET"
                  value={adminSecretInput}
                  onChange={(e) => { setAdminSecretInput(e.target.value); setAdminLoginError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
                  className="font-mono pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowAdminSecret((v) => !v)}
                  aria-label={showAdminSecret ? 'Hide secret' : 'Show secret'}
                >
                  {showAdminSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              {showAdminSecret && adminSecretInput.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  You entered {adminSecretInput.length} character{adminSecretInput.length !== 1 ? 's' : ''}
                  {backendSecretLength !== null && (
                    <> — {adminSecretInput.length === backendSecretLength ? 'length matches backend.' : `backend expects ${backendSecretLength}.`}</>
                  )}
                </p>
              )}
            </div>
            {adminLoginError && (
              <p className="text-sm text-destructive">{adminLoginError}</p>
            )}
            <Button
              className="w-full"
              onClick={handleAdminLogin}
              disabled={adminLoginLoading || !adminSecretInput.trim()}
            >
              {adminLoginLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
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

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
            <ArrowLeft className="w-4 h-4" /> Back to Vura
          </Link>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        </div>
        <Button variant="outline" size="sm" onClick={lockAdmin}>
          Lock admin
        </Button>
      </div>

      <div className="mb-6 p-4 rounded-lg border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800 dark:text-amber-200">
          <p className="font-medium">Compliance &amp; fraud prevention</p>
          <p className="mt-1 text-amber-700 dark:text-amber-300">
            Only approve after confirming identity. Reject if anything is suspicious (mismatched details, fake documents, or high fraud indicators). All actions are logged. You are responsible for protecting the platform and our users. See docs/ADMIN_AND_FRAUD_PREVENTION.md for full guidance.
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <Users className="w-10 h-10 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.totalUsers}</p>
                  <p className="text-sm text-gray-500">Total Users</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <Clock className="w-10 h-10 text-yellow-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.kycStatusBreakdown.pending}</p>
                  <p className="text-sm text-gray-500">Pending KYC</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <CheckCircle className="w-10 h-10 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.kycStatusBreakdown.verified}</p>
                  <p className="text-sm text-gray-500">Verified</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <XCircle className="w-10 h-10 text-red-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.kycStatusBreakdown.rejected}</p>
                  <p className="text-sm text-gray-500">Rejected</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs + Search */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <div className="flex rounded-lg border p-1 bg-muted/30">
          <button
            type="button"
            onClick={() => setListTab('pending')}
            className={`px-4 py-2 rounded-md text-sm font-medium ${listTab === 'pending' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Pending review ({pendingUsers.length})
          </button>
          <button
            type="button"
            onClick={() => setListTab('all')}
            className={`px-4 py-2 rounded-md text-sm font-medium ${listTab === 'all' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            All users
          </button>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by vura tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Users List */}
      <Card>
        <CardHeader>
          <CardTitle>KYC Verification</CardTitle>
          <CardDescription>
            Users complete verification via the Prembly widget (BVN + NIN + face). Approve or reject here. You can also review legacy ID/selfie uploads if present.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredUsers.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              {listTab === 'pending'
                ? 'No users pending review. Users who complete Prembly verification (or upload ID/selfie) will appear here.'
                : users.length === 0
                  ? 'No users in the system yet.'
                  : 'No users match your search.'}
            </p>
          ) : (
            <>
            <div className="space-y-4">
              {filteredUsers.map((user) => (
                <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                      <span className="font-bold text-primary">{user.vuraTag[0].toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="font-medium">@{user.vuraTag}</p>
                      <p className="text-sm text-gray-500">Tier {user.kycTier} · Joined {new Date(user.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {typeof user.fraudScore === 'number' && user.fraudScore > 0 && (
                      <Badge variant="destructive" title="Fraud score">Risk {user.fraudScore}</Badge>
                    )}
                    <Badge variant={user.kycStatus === 'VERIFIED' ? 'default' : 'secondary'}>
                      {user.kycStatus || 'PENDING'}
                    </Badge>
                    {(user.idCardUrl || user.selfieUrl) && (
                      <Badge variant="outline">
                        {user.idCardUrl && user.selfieUrl ? 'ID + Selfie' : user.idCardUrl ? 'ID only' : 'Selfie only'}
                      </Badge>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setSelectedUser(user)}>
                      <Eye className="w-4 h-4 mr-1" /> Review
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {listTab === 'all' && totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 mt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {totalPages} ({totalUsersCount} users)
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Verify confirmation modal */}
      {showVerifyConfirm && userToVerify && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Approve KYC</CardTitle>
              <CardDescription>
                Approve @{userToVerify.vuraTag} to Tier 3? They will get full limits.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setShowVerifyConfirm(false); setUserToVerify(null); }}>
                Cancel
              </Button>
              <Button className="bg-green-600 hover:bg-green-700" onClick={handleVerify} disabled={actionLoading}>
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Yes, approve
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* User Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>KYC Review - @{selectedUser.vuraTag}</CardTitle>
              <CardDescription>User ID: {selectedUser.id}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!(selectedUser.idCardUrl || selectedUser.selfieUrl) ? (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Prembly verification</p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    This user verified via Prembly (BVN + NIN + face). We don&apos;t store ID/selfie images here. Approve only if you&apos;re satisfied they completed the flow. Reject if anything seems off.
                  </p>
                </div>
              ) : (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Review checklist (ID/selfie)</p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                  Confirm the ID is a valid government-issued document (NIN, driver’s licence, voter’s card, or passport) and the selfie matches the person. Reject if uploads are invalid, unclear, or not a real ID/selfie (e.g. picture of an animal or wrong document).
                </p>
              </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <p className="text-sm font-medium">Legal Name</p>
                  <p>
                    {`${selectedUser.legalFirstName || ''} ${selectedUser.legalLastName || ''}`.trim() ||
                      'Not set'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">KYC Tier</p>
                  <p>{selectedUser.kycTier}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">KYC Status</p>
                  <Badge variant={selectedUser.kycStatus === 'VERIFIED' ? 'default' : 'secondary'}>
                    {selectedUser.kycStatus}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium">BVN Verified</p>
                  <p>{selectedUser.bvnVerified ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">BVN Verified At</p>
                  <p>
                    {selectedUser.bvnVerifiedAt
                      ? new Date(selectedUser.bvnVerifiedAt).toLocaleString()
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">NIN Verified</p>
                  <p>{selectedUser.ninVerified ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">NIN Verified At</p>
                  <p>
                    {selectedUser.ninVerifiedAt
                      ? new Date(selectedUser.ninVerifiedAt).toLocaleString()
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">ID Type</p>
                  <p>{selectedUser.idType || 'Not provided'}</p>
                </div>
                {typeof selectedUser.fraudScore === 'number' && selectedUser.fraudScore > 0 && (
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-red-600">Fraud / risk score</p>
                    <p>{selectedUser.fraudScore} — review carefully before approving.</p>
                  </div>
                )}
                {selectedUser.lastLoginAt && (
                  <div>
                    <p className="text-sm font-medium">Last login</p>
                    <p>{new Date(selectedUser.lastLoginAt).toLocaleString()}</p>
                  </div>
                )}
                {selectedUser.kycRejectionReason && (
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-red-600">Previous rejection reason</p>
                    <p className="text-sm text-muted-foreground">{selectedUser.kycRejectionReason}</p>
                  </div>
                )}
                <div className="col-span-2">
                  <p className="text-sm font-medium">Vura Bank Account</p>
                  <p>
                    {selectedUser.reservedAccountNumber
                      ? `${selectedUser.reservedAccountNumber} (${selectedUser.reservedAccountBankName || 'Bank'})`
                      : 'Not generated'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Joined</p>
                  <p>{new Date(selectedUser.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Verification submitted</p>
                  <p>
                    {(selectedUser.ninVerifiedAt || selectedUser.bvnVerifiedAt)
                      ? new Date(selectedUser.ninVerifiedAt || selectedUser.bvnVerifiedAt!).toLocaleString()
                      : '—'}
                  </p>
                </div>
              </div>

              {(selectedUser.kycTier < 2 || !selectedUser.bvnVerified) && (
                <div className="p-4 border border-dashed border-primary/50 rounded-lg bg-primary/5 space-y-3">
                  <p className="text-sm font-medium">Set Tier 2 manually (when BVN API fails)</p>
                  <p className="text-xs text-muted-foreground">
                    User will get Tier 2 limits and can generate a virtual account to receive money. Use after you have verified their identity (e.g. offline). Requires admin secret.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">First name</Label>
                      <Input
                        placeholder="Legal first name"
                        value={tier2FirstName}
                        onChange={(e) => setTier2FirstName(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Last name</Label>
                      <Input
                        placeholder="Legal last name"
                        value={tier2LastName}
                        onChange={(e) => setTier2LastName(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Reason (optional)</Label>
                    <Input
                      placeholder="e.g. Verified offline"
                      value={tier2Reason}
                      onChange={(e) => setTier2Reason(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={handleSetTier2}
                    disabled={setTier2Loading || !tier2FirstName.trim() || !tier2LastName.trim()}
                  >
                    {setTier2Loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Set Tier 2
                  </Button>
                </div>
              )}

              {selectedUser.idCardUrl ? (
                <div>
                  <p className="text-sm font-medium mb-2">ID Document</p>
                  <img
                    src={selectedUser.idCardUrl}
                    alt="ID document"
                    className="max-w-full max-h-64 object-contain border rounded bg-muted/50"
                  />
                </div>
              ) : (
                <div className="p-4 border border-dashed rounded-lg text-center text-muted-foreground text-sm">
                  No ID document uploaded yet
                </div>
              )}

              {selectedUser.selfieUrl ? (
                <div>
                  <p className="text-sm font-medium mb-2">Selfie</p>
                  <img
                    src={selectedUser.selfieUrl}
                    alt="Selfie"
                    className="max-w-full max-h-64 object-contain border rounded bg-muted/50"
                  />
                </div>
              ) : (
                <div className="p-4 border border-dashed rounded-lg text-center text-muted-foreground text-sm">
                  No selfie uploaded yet
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={() => requestVerify(selectedUser)}
                  disabled={actionLoading}
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                  Approve KYC
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => handleRejectClick(selectedUser)}
                  disabled={actionLoading}
                >
                  <X className="w-4 h-4 mr-2" />
                  Reject KYC
                </Button>
                <Button variant="outline" onClick={() => setSelectedUser(null)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Reject reason modal */}
      {showRejectModal && userToReject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <X className="h-5 w-5" /> Reject KYC
              </CardTitle>
              <CardDescription>
                This reason will be shown to @{userToReject.vuraTag} on their ID upload page. Be clear so they can fix the issue.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reject-reason">Reason for rejection</Label>
                <textarea
                  id="reject-reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. ID document is unclear; please upload a clear photo of your government-issued ID"
                  className="w-full min-h-[100px] px-3 py-2 text-sm border rounded-md bg-background"
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground">
                  If left blank, a generic message will be used.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleReject}
                  disabled={actionLoading}
                >
                  {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Confirm reject
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowRejectModal(false);
                    setUserToReject(null);
                    setRejectReason('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
