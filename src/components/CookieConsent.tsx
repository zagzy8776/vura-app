import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Cookie, X, Shield } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface CookiePreferences {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
}

export const CookieConsent: React.FC = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>({
    necessary: true,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    // Check if user has already made a choice
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) {
      setShowBanner(true);
    } else {
      setPreferences(JSON.parse(consent));
    }
  }, []);

  const handleAcceptAll = () => {
    const allAccepted = {
      necessary: true,
      analytics: true,
      marketing: true,
    };
    localStorage.setItem('cookie-consent', JSON.stringify(allAccepted));
    setPreferences(allAccepted);
    setShowBanner(false);
  };

  const handleAcceptNecessary = () => {
    const necessaryOnly = {
      necessary: true,
      analytics: false,
      marketing: false,
    };
    localStorage.setItem('cookie-consent', JSON.stringify(necessaryOnly));
    setPreferences(necessaryOnly);
    setShowBanner(false);
  };

  const handleSavePreferences = () => {
    localStorage.setItem('cookie-consent', JSON.stringify(preferences));
    setShowPreferences(false);
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <>
      {/* Cookie Banner */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-50 p-4 md:p-6">
        <div className="container mx-auto max-w-6xl">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <div className="bg-blue-100 p-2 rounded-full shrink-0">
                <Cookie className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">
                  We value your privacy
                </h3>
                <p className="text-sm text-gray-600 max-w-2xl">
                  We use cookies to enhance your experience, analyze site traffic, and 
                  assist in our marketing efforts. By clicking "Accept All", you consent 
                  to our use of cookies.{' '}
                  <button
                    onClick={() => setShowPreferences(true)}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    Manage preferences
                  </button>
                </p>
              </div>
            </div>
            
            <div className="flex gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAcceptNecessary}
              >
                Necessary Only
              </Button>
              <Button
                size="sm"
                onClick={handleAcceptAll}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Accept All
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowBanner(false)}
                className="shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Preferences Dialog */}
      <Dialog open={showPreferences} onOpenChange={setShowPreferences}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              Cookie Preferences
            </DialogTitle>
            <DialogDescription>
              Manage your cookie preferences below. Necessary cookies are always enabled.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Necessary Cookies */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="font-medium">Necessary Cookies</Label>
                <p className="text-xs text-gray-500">
                  Required for the app to function properly
                </p>
              </div>
              <Switch checked={preferences.necessary} disabled />
            </div>

            {/* Analytics Cookies */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="font-medium">Analytics Cookies</Label>
                <p className="text-xs text-gray-500">
                  Help us improve our app by collecting usage data
                </p>
              </div>
              <Switch
                checked={preferences.analytics}
                onCheckedChange={(checked) =>
                  setPreferences({ ...preferences, analytics: checked })
                }
              />
            </div>

            {/* Marketing Cookies */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="font-medium">Marketing Cookies</Label>
                <p className="text-xs text-gray-500">
                  Used to deliver personalized advertisements
                </p>
              </div>
              <Switch
                checked={preferences.marketing}
                onCheckedChange={(checked) =>
                  setPreferences({ ...preferences, marketing: checked })
                }
              />
            </div>

            <div className="bg-gray-50 p-3 rounded-lg text-xs text-gray-600">
              <p>
                You can change your preferences at any time. Learn more in our{' '}
                <a href="/privacy" className="text-blue-600 hover:underline">
                  Privacy Policy
                </a>
                .
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowPreferences(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              onClick={handleSavePreferences}
            >
              Save Preferences
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
