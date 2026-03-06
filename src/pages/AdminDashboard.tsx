import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getApiUrl } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Users, Shield, CheckCircle, XCircle, Clock, Search, Loader2, Eye, Check, X } from 'lucide-react';

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

export default function AdminDashboard() {
  const { token } = useAuth();
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

  useEffect(() => {
    fetchUsers();
    fetchStats();
  }, [token]);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${getApiUrl()}/admin/users?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${getApiUrl()}/admin/stats/kyc`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleVerify = async (userId: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/admin/users/${userId}/verify-kyc`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tier: 3, notes: 'Verified by admin' }),
      });
      if (res.ok) {
        toast.success('KYC verified successfully');
        fetchUsers();
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

  const handleRejectClick = (user: User) => {
    setUserToReject(user);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const handleReject = async () => {
    if (!userToReject) return;
    const reason = rejectReason.trim() || 'Documents could not be verified. Please upload a valid government-issued ID and a clear selfie.';
    setActionLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/admin/users/${userToReject.id}/reject-kyc`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        toast.success('KYC rejected. User will see the reason on their ID upload page.');
        fetchUsers();
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
  const pendingUsers = users.filter(
    (u) => (u.idCardUrl || u.selfieUrl) && u.kycStatus === 'PENDING',
  );

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>

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
            Review ID and selfie uploads. Verify documents are valid government-issued ID and a real selfie—reject if invalid (e.g. wrong document or non-human).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredUsers.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              {listTab === 'pending'
                ? 'No pending KYC verifications. Users who upload ID or selfie will appear here.'
                : 'No users match your search.'}
            </p>
          ) : (
            <div className="space-y-4">
              {filteredUsers.map((user) => (
                <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                      <span className="font-bold text-primary">{user.vuraTag[0].toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="font-medium">@{user.vuraTag}</p>
                      <p className="text-sm text-gray-500">Tier {user.kycTier}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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
          )}
        </CardContent>
      </Card>

      {/* User Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>KYC Review - @{selectedUser.vuraTag}</CardTitle>
              <CardDescription>User ID: {selectedUser.id}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Review checklist</p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                  Confirm the ID is a valid government-issued document (NIN, driver’s licence, voter’s card, or passport) and the selfie matches the person. Reject if uploads are invalid, unclear, or not a real ID/selfie (e.g. picture of an animal or wrong document).
                </p>
              </div>
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
                  <p className="text-sm font-medium">ID Type</p>
                  <p>{selectedUser.idType || 'Not provided'}</p>
                </div>
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
                  {selectedUser.flutterwaveOrderRef && (
                    <p className="text-xs text-gray-500">
                      Order Ref: {selectedUser.flutterwaveOrderRef}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium">Member Since</p>
                  <p>{new Date(selectedUser.createdAt).toLocaleDateString()}</p>
                </div>
              </div>

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
                  onClick={() => handleVerify(selectedUser.id)}
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
