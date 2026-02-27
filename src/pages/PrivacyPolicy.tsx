import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const PrivacyPolicy: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-green-600" />
          <h1 className="text-2xl font-bold">Privacy Policy</h1>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vura Bank Privacy Policy</CardTitle>
          <p className="text-sm text-gray-500">Last updated: February 27, 2024</p>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px] pr-4">
            <div className="space-y-6 text-sm leading-relaxed">
              <section>
                <h2 className="text-lg font-semibold mb-2">1. Introduction</h2>
                <p className="text-gray-700">
                  Vura Bank Limited ("we," "our," or "us") is committed to protecting your privacy. 
                  This Privacy Policy explains how we collect, use, disclose, and safeguard your 
                  information when you use our mobile banking application and services. This policy 
                  complies with the Nigeria Data Protection Regulation (NDPR) and Central Bank of 
                  Nigeria (CBN) guidelines.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">2. Information We Collect</h2>
                <p className="text-gray-700">We collect the following types of information:</p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
                  <li><strong>Personal Information:</strong> Name, phone number, email address, BVN, NIN</li>
                  <li><strong>Financial Information:</strong> Account balances, transaction history, bank account details</li>
                  <li><strong>Device Information:</strong> Device ID, IP address, operating system, browser type</li>
                  <li><strong>Biometric Data:</strong> Fingerprint or facial recognition (with your consent)</li>
                  <li><strong>Location Data:</strong> GPS location for fraud prevention (optional)</li>
                  <li><strong>Usage Data:</strong> App usage patterns, login times, feature preferences</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">3. How We Collect Information</h2>
                <p className="text-gray-700">We collect information through:</p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
                  <li>Direct input when you register or use our services</li>
                  <li>Automated technologies (cookies, web beacons, analytics)</li>
                  <li>Third-party verification services (BVN/NIN validation)</li>
                  <li>Payment processors and banking partners</li>
                  <li>Device permissions you grant (camera, contacts, location)</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">4. How We Use Your Information</h2>
                <p className="text-gray-700">We use your information to:</p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
                  <li>Provide and maintain banking services</li>
                  <li>Process transactions and send notifications</li>
                  <li>Verify your identity and prevent fraud</li>
                  <li>Comply with legal and regulatory requirements</li>
                  <li>Improve our services and user experience</li>
                  <li>Communicate with you about your account</li>
                  <li>Detect and prevent money laundering and terrorist financing</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">5. Data Security</h2>
                <p className="text-gray-700">
                  We implement industry-standard security measures to protect your data:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
                  <li>AES-256 encryption for all sensitive data</li>
                  <li>PCI-DSS Level 1 compliance for card data</li>
                  <li>Multi-factor authentication (MFA)</li>
                  <li>Regular security audits and penetration testing</li>
                  <li>Secure data centers with 24/7 monitoring</li>
                  <li>Employee background checks and data access controls</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">6. Data Sharing and Disclosure</h2>
                <p className="text-gray-700">We may share your information with:</p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
                  <li><strong>Regulatory Bodies:</strong> CBN, NDIC, EFCC, NFIU (as required by law)</li>
                  <li><strong>Payment Partners:</strong> Paystack, Monnify, YellowCard (for transaction processing)</li>
                  <li><strong>Identity Verification:</strong> NIMC, BVN validation services</li>
                  <li><strong>Service Providers:</strong> Cloud hosting, SMS, email delivery</li>
                  <li><strong>Law Enforcement:</strong> When required by court order or legal process</li>
                </ul>
                <p className="text-gray-700 mt-2">
                  We never sell your personal information to third parties for marketing purposes.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">7. Your Rights (NDPR Compliance)</h2>
                <p className="text-gray-700">Under Nigerian data protection law, you have the right to:</p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
                  <li>Access your personal data</li>
                  <li>Correct inaccurate or incomplete data</li>
                  <li>Request deletion of your data (subject to legal retention requirements)</li>
                  <li>Object to certain processing activities</li>
                  <li>Withdraw consent for optional data processing</li>
                  <li>Data portability (receive your data in a structured format)</li>
                  <li>Lodge complaints with the Nigeria Data Protection Bureau (NDPB)</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">8. Data Retention</h2>
                <p className="text-gray-700">
                  We retain your data for as long as necessary to:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
                  <li>Provide our services (active account period)</li>
                  <li>Comply with legal obligations (minimum 7 years for financial records)</li>
                  <li>Resolve disputes and enforce agreements</li>
                  <li>Prevent fraud and maintain security</li>
                </ul>
                <p className="text-gray-700 mt-2">
                  After account closure, we retain minimal data for legal compliance and fraud prevention.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">9. Cookies and Tracking</h2>
                <p className="text-gray-700">
                  We use cookies and similar technologies to:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
                  <li>Maintain your session and authentication</li>
                  <li>Remember your preferences</li>
                  <li>Analyze app usage and improve performance</li>
                  <li>Detect and prevent security threats</li>
                </ul>
                <p className="text-gray-700 mt-2">
                  You can manage cookie preferences through your device settings.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">10. International Data Transfers</h2>
                <p className="text-gray-700">
                  Your data is primarily stored and processed in Nigeria. In limited cases, 
                  we may transfer data to other countries (e.g., cloud hosting providers), 
                  but only with adequate protection measures and in compliance with NDPR requirements.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">11. Children's Privacy</h2>
                <p className="text-gray-700">
                  Our services are not intended for individuals under 18 years of age. We do not 
                  knowingly collect data from children. If you believe we have collected data from 
                  a minor, please contact us immediately.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">12. Changes to This Policy</h2>
                <p className="text-gray-700">
                  We may update this Privacy Policy periodically. We will notify you of significant 
                  changes through the app or email. Continued use of our services after changes 
                  constitutes acceptance of the updated policy.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">13. Contact Us</h2>
                <p className="text-gray-700">
                  For privacy-related questions or to exercise your rights, contact:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
                  <li>Email: privacy@vura.ng</li>
                  <li>Phone: +234 800 VURA BANK</li>
                  <li>Address: Vura Bank HQ, Lagos, Nigeria</li>
                  <li>Data Protection Officer: dpo@vura.ng</li>
                </ul>
              </section>

              <div className="pt-6 border-t">
                <p className="text-xs text-gray-500">
                  By using Vura Bank, you acknowledge that you have read and understood this 
                  Privacy Policy. This policy is governed by the laws of the Federal Republic 
                  of Nigeria and the Nigeria Data Protection Regulation (NDPR) 2019.
                </p>
              </div>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};
