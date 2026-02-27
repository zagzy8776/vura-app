import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Store,
  QrCode,
  Download,
  TrendingUp,
  DollarSign,
  Users,
  Calendar,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { QrCodeScanner } from '@/components/QrCodeScanner';
import { SecurityCountdownModal } from '@/components/SecurityCountdownModal';

interface Transaction {
  id: string;
  reference: string;
  amount: number;
  status: string;
  createdAt: string;
  counterparty: string;
  direction: string;
}

interface QrCodeData {
  id: string;
  code: string;
  amount: number | null;
  description: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedBy: string | null;
}

export const MerchantDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'qr-codes'>('overview');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [qrCodes, setQrCodes] = useState<QrCodeData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dateRange, setDateRange] = useState('7days');
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<{
    recipientVuraTag: string;
    amount: number;
    description: string;
  } | null>(null);
  const { toast } = useToast();

  // Fetch merchant data
  useEffect(() => {
    fetchTransactions();
    fetchQrCodes();
  }, [dateRange]);

  const fetchTransactions = async () => {
    setIsLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/transactions?type=receive&limit=100`,
        {
          headers: {
            Authorization: `Bearer ${session.session?.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setTransactions(data);
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchQrCodes = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/qr-codes/history`,
        {
          headers: {
            Authorization: `Bearer ${session.session?.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setQrCodes(data);
      }
    } catch (error) {
      console.error('Failed to fetch QR codes:', error);
    }
  };

  const generateQrCode = async (amount?: number, description?: string) => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/qr-codes/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.session?.access_token}`,
          },
          body: JSON.stringify({
            amount,
            description: description || 'Payment',
            expiresInMinutes: 30,
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        fetchQrCodes();
        toast({
          title: 'QR Code Generated',
          description: `Code: ${data.qrCode.code}`,
        });
        return data;
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to generate QR code',
        variant: 'destructive',
      });
    }
  };

  const handleQrScanSuccess = (paymentData: {
    recipientVuraTag: string;
    amount: number;
    description: string;
  }) => {
    setPendingPayment(paymentData);
    setShowSecurityModal(true);
  };

  const handleSecurityConfirm = () => {
    // Process payment
    toast({
      title: 'Payment Successful',
      description: `Paid ${pendingPayment?.recipientVuraTag}`,
    });
    setShowSecurityModal(false);
    setPendingPayment(null);
    fetchTransactions();
  };

  // Calculate stats
  const totalSales = transactions
    .filter((t) => t.direction === 'received')
    .reduce((sum, t) => sum + t.amount, 0);

  const todaySales = transactions
    .filter((t) => {
      const today = new Date().toDateString();
      return t.direction === 'received' && new Date(t.createdAt).toDateString() === today;
    })
    .reduce((sum, t) => sum + t.amount, 0);

  const activeQrCodes = qrCodes.filter((q) => q.status === 'active').length;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 p-3 rounded-full">
            <Store className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Merchant Dashboard</h1>
            <p className="text-gray-500">Manage your sales and QR payments</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowQrScanner(true)}
            className="flex items-center gap-2"
          >
            <QrCode className="h-4 w-4" />
            Scan QR
          </Button>
          <Button
            onClick={() => generateQrCode()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
          >
            <QrCode className="h-4 w-4" />
            Generate QR
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalSales)}</div>
            <p className="text-xs text-muted-foreground">All time revenue</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Sales</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(todaySales)}</div>
            <p className="text-xs text-muted-foreground">Revenue today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{transactions.length}</div>
            <p className="text-xs text-muted-foreground">Total transactions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active QR Codes</CardTitle>
            <QrCode className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeQrCodes}</div>
            <p className="text-xs text-muted-foreground">Ready for payment</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <Button
          variant={activeTab === 'overview' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </Button>
        <Button
          variant={activeTab === 'transactions' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('transactions')}
        >
          Transactions
        </Button>
        <Button
          variant={activeTab === 'qr-codes' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('qr-codes')}
        >
          QR Codes
        </Button>
      </div>

      {/* Content */}
      {activeTab === 'overview' && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.slice(0, 5).map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell className="font-mono text-xs">
                      {transaction.reference}
                    </TableCell>
                    <TableCell>@{transaction.counterparty}</TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(transaction.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          transaction.status === 'SUCCESS'
                            ? 'default'
                            : transaction.status === 'PENDING'
                            ? 'secondary'
                            : 'destructive'
                        }
                      >
                        {transaction.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(transaction.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeTab === 'transactions' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>All Transactions</CardTitle>
            <div className="flex gap-2">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7days">Last 7 days</SelectItem>
                  <SelectItem value="30days">Last 30 days</SelectItem>
                  <SelectItem value="90days">Last 90 days</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon">
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell className="font-mono text-xs">
                        {transaction.reference}
                      </TableCell>
                      <TableCell>@{transaction.counterparty}</TableCell>
                      <TableCell className="font-semibold">
                        {formatCurrency(transaction.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            transaction.status === 'SUCCESS'
                              ? 'default'
                              : transaction.status === 'PENDING'
                              ? 'secondary'
                              : 'destructive'
                          }
                        >
                          {transaction.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(transaction.createdAt)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeTab === 'qr-codes' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>QR Code History</CardTitle>
            <Button
              onClick={() => generateQrCode()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <QrCode className="h-4 w-4 mr-2" />
              Generate New
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Used By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {qrCodes.map((qr) => (
                  <TableRow key={qr.id}>
                    <TableCell className="font-mono text-xs">{qr.code}</TableCell>
                    <TableCell>
                      {qr.amount ? formatCurrency(qr.amount) : 'Any amount'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          qr.status === 'active'
                            ? 'default'
                            : qr.status === 'used'
                            ? 'secondary'
                            : 'destructive'
                        }
                      >
                        {qr.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(qr.createdAt)}</TableCell>
                    <TableCell>{qr.usedBy ? `@${qr.usedBy}` : '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* QR Scanner Modal */}
      <QrCodeScanner
        isOpen={showQrScanner}
        onClose={() => setShowQrScanner(false)}
        onSuccess={handleQrScanSuccess}
      />

      {/* Security Countdown Modal */}
      {pendingPayment && (
        <SecurityCountdownModal
          isOpen={showSecurityModal}
          onClose={() => setShowSecurityModal(false)}
          onConfirm={handleSecurityConfirm}
          recipientName={pendingPayment.recipientVuraTag}
          recipientTag={pendingPayment.recipientVuraTag}
          amount={pendingPayment.amount}
          currency="NGN"
          countdownSeconds={10}
        />
      )}
    </div>
  );
};
