import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Camera, Upload, Shield, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface KYCStatus {
  idType: string | null;
  idCardUrl: string | null;
  selfieUrl: string | null;
  kycStatus: string;
}

export default function IdUpload() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [idType, setIdType] = useState('');
  const [idFile, setIdFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [kycStatus, setKycStatus] = useState<KYCStatus | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [idCardUrl, setIdCardUrl] = useState<string | null>(null);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchKycStatus = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/kyc/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setKycStatus(data);
          if (data.idCardUrl) setIdCardUrl(data.idCardUrl);
          if (data.selfieUrl) setSelfieUrl(data.selfieUrl);
          if (data.idType) setIdType(data.idType);
          if (data.idCardUrl && data.selfieUrl) {
            setStep(3);
          } else if (data.idCardUrl) {
            setStep(2);
          }
        }
      } catch (error) {
        console.error('Failed to fetch KYC status:', error);
      }
    };
    if (token) fetchKycStatus();
  }, [token]);

  const handleIdUpload = async () => {
    if (!idFile || !idType) {
      toast.error('Please select ID type and upload an ID document');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', idFile);
      formData.append('idType', idType);

      const res = await fetch(`${import.meta.env.VITE_API_URL}/kyc/upload-id`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to upload ID');
      }

      const data = await res.json();
      setIdCardUrl(data.url);
      toast.success('ID uploaded successfully');
      setStep(2);
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload ID');
    } finally {
      setLoading(false);
    }
  };

  const handleSelfieUpload = async () => {
    if (!selfieFile) {
      toast.error('Please upload a selfie');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', selfieFile);

      const res = await fetch(`${import.meta.env.VITE_API_URL}/kyc/upload-selfie`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to upload selfie');
      }

      const data = await res.json();
      setSelfieUrl(data.url);
      toast.success('Selfie uploaded successfully');
      setStep(3);
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload selfie');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!idCardUrl || !selfieUrl) {
      toast.error('Please upload both ID and selfie');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/kyc/submit-kyc`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          idCardUrl, 
          selfieUrl, 
          idType 
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to submit KYC');
      }

      toast.success('KYC submitted for review');
      navigate('/settings');
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit KYC');
    } finally {
      setLoading(false);
    }
  };

  if (kycStatus?.kycStatus === 'VERIFIED') {
    return (
      <div className="container mx-auto py-8 max-w-md">
        <Card>
          <CardContent className="pt-6 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-green-600">KYC Verified</h2>
            <p className="text-gray-600 mt-2">Your identity has been verified.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (kycStatus?.kycStatus === 'REJECTED') {
    return (
      <div className="container mx-auto py-8 max-w-md">
        <Card>
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-red-600">KYC Rejected</h2>
            <p className="text-gray-600 mt-2">Please re-submit your documents.</p>
            <Button className="mt-4" onClick={() => setKycStatus(null)}>Try Again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 max-w-md">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-6 h-6" />
            Verify Your Identity
          </CardTitle>
          <CardDescription>
            Complete KYC to unlock full features
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Progress Steps */}
          <div className="flex items-center justify-between mb-8">
            <div className={`flex flex-col items-center ${step >= 1 ? 'text-primary' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-primary text-white' : 'bg-gray-200'}`}>1</div>
              <span className="text-xs mt-1">ID Card</span>
            </div>
            <div className="flex-1 h-1 bg-gray-200 mx-2">
              <div className={`h-full bg-primary transition-all ${step >= 2 ? 'w-full' : 'w-0'}`} />
            </div>
            <div className={`flex flex-col items-center ${step >= 2 ? 'text-primary' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-primary text-white' : 'bg-gray-200'}`}>2</div>
              <span className="text-xs mt-1">Selfie</span>
            </div>
            <div className="flex-1 h-1 bg-gray-200 mx-2">
              <div className={`h-full bg-primary transition-all ${step >= 3 ? 'w-full' : 'w-0'}`} />
            </div>
            <div className={`flex flex-col items-center ${step >= 3 ? 'text-primary' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 3 ? 'bg-primary text-white' : 'bg-gray-200'}`}>3</div>
              <span className="text-xs mt-1">Submit</span>
            </div>
          </div>

          {/* Step 1: ID Upload */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label>ID Type</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={idType}
                  onChange={(e) => setIdType(e.target.value)}
                >
                  <option value="">Select ID type</option>
                  <option value="nin">NIN (National ID)</option>
                  <option value="drivers_license">Drivers License</option>
                  <option value="voters_card">Voters Card</option>
                  <option value="intl_passport">International Passport</option>
                </select>
              </div>

              <div>
                <Label>Upload ID Document</Label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center mt-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setIdFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="id-upload"
                  />
                  <label htmlFor="id-upload" className="cursor-pointer">
                    <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      {idFile ? idFile.name : 'Click to upload ID document'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">PNG, JPG up to 10MB</p>
                  </label>
                </div>
              </div>

              <Button className="w-full" onClick={handleIdUpload} disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Continue
              </Button>
            </div>
          )}

          {/* Step 2: Selfie Upload */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <Label>Take a Selfie</Label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center mt-2">
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    onChange={(e) => setSelfieFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="selfie-upload"
                  />
                  <label htmlFor="selfie-upload" className="cursor-pointer">
                    <Camera className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      {selfieFile ? selfieFile.name : 'Click to take selfie'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Make sure your face is clearly visible</p>
                  </label>
                </div>
              </div>

              <Button className="w-full" onClick={handleSelfieUpload} disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Continue
              </Button>
            </div>
          )}

          {/* Step 3: Submit */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <p className="text-green-700">All documents uploaded successfully!</p>
                <p className="text-sm text-green-600 mt-1">Click submit to complete your KYC</p>
              </div>

              <Button className="w-full" onClick={handleSubmit} disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Submit for Review
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
