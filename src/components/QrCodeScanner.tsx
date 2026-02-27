import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Camera, X, Scan, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface QrCodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (paymentData: {
    recipientVuraTag: string;
    amount: number;
    description: string;
  }) => void;
}

export const QrCodeScanner: React.FC<QrCodeScannerProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);

  // Simulate QR scanning (in production, use a library like @zxing/library)
  useEffect(() => {
    if (isOpen && !manualEntry) {
      // In production, this would initialize the camera and QR scanner
      // For now, we'll use manual entry as a fallback
      setIsScanning(true);
    }

    return () => {
      setIsScanning(false);
    };
  }, [isOpen, manualEntry]);

  const handleManualSubmit = async () => {
    if (!qrCode.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a QR code',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      // Validate QR code with backend
      const { data: session } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/qr-codes/validate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.session?.access_token}`,
          },
          body: JSON.stringify({ code: qrCode.trim() }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Invalid QR code');
      }

      // QR code is valid - close scanner and trigger payment flow
      onSuccess({
        recipientVuraTag: result.qrCode.merchantVuraTag,
        amount: result.qrCode.amount || 0,
        description: result.qrCode.description || 'QR Payment',
      });

      toast({
        title: 'QR Code Valid',
        description: `Merchant: @${result.qrCode.merchantVuraTag}`,
      });

      onClose();
    } catch (error: any) {
      toast({
        title: 'Invalid QR Code',
        description: error.message || 'Could not validate QR code',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scan className="h-5 w-5" />
            Scan QR Code
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Camera Preview Placeholder */}
          {!manualEntry && (
            <div className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center">
                <Camera className="h-12 w-12 text-gray-400" />
              </div>
              {isScanning && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="h-8 w-8 text-white animate-spin" />
                </div>
              )}
              {/* Scanning Frame */}
              <div className="absolute inset-4 border-2 border-white/50 rounded-lg">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500" />
              </div>
            </div>
          )}

          {/* Manual Entry */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Or enter QR code manually:
            </label>
            <Input
              placeholder="Enter QR code (e.g., VURA-ABC123-XYZ789)"
              value={qrCode}
              onChange={(e) => setQrCode(e.target.value)}
              className="uppercase"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={isLoading}
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              onClick={handleManualSubmit}
              disabled={isLoading || !qrCode.trim()}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Validating...
                </>
              ) : (
                <>
                  <Scan className="h-4 w-4 mr-2" />
                  Continue
                </>
              )}
            </Button>
          </div>

          <p className="text-xs text-gray-500 text-center">
            Point your camera at the merchant's QR code or enter it manually
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
