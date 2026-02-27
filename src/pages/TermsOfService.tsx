import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const TermsOfService: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold">Terms of Service</h1>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vura Bank Terms of Service</CardTitle>
          <p className="text-sm text-gray-500">Last updated: February 27, 2024</p>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px] pr-4">
            <div className="space-y-6 text-sm leading-relaxed">
              <section>
                <h2 className="text-lg font-semibold mb-2">1. Acceptance of Terms</h2>
                <p className="text-gray-700">
                  By accessing or using Vura Bank services, you agree to be bound by these Terms of Service. 
                  If you do not agree to these terms, please do not use our services. These terms constitute 
                  a legally binding agreement between you and Vura Bank Limited.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">2. Eligibility</h2>
                <p className="text-gray-700">
                  To use Vura Bank services, you must:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
                  <li>Be at least 18 years of age</li>
                  <li>Be a resident of Nigeria</li>
                  <li>Have a valid Bank Verification Number (BVN)</li>
                  <li>Have a valid National Identity Number (NIN)</li>
                  <li>Provide accurate and complete registration information</li>
                  <li>Complete our Know Your Customer (KYC) verification process</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">3. Account Security</h2>
                <p className="text-gray-700">
                  You are responsible for maintaining the confidentiality of your account credentials, 
                  including your PIN and device security. You agree to:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
                  <li>Never share your PIN with anyone</li>
                  <li>Immediately notify us of any unauthorized access</li>
                  <li>Use secure devices and networks</li>
                  <li>Enable all available security features</li>
                  <li>Keep your contact information updated</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">4. Transaction Limits</h2>
                <p className="text-gray-700">
                  Transaction limits are determined by your KYC tier:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
                  <li>Tier 1 (BVN Verified): Daily limit ₦50,000</li>
                  <li>Tier 2 (NIN Verified): Daily limit ₦200,000</li>
                  <li>Tier 3 (Biometric Verified): Daily limit ₦1,000,000</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">5. Prohibited Activities</h2>
                <p className="text-gray-700">
                  You agree not to use Vura Bank for:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
                  <li>Illegal activities including fraud and money laundering</li>
                  <li>Unauthorized access to other users' accounts</li>
                  <li>Transmitting malware or harmful code</li>
                  <li>Attempting to circumvent security measures</li>
                  <li>Any activity that violates Nigerian law</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">6. Fees and Charges</h2>
                <p className="text-gray-700">
                  Vura Bank charges the following fees:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
                  <li>Internal transfers (Vura-to-Vura): 0.5% (minimum ₦10)</li>
                  <li>Bank transfers: ₦50 per transaction</li>
                  <li>Card maintenance: ₦50 monthly</li>
                  <li>Failed transaction retry: ₦10 per attempt</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">7. Dispute Resolution</h2>
                <p className="text-gray-700">
                  Any disputes arising from these terms shall be resolved through:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
                  <li>Direct negotiation with Vura Bank customer support</li>
                  <li>Mediation by the Central Bank of Nigeria (CBN)</li>
                  <li>Arbitration under Nigerian law</li>
                  <li>Legal proceedings in Nigerian courts</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">8. Limitation of Liability</h2>
                <p className="text-gray-700">
                  Vura Bank shall not be liable for:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
                  <li>Losses due to your failure to secure your account</li>
                  <li>Transactions you authorized, even if fraudulent</li>
                  <li>Service interruptions beyond our control</li>
                  <li>Third-party services integrated with Vura Bank</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">9. Termination</h2>
                <p className="text-gray-700">
                  Vura Bank reserves the right to suspend or terminate your account for:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
                  <li>Violation of these terms</li>
                  <li>Suspicious or fraudulent activity</li>
                  <li>Regulatory requirements</li>
                  <li>At your request with 30 days notice</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">10. Contact Information</h2>
                <p className="text-gray-700">
                  For questions about these terms, contact us:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
                  <li>Email: legal@vura.ng</li>
                  <li>Phone: +234 800 VURA BANK</li>
                  <li>Address: Vura Bank HQ, Lagos, Nigeria</li>
                </ul>
              </section>

              <div className="pt-6 border-t">
                <p className="text-xs text-gray-500">
                  By using Vura Bank, you acknowledge that you have read, understood, and agree to be 
                  bound by these Terms of Service. These terms are governed by the laws of the Federal 
                  Republic of Nigeria.
                </p>
              </div>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};
