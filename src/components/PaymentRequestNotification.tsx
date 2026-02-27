import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bell, Check, X, Loader2, User, Wallet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SecurityCountdownModal } from './SecurityCountdownModal';

interface PaymentRequest {
  id: string;
  reference: string;
  amount: number;
  description: string;
  requesterVuraTag: string;
  requesterKycTier: number;
  createdAt: string;
  expiresAt: string;
}

interface PaymentRequestNotificationProps {
  isOpen: boolean;
  onClose: () => void;
  request: PaymentRequest | null;
  onAccept: (requestId: string, pin: string) => void;
  onDecline: (requestId: string) => void;
}

export const PaymentRequestNotification: React.FC<PaymentRequestNotificationProps> = ({
  isOpen,
  onClose,
  request,
  onAccept,
  onDecline,
}) => {
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const { toast } = useToast();

  if (!request) return null;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(value);
  };

  const handleAcceptClick = () => {
    if (!pin || pin.length < 4) {
      toast({
        title: 'PIN Required',
        description: 'Please enter your 4-digit PIN',
        variant: 'destructive',
      });
      return;
    }
    setShowSecurityModal(true);
  };

  const handleSecurityConfirm = () => {
    setShowSecurityModal(false);
    setIsLoading(true);
    onAccept(request.id, pin);
    setIsLoading(false);
    setPin('');
  };

  const handleDecline = () => {
    setIsLoading(true);
    onDecline(request.id);
    setIsLoading(false);
    onClose();
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-600">
              <Bell className="h-6 w-6" />
              Payment Request
            </DialogTitle>
            <DialogDescription>
              Someone is requesting money from you
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Requester Info */}
            <div className="bg-blue-50 p-4 rounded-lg space-y-3">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded-full">
                  <User className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">
                    @{request.requesterVuraTag}
                  </p>
                  <p className="text-sm text-gray-500">
                    KYC Tier {request.requesterKycTier}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="bg-green-100 p-2 rounded-full">
                  <Wallet className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-xl">
                    {formatCurrency(request.amount)}
                  </p>
                  <p className="text-sm text-gray-500">
                    {request.description || 'Payment Request'}
                  </p>
                </div>
              </div>
            </div>

            {/* PIN Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Enter your PIN to accept:
              </label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className="text-center text-2xl tracking-widest"
              />
            </div>

            {/* Expiry Warning */}
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
              <p className="text-sm text-amber-800 text-center">
                ⏰ This request expires at{' '}
                {new Date(request.expiresAt).toLocaleTimeString()}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleDecline}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <X className="h-4 w-4 mr-2" />
                )}
                Decline
              </Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={handleAcceptClick}
                disabled={isLoading || pin.length < 4}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Accept
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Security Countdown Modal */}
      <SecurityCountdownModal
        isOpen={showSecurityModal}
        onClose={() => setShowSecurityModal(false)}
        onConfirm={handleSecurityConfirm}
        recipientName={`@${request.requesterVuraTag}`}
        recipientTag={request.requesterVuraTag}
        amount={request.amount}
        currency="NGN"
        countdownSeconds={10}
      />
    </>
  );
};
