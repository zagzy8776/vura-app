import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Timer, User, Wallet } from 'lucide-react';

interface SecurityCountdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  recipientName: string;
  recipientTag: string;
  amount: number;
  currency?: string;
  countdownSeconds?: number;
}

export const SecurityCountdownModal: React.FC<SecurityCountdownModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  recipientName,
  recipientTag,
  amount,
  currency = 'NGN',
  countdownSeconds = 10,
}) => {
  const [countdown, setCountdown] = useState(countdownSeconds);
  const [isExpired, setIsExpired] = useState(false);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: currency,
    }).format(value);
  };

  const handleExpire = useCallback(() => {
    setIsExpired(true);
    setTimeout(() => {
      onClose();
    }, 2000);
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      setCountdown(countdownSeconds);
      setIsExpired(false);
      return;
    }

    if (countdown > 0 && !isExpired) {
      const timer = setTimeout(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);

      return () => clearTimeout(timer);
    } else if (countdown === 0 && !isExpired) {
      handleExpire();
    }
  }, [isOpen, countdown, isExpired, countdownSeconds, handleExpire]);

  const handleProceed = () => {
    if (!isExpired) {
      onConfirm();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-6 w-6" />
            Security Verification
          </DialogTitle>
          <DialogDescription className="text-center text-lg font-semibold text-gray-700">
            Do you know this person?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Recipient Info */}
          <div className="bg-gray-50 p-4 rounded-lg space-y-3">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-full">
                <User className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{recipientName}</p>
                <p className="text-sm text-gray-500">@{recipientTag}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-green-100 p-2 rounded-full">
                <Wallet className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">
                  {formatCurrency(amount)}
                </p>
                <p className="text-sm text-gray-500">Amount to send</p>
              </div>
            </div>
          </div>

          {/* Warning Message */}
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
            <p className="text-sm text-amber-800 text-center">
              ⚠️ Only proceed if you trust this recipient. Transactions cannot be reversed.
            </p>
          </div>

          {/* Countdown Timer */}
          <div className="flex items-center justify-center gap-2">
            <Timer className={`h-5 w-5 ${countdown <= 3 ? 'text-red-500' : 'text-gray-500'}`} />
            <span
              className={`text-2xl font-bold ${
                countdown <= 3 ? 'text-red-500' : 'text-gray-700'
              }`}
            >
              {countdown}s
            </span>
          </div>

          {/* Expired Message */}
          {isExpired && (
            <div className="text-center text-red-600 font-semibold">
              Transaction cancelled - Time expired
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={isExpired}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={handleProceed}
              disabled={isExpired}
            >
              {isExpired ? 'Expired' : 'Proceed'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
